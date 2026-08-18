import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RequestAbortedError,
    RequestTimeoutError,
    abortActiveModelRequests,
    activeModelRequestCount,
    runAbortableRequest,
} from '../src/models/request_control.js';

test('runAbortableRequest forwards a live AbortSignal', async () => {
    const value = await runAbortableRequest(signal => {
        assert.equal(signal.aborted, false);
        return 42;
    }, { timeoutMs: 1000 });
    assert.equal(value, 42);
    assert.equal(activeModelRequestCount(), 0);
});

test('runAbortableRequest times out hung provider work', async () => {
    await assert.rejects(
        runAbortableRequest(() => new Promise(() => {}), { timeoutMs: 10 }),
        error => error instanceof RequestTimeoutError && error.code === 'MODEL_REQUEST_TIMEOUT'
    );
    assert.equal(activeModelRequestCount(), 0);
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
    assert.equal(activeModelRequestCount(), 0);
});

test('abortActiveModelRequests aborts every process-local active request', async () => {
    const first = runAbortableRequest(() => new Promise(() => {}), { timeoutMs: 1000 });
    const second = runAbortableRequest(() => new Promise(() => {}), { timeoutMs: 1000 });
    assert.equal(activeModelRequestCount(), 2);
    abortActiveModelRequests('shutdown');
    await Promise.all([
        assert.rejects(first, error => error instanceof RequestAbortedError && error.message === 'shutdown'),
        assert.rejects(second, error => error instanceof RequestAbortedError && error.message === 'shutdown'),
    ]);
    assert.equal(activeModelRequestCount(), 0);
});
