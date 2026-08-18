import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderError, ProviderErrorKind } from '../src/models/provider_error.js';
import { RequestTimeoutError } from '../src/models/request_control.js';
import {
    resolveResponseTimeoutMs,
    sendWithResponseDeadline,
    shouldRetryPromptError,
} from '../src/models/prompt_request_policy.js';

test('prompt retry policy fails fast on provider infrastructure errors', () => {
    assert.equal(shouldRetryPromptError(new ProviderError('auth', {
        kind: ProviderErrorKind.AUTH,
        retryable: false,
    })), false);
    assert.equal(shouldRetryPromptError(new RequestTimeoutError(10)), false);
    assert.equal(shouldRetryPromptError(new Error('local parse failure')), true);
});

test('response timeout defaults to provider request timeout when configured', () => {
    assert.equal(resolveResponseTimeoutMs({ params: { request_timeout_ms: 2500 } }), 2500);
    assert.equal(resolveResponseTimeoutMs({ params: { request_timeout_ms: 0 } }), 120000);
});

test('response deadline spans the whole proxied model operation', async () => {
    const model = {
        sendRequest: (_turns, _systemMessage, _stopSeq, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    };

    await assert.rejects(
        sendWithResponseDeadline(model, [], 'prompt', { timeoutMs: 10 }),
        error => error instanceof RequestTimeoutError
    );
});
