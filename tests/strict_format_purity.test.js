import test from 'node:test';
import assert from 'node:assert/strict';
import { strictFormat } from '../src/utils/text.js';

test('strictFormat does not mutate caller-owned turns', () => {
    const turns = [
        { role: 'system', content: '  rules  ' },
        { role: 'user', content: '  hello  ' },
        { role: 'assistant', content: ' one ' },
        { role: 'assistant', content: ' two ' },
    ];
    const snapshot = structuredClone(turns);

    const formatted = strictFormat(turns);

    assert.deepEqual(turns, snapshot);
    assert.notEqual(formatted[0], turns[0]);
    assert.equal(formatted[0].role, 'user');
    assert.equal(formatted[0].content, 'SYSTEM: rules\nhello');
});

test('strictFormat creates independent filler messages', () => {
    const formatted = strictFormat([
        { role: 'assistant', content: 'first' },
        { role: 'assistant', content: 'second' },
    ]);

    const fillers = formatted.filter(message => message.role === 'user' && message.content === '_');
    assert.equal(fillers.length, 2);
    assert.notEqual(fillers[0], fillers[1]);
});
