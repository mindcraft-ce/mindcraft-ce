import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AgentProcess, nextRestartPlan } from '../src/process/agent_process.js';

class FakeChild extends EventEmitter {
    constructor() {
        super();
        this.signals = [];
    }

    kill(signal) {
        this.signals.push(signal);
        return true;
    }
}

test('restart plan uses bounded exponential backoff', () => {
    let plan = nextRestartPlan([], 1000, { maxRestarts: 3, baseDelayMs: 100, windowMs: 1000 });
    assert.equal(plan.allowed, true);
    assert.equal(plan.delayMs, 100);

    plan = nextRestartPlan([900], 1000, { maxRestarts: 3, baseDelayMs: 100, windowMs: 1000 });
    assert.equal(plan.delayMs, 200);

    plan = nextRestartPlan([800, 900, 950], 1000, { maxRestarts: 3, baseDelayMs: 100, windowMs: 1000 });
    assert.equal(plan.allowed, false);
});

test('spawned agents receive only their per-process MindServer credential', () => {
    const child = new FakeChild();
    let spawnOptions;
    const supervisor = new AgentProcess('Andy', 8080, {
        processToken: 'agent-secret',
        spawnFn: (_exe, _args, options) => {
            spawnOptions = options;
            return child;
        },
    });

    supervisor.start(false, null, 0);
    assert.equal(spawnOptions.env.MINDCRAFT_AGENT_TOKEN, 'agent-secret');
});

test('ordinary terminal child failures do not exit the parent', () => {
    const child = new FakeChild();
    const exits = [];
    const timers = [];
    const supervisor = new AgentProcess('Andy', 8080, {
        spawnFn: () => child,
        exitFn: code => exits.push(code),
        now: () => 1000,
        setTimer: (fn, ms) => {
            timers.push({ fn, ms });
            return timers.length;
        },
        clearTimer: () => {},
    });

    supervisor.start(false, null, 0);
    child.emit('exit', 4, null);

    assert.deepEqual(exits, []);
    assert.equal(supervisor.state, 'restarting');
    assert.equal(timers[0].ms, 500);
});

test('task terminal exit codes still propagate to the parent', () => {
    const child = new FakeChild();
    const exits = [];
    const supervisor = new AgentProcess('TaskBot', 8080, {
        exitParentOnTerminalCode: true,
        spawnFn: () => child,
        exitFn: code => exits.push(code),
    });

    supervisor.start(false, null, 0);
    child.emit('exit', 4, null);

    assert.deepEqual(exits, [4]);
    assert.equal(supervisor.state, 'stopped');
});

test('force restart escalates a stuck graceful stop to SIGKILL', () => {
    const child = new FakeChild();
    let escalation;
    const supervisor = new AgentProcess('Andy', 8080, {
        spawnFn: () => child,
        setTimer: fn => {
            escalation = fn;
            return 1;
        },
        clearTimer: () => {},
        stopEscalationMs: 1,
    });

    supervisor.start(false, null, 0);
    supervisor.forceRestart();
    assert.deepEqual(child.signals, ['SIGINT']);

    escalation();
    assert.deepEqual(child.signals, ['SIGINT', 'SIGKILL']);
});
