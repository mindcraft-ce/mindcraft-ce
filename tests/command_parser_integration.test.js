import test from 'node:test';
import assert from 'node:assert/strict';
import {
    containsCommand,
    parseCommandMessage,
    truncCommandMessage,
} from '../src/agent/commands/index.js';
import { structuredCommandLimits } from '../src/agent/commands/structured_parser.js';

test('command parsing accepts escaped structured strings and validates against command schema', () => {
    const parsed = parseCommandMessage('prefix !rememberHere("home, \\"base\\"") trailing');
    assert.deepEqual(parsed, {
        commandName: '!rememberHere',
        args: ['home, "base"'],
    });
});

test('structured numeric arguments retain existing command domain validation', () => {
    const parsed = parseCommandMessage('!goToCoordinates(1.5, 64, -3, 2)');
    assert.deepEqual(parsed, {
        commandName: '!goToCoordinates',
        args: [1.5, 64, -3, 2],
    });

    assert.match(
        parseCommandMessage('!goToCoordinates(1, 400, 3, 1)'),
        /must be an element/
    );
});

test('command detection and truncation use structured command boundaries', () => {
    const message = 'do this !rememberHere("a, b") and ignore this !stop';
    assert.equal(containsCommand(message), '!rememberHere');
    assert.equal(truncCommandMessage(message), 'do this !rememberHere("a, b")');
});

test('integrated command parsing rejects oversized input', () => {
    const oversized = '!rememberHere("' + 'x'.repeat(structuredCommandLimits.maxLength) + '")';
    assert.match(parseCommandMessage(oversized), /exceeds maximum length/);
});
