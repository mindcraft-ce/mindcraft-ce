import test from 'node:test';
import assert from 'node:assert/strict';
import { sendToolRequest } from '../src/models/_tool_request.js';

// Claude 4.6 and later on the native tool path: no request may end on an assistant turn, thinking counts
// toward max_tokens, and a declined request says so instead of looking like an empty reply.

const tools = [{type: 'function', function: {name: 'stats', description: 'Stats', parameters: {type: 'object', properties: {}}}}];
function claude(reply, params) {
    const packs = [];
    const provider = {model_name: 'claude-test', params, anthropic: {messages: {create: pack => {
        packs.push(structuredClone(pack));
        return Promise.resolve(reply);
    }}}};
    return {provider, packs};
}
const ok = {content: [{type: 'text', text: 'ok'}], stop_reason: 'end_turn'};

test('a conversation ending on the bot\'s own turn is closed with a user turn', async () => {
    const {provider, packs} = claude(ok);
    await sendToolRequest(provider, [{role: 'user', content: 'Steve: hi'}, {role: 'assistant', content: 'Hello!'}], 'SYSTEM', tools);
    assert.equal(packs[0].messages.at(-1).role, 'user');
    assert.equal(packs[0].messages.at(-2).content, 'Hello!');
});

test('the default max_tokens leaves room for thinking', async () => {
    const plain = claude(ok);
    await sendToolRequest(plain.provider, [{role: 'user', content: 'hi'}], 'SYSTEM', tools);
    assert.equal(plain.packs[0].max_tokens, 16000);
    const budget = claude(ok, {thinking: {type: 'enabled', budget_tokens: 4000}});
    await sendToolRequest(budget.provider, [{role: 'user', content: 'hi'}], 'SYSTEM', tools);
    assert.equal(budget.packs[0].max_tokens, 5000);
    const set = claude(ok, {max_tokens: 900});
    await sendToolRequest(set.provider, [{role: 'user', content: 'hi'}], 'SYSTEM', tools);
    assert.equal(set.packs[0].max_tokens, 900);
});

test('a declined request is reported as declined', async () => {
    const {provider} = claude({content: [], stop_reason: 'refusal', stop_details: {type: 'refusal', category: 'cyber'}});
    await assert.rejects(sendToolRequest(provider, [{role: 'user', content: 'hi'}], 'SYSTEM', tools), /declined completion: cyber/);
});
