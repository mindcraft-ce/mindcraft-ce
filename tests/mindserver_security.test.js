import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isAuthorizedControlRequest,
    isLoopbackBindHost,
    normalizeBindHost,
    normalizeControlToken,
    resolveControlToken,
    resolveMindServerBindHost,
} from '../src/mindcraft/security.js';

test('MindServer binds loopback unless public hosting or an explicit bind host is configured', () => {
    assert.equal(resolveMindServerBindHost(false, null), '127.0.0.1');
    assert.equal(resolveMindServerBindHost(false, ''), '127.0.0.1');
    assert.equal(resolveMindServerBindHost(true, null), '0.0.0.0');
    assert.equal(resolveMindServerBindHost(false, ' 0.0.0.0 '), '0.0.0.0');
    assert.equal(resolveMindServerBindHost(false, '::'), '::');
});

test('loopback bind detection distinguishes local and externally reachable hosts', () => {
    assert.equal(isLoopbackBindHost('127.0.0.1'), true);
    assert.equal(isLoopbackBindHost('127.0.0.2'), true);
    assert.equal(isLoopbackBindHost('localhost'), true);
    assert.equal(isLoopbackBindHost('::1'), true);
    assert.equal(isLoopbackBindHost('0.0.0.0'), false);
    assert.equal(isLoopbackBindHost('::'), false);
});

test('bind host normalization rejects malformed values', () => {
    assert.equal(normalizeBindHost(' 127.0.0.1 '), '127.0.0.1');
    assert.throws(() => normalizeBindHost(123), /must be a string/);
    assert.throws(() => normalizeBindHost('bad\nhost'), /control characters/);
});

test('non-loopback hosting fails closed without a control token', () => {
    assert.equal(resolveControlToken(false, null, null), null);
    assert.equal(resolveControlToken(false, null, '127.0.0.2'), null);
    assert.equal(resolveControlToken(true, ' secret ', null), 'secret');
    assert.throws(() => resolveControlToken(true, null, null), /requires MINDCRAFT_CONTROL_TOKEN/);
    assert.throws(() => resolveControlToken(false, null, '0.0.0.0'), /requires MINDCRAFT_CONTROL_TOKEN/);
    assert.throws(() => resolveControlToken(false, null, '::'), /requires MINDCRAFT_CONTROL_TOKEN/);
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
