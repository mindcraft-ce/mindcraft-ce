import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionManager } from '../src/agent/action_manager.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function createAgent() {
    return {
        interruptRequests: 0,
        bot: {
            output: '',
            interrupt_code: null,
            emit() {},
        },
        clearBotLogs() {
            this.bot.output = '';
            this.bot.interrupt_code = null;
        },
        requestInterrupt() {
            this.interruptRequests++;
            this.bot.interrupt_code = 'interrupted';
        },
        cleanKill() {
            throw new Error('cleanKill should not be called in serialization test');
        },
        history: { add() {} },
        isIdle() { return true; },
        self_prompter: { isActive() { return false; } },
    };
}

test('ActionManager serializes concurrent runAction calls and interrupts the current owner', async () => {
    const agent = createAgent();
    const manager = new ActionManager(agent);
    const events = [];
    let active = 0;
    let maxActive = 0;

    const firstAction = async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        events.push('a:start');
        while (!agent.bot.interrupt_code) {
            await delay(1);
        }
        events.push('a:end');
        active--;
    };

    const secondAction = async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        events.push('b:start');
        events.push('b:end');
        active--;
    };

    const first = manager.runAction('a', firstAction, { timeout: 0 });
    await delay(5);
    const second = manager.runAction('b', secondAction, { timeout: 0 });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(firstResult.success, true);
    assert.equal(secondResult.success, true);
    assert.equal(maxActive, 1);
    assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
    assert.ok(agent.interruptRequests >= 1);
    assert.equal(manager.actionMutex.isLocked(), false);
});

test('concurrent stop calls share one stop operation', async () => {
    const agent = createAgent();
    const manager = new ActionManager(agent);
    manager.executing = true;

    setTimeout(() => {
        manager.executing = false;
    }, 20);

    await Promise.all([manager.stop(), manager.stop(), manager.stop()]);
    assert.equal(manager.stopPromise, null);
    assert.ok(agent.interruptRequests >= 1);
});
