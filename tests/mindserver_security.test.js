import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAuthorizedControlRequest,
    normalizeControlToken,
    resolveControlToken,
    resolveMindServerBindHost,
} from '../src/mindcraft/security.js';

test('MindServer binds loopback unless public hosting is explicitly enabled', () => {
    assert.equal(resolveMindServerBindHost(false), '127.0.0.1');
    assert.equal(resolveMindServerBindHost(), '127.0.0.1');
    assert.equal(resolveMindServerBindHost(true), '0.0.0.0');
});

test('public hosting fails closed without a control token', () => {
    assert.equal(resolveControlToken(false, null), null);
    assert.equal(resolveControlToken(true, ' secret '), 'secret');
    assert.throws(() => resolveControlToken(true, null), /requires MINDCRAFT_CONTROL_TOKEN/);
});

test('control token authentication fails closed and compares exact tokens', () => {
    assert.equal(isAuthorizedControlRequest('secret', 'secret'), true);
    assert.equal(isAuthorizedControlRequest('secret2', 'secret'), false);
    assert.equal(isAuthorizedControlRequest('', 'secret'), false);
    assert.equal(isAuthorizedControlRequest('secret', ''), false);
    assert.equal(isAuthorizedControlRequest({ token: 'secret' }, 'secret'), false);
});

test('control tokens reject control characters', () => {
    assert.equal(normalizeControlToken('  secret  '), 'secret');
    assert.throws(() => normalizeControlToken('bad\nsecret'), /control characters/);
});
