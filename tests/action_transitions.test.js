import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ActionManager } from '../src/agent/action_manager.js';

async function flush() {
    for (let index = 0; index < 25; index++) await Promise.resolve();
}

function setup(t) {
    for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, () => {});
    const gates = [];
    const tasks = [];
    const kills = [];
    const starts = [];
    const bot = Object.assign(new EventEmitter(), { output: '', interrupt_code: false });
    let active = 0;
    let peak = 0;
    let interrupts = 0;
    let onInterrupt = () => {};
    const agent = {
        bot,
        clearBotLogs() { bot.output = ''; bot.interrupt_code = false; },
        requestInterrupt() { interrupts++; bot.interrupt_code = true; onInterrupt(); },
        cleanKill(message) { kills.push(message); },
        history: { add: () => Promise.resolve() },
        self_prompter: { isActive: () => false },
        isIdle: () => !manager.executing,
    };
    const manager = new ActionManager(agent);
    function action(label) {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        gates.push(release);
        return {
            release,
            fn: async () => {
                active++; peak = Math.max(peak, active); starts.push(label);
                try { await gate; } finally { active--; }
            },
        };
    }
    function track(promise) {
        tasks.push(promise);
        promise.catch(() => {});
        return promise;
    }
    function run(label, fixture, options = {}) {
        return track(manager.runAction(label, fixture.fn, { timeout: -1, ...options }));
    }
    t.after(async () => {
        onInterrupt = () => {};
        for (const release of gates) release();
        await Promise.allSettled(tasks);
    });
    return {
        manager, agent, bot, action, run, track, kills, starts,
        get active() { return active; }, get peak() { return peak; },
        get interrupts() { return interrupts; },
        set onInterrupt(callback) { onInterrupt = callback; },
    };
}

test('same-turn starts cannot run concurrently or report false idle', async t => {
    const f = setup(t);
    const first = f.action('first'); const second = f.action('second');
    const firstResult = f.run('first', first);
    const secondResult = f.run('second', second);
    await flush();
    assert.equal(f.active, 1);
    assert.equal(f.peak, 1);
    assert.deepEqual(f.starts, ['second']);
    assert.equal((await firstResult).interrupted, true);
    first.release();
    assert.equal(f.manager.executing, true);
    assert.equal(f.manager.currentActionLabel, 'second');
    second.release(); await secondResult;
    assert.equal(f.manager.executing, false);
});

test('replacement requests coalesce while the active action is stopping', async t => {
    const f = setup(t);
    const first = f.action('first'); const second = f.action('second'); const third = f.action('third');
    const firstResult = f.run('first', first); await flush();
    const secondResult = f.run('second', second);
    const thirdResult = f.run('third', third); await flush();
    assert.equal(f.interrupts, 1);
    assert.deepEqual(f.starts, ['first']);
    first.release(); await firstResult; await flush();
    assert.equal((await secondResult).interrupted, true);
    assert.deepEqual(f.starts, ['first', 'third']);
    assert.equal(f.peak, 1);
    assert.equal(f.manager.currentActionLabel, 'third');
    third.release(); await thirdResult;
});

test('manual stop cancels a pending start before it acquires ownership', async t => {
    const f = setup(t); const first = f.action('first');
    const pending = f.run('first', first);
    await f.manager.stop();
    assert.equal((await pending).interrupted, true);
    assert.deepEqual(f.starts, []);
    assert.equal(f.manager.executing, false);
});

test('manual stop cancels a replacement waiting for the current action', async t => {
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    const firstResult = f.run('first', first); await flush();
    const pending = f.run('next', next);
    const stopping = f.track(f.manager.stop()); await flush();
    first.release(); await Promise.all([firstResult, stopping]);
    assert.equal((await pending).interrupted, true);
    assert.deepEqual(f.starts, ['first']);
    assert.equal(f.manager.executing, false);
});

test('concurrent stop calls share one watchdog and interrupt operation', async t => {
    const f = setup(t); const first = f.action('first');
    const result = f.run('first', first); await flush();
    const stop1 = f.track(f.manager.stop()); const stop2 = f.track(f.manager.stop());
    assert.equal(stop1, stop2);
    await flush(); assert.equal(f.interrupts, 1);
    first.release(); await Promise.all([result, stop1, stop2]);
});

test('a completed stop does not follow a replacement action', async t => {
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    const firstResult = f.run('first', first); await flush();
    let stopped = false;
    const stopping = f.track(f.manager.stop().then(() => { stopped = true; }));
    const nextResult = f.run('next', next); await flush();
    first.release(); await firstResult; await flush();
    assert.equal(stopped, true);
    assert.equal(f.manager.executing, true);
    assert.equal(f.manager.currentActionLabel, 'next');
    assert.deepEqual(f.starts, ['first', 'next']);
    next.release(); await Promise.all([stopping, nextResult]);
});

test('resume completion cannot erase a replacement started by an idle handler', async t => {
    const f = setup(t); const resumed = f.action('follow'); const next = f.action('next');
    let replacement;
    f.bot.once('idle', () => { replacement = f.run('next', next); });
    const result = f.run('follow', resumed, { resume: true }); await flush();
    resumed.release(); await result; await flush();
    assert.equal(f.manager.currentActionLabel, 'next');
    assert.equal(f.manager.currentActionFn, next.fn);
    assert.equal(f.manager.executing, true);
    next.release(); await replacement;
});

test('cancelResume prevents a waiting resumable action from starting', async t => {
    const f = setup(t); const first = f.action('first'); const follow = f.action('follow');
    const firstResult = f.run('first', first); await flush();
    const pending = f.run('follow', follow, { resume: true }); await flush();
    f.manager.cancelResume(); first.release(); await firstResult;
    assert.equal((await pending).interrupted, true);
    assert.deepEqual(f.starts, ['first']);
    assert.equal(f.manager.executing, false);
});

test('automatic resume does not displace a pending manual action', async t => {
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    const firstResult = f.run('first', first, { resume: true }); await flush();
    const nextResult = f.run('next', next);
    const resumed = await f.manager.resumeAction();
    assert.equal(resumed.success, false);
    first.release(); await firstResult; await flush();
    assert.equal(f.manager.currentActionLabel, 'next');
    assert.equal(f.peak, 1);
    next.release(); await nextResult;
});

test('action failure preserves its stack and cannot clobber an idle replacement', async t => {
    const f = setup(t); const next = f.action('next');
    const error = new Error('action failed'); error.stack = 'test stack trace';
    let replacement;
    f.bot.once('idle', () => { replacement = f.run('next', next); });
    const result = await f.track(f.manager.runAction('fails', () => Promise.reject(error), { timeout: -1 }));
    await flush();
    assert.equal(result.success, false);
    assert.match(result.message, /test stack trace/);
    assert.equal(f.manager.currentActionLabel, 'next');
    assert.equal(f.manager.executing, true);
    next.release(); await replacement;
});

test('an interruption exception leaves the running action owned and clears its watchdog', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    const firstResult = f.run('first', first); await flush();
    f.bot.output = 'original output';
    f.onInterrupt = () => { throw new Error('plugin stop failed'); };
    const result = await f.run('next', next);
    assert.equal(result.success, false);
    assert.equal(f.manager.executing, true);
    assert.equal(f.manager.currentActionLabel, 'first');
    assert.equal(f.bot.output, 'original output');
    t.mock.timers.tick(10000); assert.deepEqual(f.kills, []);
    first.release(); await firstResult;
});

test('a genuinely stuck action still reaches the watchdog once with its original label', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = setup(t); const first = f.action('stuck');
    const result = f.run('mode:self_defense', first); await flush();
    const stop1 = f.track(f.manager.stop()); const stop2 = f.track(f.manager.stop()); await flush();
    t.mock.timers.tick(10000); await flush();
    assert.equal(f.kills.length, 1);
    assert.match(f.kills[0], /mode:self_defense/);
    first.release(); await Promise.all([result, stop1, stop2]);
});

test('a stopped action cannot leave a watchdog targeting its replacement', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    const result = f.run('first', first); await flush();
    const stopping = f.track(f.manager.stop());
    const replacement = f.run('next', next); await flush();
    first.release(); await result; await flush();
    t.mock.timers.tick(10000); await flush();
    assert.deepEqual(f.kills, []);
    assert.equal(f.manager.currentActionLabel, 'next');
    next.release(); await Promise.all([stopping, replacement]);
});

test('timeout status belongs to one action and resets for the next action', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    const result = f.run('first', first, { timeout: 1 }); await flush();
    f.onInterrupt = first.release;
    t.mock.timers.tick(60000); await flush();
    assert.equal((await result).timedout, true);
    f.onInterrupt = () => {};
    const replacement = f.run('next', next); await flush();
    assert.equal(f.manager.timedout, false);
    assert.equal(f.manager.currentActionLabel, 'next');
    next.release(); assert.equal((await replacement).timedout, false);
});

test('bursts of superseded starts do not trip the infinite-action-loop guard', async t => {
    const f = setup(t); const first = f.action('first');
    const result = f.run('first', first); await flush();
    const actions = Array.from({ length: 20 }, (_, index) => f.action(`mode:${index}`));
    const pending = actions.map((action, index) => f.run(`mode:${index}`, action));
    first.release(); await result; await flush();
    assert.deepEqual(f.kills, []);
    assert.deepEqual(f.starts, ['first', 'mode:19']);
    assert.equal(f.peak, 1);
    actions.at(-1).release(); await Promise.all(pending);
});


test('a later stop can retry after a plugin interruption error', async t => {
    const f = setup(t); const first = f.action('first');
    const result = f.run('first', first); await flush();
    f.onInterrupt = () => { throw new Error('temporary plugin error'); };
    await assert.rejects(f.manager.stop(), /temporary plugin error/);
    f.onInterrupt = first.release;
    await f.manager.stop(); await result;
    assert.equal(f.interrupts, 2);
    assert.equal(f.manager.executing, false);
});

test('a reentrant stop from a plugin callback shares the current stop', async t => {
    const f = setup(t); const first = f.action('first');
    const result = f.run('first', first); await flush();
    let nested;
    f.onInterrupt = () => {
        f.onInterrupt = () => {};
        nested = f.track(f.manager.stop());
        first.release();
    };
    const stopping = f.track(f.manager.stop());
    await stopping; await result;
    assert.equal(nested, stopping);
    assert.equal(f.interrupts, 1);
});

test('a stale timeout callback cannot interrupt or time out a new owner', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = setup(t); const first = f.action('first'); const next = f.action('next');
    let expiredCallback;
    const schedule = globalThis.setTimeout;
    t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
        if (ms === 60000) expiredCallback = callback;
        return schedule(callback, ms, ...args);
    });
    const result = f.run('first', first, { timeout: 1 }); await flush();
    first.release(); await result;
    const replacement = f.run('next', next); await flush();
    expiredCallback(); await flush();
    assert.equal(f.manager.currentActionLabel, 'next');
    assert.equal(f.manager.timedout, false);
    assert.equal(f.interrupts, 0);
    assert.deepEqual(f.kills, []);
    next.release(); await replacement;
});

test('a non-Error rejection still reports failure and releases ownership', async t => {
    const f = setup(t);
    const result = await f.track(f.manager.runAction('fails', () => Promise.reject(null), { timeout: -1 }));
    assert.equal(result.success, false);
    assert.match(result.message, /Error: null/);
    assert.equal(f.manager.executing, false);
});

test('genuine rapid completed action loops retain the shutdown safeguard', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    const f = setup(t);
    for (let index = 0; index < 7; index++)
        await f.track(f.manager.runAction('loop', () => Promise.resolve(), { timeout: -1 }));
    assert.equal(f.kills.length, 1);
    assert.match(f.kills[0], /Infinite action loop detected/);
    assert.equal(f.manager.executing, false);
});

test('an interrupted action failure cannot cancel a newer resume registration', async t => {
    const f = setup(t); const first = f.action('first'); const follow = f.action('follow');
    const original = first.fn;
    first.fn = async () => { await original(); throw new Error('PathStopped'); };
    const result = f.run('first', first); await flush();
    const replacement = f.run('follow', follow, { resume: true }); await flush();
    first.release(); await result; await flush();
    assert.deepEqual(f.starts, ['first', 'follow']);
    assert.equal(f.manager.currentActionLabel, 'follow');
    assert.equal(f.manager.resume_func, follow.fn);
    follow.release(); await replacement;
});

test('a failed resumed action still cancels its own resume registration', async t => {
    const f = setup(t);
    const result = await f.track(f.manager.runAction('follow', () => Promise.reject(new Error('failure')), { resume: true, timeout: -1 }));
    assert.equal(result.success, false);
    assert.equal(f.manager.resume_func, null);
});
