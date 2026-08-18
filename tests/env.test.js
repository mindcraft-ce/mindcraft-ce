import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBooleanEnv, parseIntegerEnv, parseJsonEnv, parseJsonObjectEnv } from '../src/utils/env.js';

test('boolean parser does not treat "false" as truthy', () => {
    assert.equal(parseBooleanEnv('true'), true);
    assert.equal(parseBooleanEnv('false'), false);
    assert.equal(parseBooleanEnv('1'), true);
    assert.equal(parseBooleanEnv('0'), false);
    assert.throws(() => parseBooleanEnv('maybe'), /must be a boolean/);
});

test('integer parser enforces format and configured bounds', () => {
    assert.equal(parseIntegerEnv('42'), 42);
    assert.equal(parseIntegerEnv('-1', 'PORT', { min: -1, max: 65535 }), -1);
    assert.throws(() => parseIntegerEnv('42px'), /must be an integer/);
    assert.throws(() => parseIntegerEnv('0', 'MINDSERVER_PORT', { min: 1, max: 65535 }), /between 1 and 65535/);
    assert.throws(() => parseIntegerEnv('65536', 'PORT', { min: -1, max: 65535 }), /between -1 and 65535/);
});

test('JSON parsers include the setting name and object parser rejects arrays/null', () => {
    assert.deepEqual(parseJsonEnv('["a"]'), ['a']);
    assert.deepEqual(parseJsonObjectEnv('{"a":1}', 'SETTINGS_JSON'), { a: 1 });
    assert.throws(() => parseJsonEnv('{', 'PROFILES'), /PROFILES/);
    assert.throws(() => parseJsonObjectEnv('[]', 'SETTINGS_JSON'), /JSON object/);
    assert.throws(() => parseJsonObjectEnv('null', 'SETTINGS_JSON'), /JSON object/);
});
