// SPDX-License-Identifier: CC0-1.0
// When an action throws, the message handed back to the model says what went wrong. It must not carry a stack
// trace: a stack names files by their full path on the machine running the bot, which gives away the home
// folder (often the person's name) to the model provider, and it means nothing to the model anyway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ActionManager } from '../src/agent/action_manager.js';

function manager() {
    const bot = Object.assign(new EventEmitter(), { output: '', interrupt_code: false });
    const agent = { bot, clearBotLogs: () => { bot.output = ''; bot.interrupt_code = false; }, requestInterrupt: () => {} };
    return new ActionManager(agent);
}

test('a failed action reports the error without a stack trace line', async () => {
    const quiet = console.error;
    console.error = () => {}; // the stack is still logged to the console, which stays on the machine
    try {
        const result = await manager().runAction('test:fail', async () => { throw new Error('Could not reach the chest.'); });
        assert.equal(result.success, false);
        assert.match(result.message, /Could not reach the chest\./, 'the error itself is reported');
        assert.doesNotMatch(result.message, /Stack trace/);
        assert.doesNotMatch(result.message, /undefined/);
        assert.doesNotMatch(result.message, /\n\s+at /, 'no stack frames');
    } finally {
        console.error = quiet;
    }
});
