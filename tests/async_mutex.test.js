import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncMutex } from '../src/utils/async_mutex.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('AsyncMutex serializes concurrent operations in arrival order', async () => {
    const mutex = new AsyncMutex();
    const events = [];

    await Promise.all([
        mutex.runExclusive(async () => {
            events.push('a:start');
            await delay(20);
            events.push('a:end');
        }),
        mutex.runExclusive(() => {
            events.push('b:start');
            events.push('b:end');
        }),
    ]);

    assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
    assert.equal(mutex.isLocked(), false);
});

test('AsyncMutex releases ownership after a thrown operation', async () => {
    const mutex = new AsyncMutex();
    await assert.rejects(mutex.runExclusive(() => {
        throw new Error('boom');
    }), /boom/);

    const value = await mutex.runExclusive(() => 42);
    assert.equal(value, 42);
});
