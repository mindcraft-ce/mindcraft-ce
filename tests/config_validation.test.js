import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentConfig, validateSettings } from '../src/utils/config.js';

const spec = {
    enabled: { type: 'boolean', default: false },
    port: { type: 'number', required: true },
    mode: { type: 'string', options: ['safe', 'fast'], default: 'safe' },
    names: { type: 'array', default: [] },
    task: { type: 'object', default: null },
};

test('validateSettings applies defaults and enforces declared types/options', () => {
    assert.deepEqual(validateSettings({ port: 8080 }, spec), {
        enabled: false,
        port: 8080,
        mode: 'safe',
        names: [],
        task: null,
    });
    assert.throws(() => validateSettings({ port: '8080' }, spec), /type number/);
    assert.throws(() => validateSettings({ port: 8080, mode: 'unsafe' }, spec), /must be one of/);
});

test('validateSettings rejects unknown keys by default', () => {
    assert.throws(() => validateSettings({ port: 8080, surprise: true }, spec), /Unknown settings/);
});

test('createAgentConfig deeply freezes a validated copy', () => {
    const input = { port: 8080, names: ['Andy'] };
    const config = createAgentConfig(input, spec);
    input.names.push('MutatedLater');

    assert.deepEqual(config.names, ['Andy']);
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.isFrozen(config.names), true);
});
