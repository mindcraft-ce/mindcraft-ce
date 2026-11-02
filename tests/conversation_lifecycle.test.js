import test from 'node:test';
import assert from 'node:assert/strict';
import { Conversation, compileInMessages } from '../src/agent/conversation.js';

test('reset clears a scheduled inbound timer and queued messages', async () => {
    const convo = new Conversation('OtherBot');
    let fired = false;
    convo.queue({ message: 'stale' });
    convo.inMessageTimer = setTimeout(() => { fired = true; }, 10);

    convo.reset();
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(fired, false);
    assert.equal(convo.inMessageTimer, null);
    assert.deepEqual(convo.in_queue, []);
    assert.equal(convo.active, false);
    assert.equal(convo.ignore_until_start, false);
});

test('compileInMessages preserves message boundaries and the final envelope flags', () => {
    const convo = new Conversation('OtherBot');
    convo.queue({ message: 'first', start: true, end: false });
    convo.queue({ message: 'second', start: false, end: true });

    const compiled = compileInMessages(convo);

    assert.equal(compiled.message, 'first\nsecond');
    assert.equal(compiled.start, false);
    assert.equal(compiled.end, true);
    assert.deepEqual(convo.in_queue, []);
});
