import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseStructuredCommand,
    truncateToStructuredCommand,
} from '../src/agent/commands/structured_parser.js';

test('structured parser handles quoted commas and escaped quotes', () => {
    const parsed = parseStructuredCommand('prefix !say("hello, \\"world\\"") trailing');
    assert.equal(parsed.commandName, '!say');
    assert.deepEqual(parsed.args, ['hello, "world"']);
});

test('structured parser supports nested JSON values', () => {
    const parsed = parseStructuredCommand('!configure({"mode":"safe","coords":[1,2,3]}, true, -4.5)');
    assert.deepEqual(parsed.args, [
        { mode: 'safe', coords: [1, 2, 3] },
        true,
        -4.5,
    ]);
});

test('structured parser preserves command boundaries for truncation', () => {
    const message = 'I will act !goToCoordinates(1, 2, 3, 1) and then explain more';
    assert.equal(
        truncateToStructuredCommand(message),
        'I will act !goToCoordinates(1, 2, 3, 1)'
    );
});

test('structured parser rejects malformed argument syntax', () => {
    assert.throws(() => parseStructuredCommand('!say("unterminated)'));
    assert.throws(() => parseStructuredCommand('!say(foo)'));
});
