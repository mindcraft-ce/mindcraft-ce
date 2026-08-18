import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderError, ProviderErrorKind } from '../src/models/provider_error.js';

test('classifyProviderError distinguishes auth and rate limiting', () => {
    const auth = classifyProviderError({ status: 401, message: 'Unauthorized' });
    assert.equal(auth.kind, ProviderErrorKind.AUTH);
    assert.equal(auth.retryable, false);

    const limited = classifyProviderError({ status: 429, message: 'Rate limit exceeded' });
    assert.equal(limited.kind, ProviderErrorKind.RATE_LIMIT);
    assert.equal(limited.retryable, true);
});

test('classifyProviderError distinguishes cancellation, timeout, context and network failures', () => {
    const cancelled = classifyProviderError({ code: 'MODEL_REQUEST_ABORTED', message: 'superseded' });
    assert.equal(cancelled.kind, ProviderErrorKind.CANCELLED);
    assert.equal(cancelled.retryable, false);

    const timeout = classifyProviderError({ code: 'MODEL_REQUEST_TIMEOUT', message: 'timed out' });
    assert.equal(timeout.kind, ProviderErrorKind.TIMEOUT);
    assert.equal(timeout.retryable, true);

    const context = classifyProviderError({ code: 'context_length_exceeded', message: 'too long' });
    assert.equal(context.kind, ProviderErrorKind.CONTEXT_LENGTH);

    const network = classifyProviderError({ code: 'ECONNRESET', message: 'socket reset' });
    assert.equal(network.kind, ProviderErrorKind.NETWORK);
    assert.equal(network.retryable, true);
});

test('classifyProviderError marks server errors retryable', () => {
    const server = classifyProviderError({ status: 503, message: 'Unavailable' });
    assert.equal(server.kind, ProviderErrorKind.SERVER);
    assert.equal(server.retryable, true);
});
