import test from 'node:test';
import assert from 'node:assert/strict';
import { Prompter } from '../src/models/prompter.js';

const clean = (value) => Prompter.prototype._cleanReasoningOutput(value);

test('reasoning cleanup removes hidden think content', () => {
    assert.equal(clean('<think>private</think>visible'), 'visible');
    assert.equal(clean('<think>a</think>first</think>last'), 'last');
});

test('reasoning cleanup preserves legitimate trailing markdown', () => {
    assert.equal(clean('answer\n***'), 'answer\n***');
});
