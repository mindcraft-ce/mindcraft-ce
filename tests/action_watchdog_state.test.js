import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ActionManager } from '../src/agent/action_manager.js';

function createManager() {
    const bot = Object.assign(new EventEmitter(), { output: '' });
    const agent = {
        bot,
        clearBotLogs() { bot.output = ''; },
        requestInterrupt() { bot.interrupt_code = true; },
    };
    return new ActionManager(agent);
}

test('a watchdog timeout does not leave state on the manager for later actions', async () => {
    const manager = createManager();
    const timedOut = await manager.runAction('hang', () => new Promise(() => {}), { timeout: 0.0001 });

    assert.equal(timedOut.timedout, true);
    assert.equal(timedOut.code, 'timeout');

    assert.equal(Object.hasOwn(manager, 'timedout'), false,
        'watchdog leaked timeout state onto the shared ActionManager');

    const next = await manager.runAction('quick', () => Promise.resolve('done'));
    assert.equal(next.status, 'ok');
    assert.equal(next.timedout, false);

    const second = await manager.runAction('hang again', () => new Promise(() => {}), { timeout: 0.0001 });
    assert.equal(second.timedout, true);
    assert.equal(timedOut.timedout, true);
    assert.equal(Object.hasOwn(manager, 'timedout'), false);
});

test('an action interrupted after a timeout is not reported as timed out', async () => {
    const manager = createManager();
    await manager.runAction('hang', () => new Promise(() => {}), { timeout: 0.0001 });

    let release;
    const interrupted = manager.runAction('wait', () => new Promise(resolve => { release = resolve; }), { timeout: 0 });
    while (!release) await new Promise(resolve => setImmediate(resolve));
    await manager.stop();
    const result = await interrupted;

    assert.equal(result.status, 'cancelled');
    assert.equal(result.interrupted, true);
    assert.equal(result.timedout, false);
    assert.notEqual(result.code, 'timeout');
    release();
});
