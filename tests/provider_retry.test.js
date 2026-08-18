import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderErrorKind, withProviderRetries } from '../src/models/provider_error.js';

test('withProviderRetries retries transient failures and returns the eventual result', async () => {
    let attempts = 0;
    const result = await withProviderRetries(async () => {
        attempts++;
        if (attempts < 3) {
            const error = new Error('temporarily unavailable');
            error.status = 503;
            throw error;
        }
        return 'ok';
    }, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 });

    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
});

test('withProviderRetries does not retry non-retryable failures', async () => {
    let attempts = 0;
    await assert.rejects(
        withProviderRetries(async () => {
            attempts++;
            const error = new Error('Unauthorized');
            error.status = 401;
            throw error;
        }, { maxAttempts: 3, baseDelayMs: 1 }),
        error => error.kind === ProviderErrorKind.AUTH && error.retryable === false
    );
    assert.equal(attempts, 1);
});

test('cancellation interrupts retry backoff immediately', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const pending = withProviderRetries(async () => {
        attempts++;
        const error = new Error('temporarily unavailable');
        error.status = 503;
        throw error;
    }, {
        maxAttempts: 5,
        baseDelayMs: 10000,
        maxDelayMs: 10000,
        signal: controller.signal,
    });

    setTimeout(() => controller.abort('superseded'), 10);

    await assert.rejects(
        pending,
        error => error.kind === ProviderErrorKind.CANCELLED && error.retryable === false
    );
    assert.equal(attempts, 1);
});
