// SPDX-License-Identifier: CC0-1.0
// A stop that arrives while a new action is replacing the current one must stop the new one too. Starting an
// action first stops the old one, which takes a tick; a stop in that tick used to land on the old action
// only, and the new one started anyway. A start still waiting its turn behind another is cancelled the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ActionManager } from '../src/agent/action_manager.js';

function manager() {
    const bot = Object.assign(new EventEmitter(), { output: '', interrupt_code: false });
    const agent = { bot, clearBotLogs: () => { bot.output = ''; bot.interrupt_code = false; }, requestInterrupt: () => {} };
    return new ActionManager(agent);
}
const forever = () => new Promise(() => {});
const ticks = async n => { for (let i = 0; i < n; i++) await Promise.resolve(); };

test('a stop while a new action is stopping the old one cancels the new one too', async () => {
    const actions = manager();
    const old = actions.runAction('old', forever);
    await ticks(5);
    assert.equal(actions.currentActionLabel, 'old');
    let ran = false;
    const replacing = actions.runAction('new', async () => { ran = true; });
    await ticks(5); // the new start is now stopping the old action, which takes a tick
    await actions.stop();
    const result = await replacing;
    assert.equal(ran, false, 'the new action never ran');
    assert.equal(result.status, 'cancelled');
    assert.equal(result.success, false);
    assert.equal((await old).status, 'cancelled');
    assert.equal(actions.executing, false);
});

test('a stop cancels a start still waiting its turn', async () => {
    const actions = manager();
    actions.runAction('old', forever);
    await ticks(5);
    const ran = [];
    const first = actions.runAction('first', async () => { ran.push('first'); });
    const second = actions.runAction('second', async () => { ran.push('second'); });
    await actions.stop();
    assert.deepEqual([(await first).status, (await second).status], ['cancelled', 'cancelled']);
    assert.deepEqual(ran, []);
    assert.equal(actions.executing, false);
});

test('an action asked for after a stop runs as usual', async () => {
    const actions = manager();
    await actions.stop();
    const result = await actions.runAction('after', async () => true);
    assert.equal(result.status, 'ok');
});

test('a failed resumable action is not replayed on idle', async t => {
    t.mock.method(console, 'error', () => {});
    const actions = manager();
    let runs = 0;
    const result = await actions.runAction('failing resume', async () => {
        runs++;
        throw new Error('fixture failure');
    }, {resume: true, timeout: 0});
    assert.equal(result.status, 'failed');
    assert.equal((await actions.resumeAction()).success, false);
    assert.equal(runs, 1);
});

test('cancelResume clears a resumable action before it starts', async () => {
    const actions = manager();
    const pending = actions.runAction('queued resume', async () => {
        assert.fail('the cancelled action started');
    }, {resume: true, timeout: 0});
    actions.cancelResume();
    assert.equal((await pending).status, 'cancelled');
});
