// SPDX-License-Identifier: CC0-1.0
// When Novita says the conversation is too long, the provider tries again without the oldest turn. The
// retry called sendRequest as a bare name, which isn't defined in that module, so it threw instead.
// No request leaves the machine: the API client is replaced before any call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Novita } from '../src/models/novita.js';

test('a request that is too long is retried with the oldest turn left out', async () => {
    process.env.NOVITA_API_KEY ??= 'test-key-not-used';
    const novita = new Novita('some-model');
    const sent = [];
    novita.openai = { chat: { completions: { create: async pack => {
        sent.push(pack.messages.map(m => m.content).join('|'));
        if (sent.length === 1) throw Object.assign(new Error('too long'), { code: 'context_length_exceeded' });
        return { choices: [{ finish_reason: 'stop', message: { content: 'shorter worked' } }] };
    } } } };
    const turns = [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'two' }, { role: 'user', content: 'three' }];
    assert.equal(await novita.sendRequest(turns, 'system'), 'shorter worked');
    assert.equal(sent.length, 2, 'it asked twice');
    assert.match(sent[0], /one/);
    assert.doesNotMatch(sent[1], /one/, 'the second time without the oldest turn');
});
