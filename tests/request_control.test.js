import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RequestAbortedError,
    RequestTimeoutError,
    runAbortableRequest,
} from '../src/models/request_control.js';

test('runAbortableRequest forwards a live AbortSignal', async () => {
    const value = await runAbortableRequest(async signal => {
        assert.equal(signal.aborted, false);
        return 42;
    }, { timeoutMs: 1000 });
    assert.equal(value, 42);
});

test('runAbortableRequest times out hung provider work', async () => {
    await assert.rejects(
        runAbortableRequest(() => new Promise(() => {}), { timeoutMs: 10 }),
        error => error instanceof RequestTimeoutError && error.code === 'MODEL_REQUEST_TIMEOUT'
    );
});

test('runAbortableRequest propagates external cancellation', async () => {
    const controller = new AbortController();
    const pending = runAbortableRequest(() => new Promise(() => {}), {
        timeoutMs: 1000,
        signal: controller.signal,
    });
    controller.abort('superseded');

    await assert.rejects(
        pending,
        error => error instanceof RequestAbortedError && error.code === 'MODEL_REQUEST_ABORTED'
    );
});
