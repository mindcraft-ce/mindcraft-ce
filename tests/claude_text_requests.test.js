import test from 'node:test';
import assert from 'node:assert/strict';

// Claude 4.6 and later on the text path: no request may end on an assistant turn, thinking counts toward
// max_tokens, a declined request says so, and an empty reply gets one more try.

process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used';
const { Claude } = await import('../src/models/claude.js');

function claude(replies, params) {
    const model = new Claude('claude-test', null, params);
    const packs = [];
    model.anthropic = {messages: {create: pack => {
        packs.push(structuredClone(pack));
        return Promise.resolve(replies[Math.min(packs.length, replies.length) - 1]);
    }}};
    return {model, packs};
}
const text = value => ({content: [{type: 'text', text: value}], stop_reason: 'end_turn'});

test('a conversation ending on the bot\'s own turn is closed with a user turn', async () => {
    const {model, packs} = claude([text('ok')]);
    await model.sendRequest([{role: 'user', content: 'Steve: hi'}, {role: 'assistant', content: 'Hello!'}], 'SYSTEM');
    assert.equal(packs[0].messages.at(-1).role, 'user');
});

test('the default max_tokens leaves room for thinking and is not written into the shared params', async () => {
    const {model, packs} = claude([text('ok')]);
    await model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM');
    assert.equal(packs[0].max_tokens, 16000);
    assert.equal(model.params.max_tokens, undefined);
    const budget = claude([text('ok')], {thinking: {type: 'enabled', budget_tokens: 4000}});
    await budget.model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM');
    assert.equal(budget.packs[0].max_tokens, 5000);
    const set = claude([text('ok')], {max_tokens: 900});
    await set.model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM');
    assert.equal(set.packs[0].max_tokens, 900);
});

test('a declined request is reported, not taken for an empty reply', async () => {
    const {model, packs} = claude([{content: [], stop_reason: 'refusal', stop_details: {type: 'refusal', category: 'cyber'}}]);
    assert.equal(await model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM'), "Sorry, I can't respond to that.");
    assert.equal(packs.length, 1);
});

test('an empty reply is tried once more; a tab is a reply', async () => {
    const empty = {content: [{type: 'text', text: ''}], stop_reason: 'end_turn'};
    const retried = claude([empty, text('second')]);
    assert.equal(await retried.model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM'), 'second');
    assert.equal(retried.packs.length, 2);
    const twice = claude([empty, empty]);
    assert.equal(await twice.model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM'), 'No response from Claude.');
    assert.equal(twice.packs.length, 2);
    const tab = claude([text('\t')]);
    assert.equal(await tab.model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM'), '\t');
    const cut = claude([{content: [{type: 'thinking', thinking: ''}], stop_reason: 'max_tokens'}]);
    assert.equal(await cut.model.sendRequest([{role: 'user', content: 'hi'}], 'SYSTEM'), 'No response from Claude.');
    assert.equal(cut.packs.length, 1);
});
