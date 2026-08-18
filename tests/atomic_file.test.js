import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteJson, settleAll } from '../src/utils/atomic_file.js';

test('atomicWriteJson replaces the destination without leaving temp files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mindcraft-atomic-'));
    const file = path.join(dir, 'memory.json');
    try {
        await atomicWriteJson(file, { value: 1 });
        await atomicWriteJson(file, { value: 2 });
        assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { value: 2 });
        assert.deepEqual(await readdir(dir), ['memory.json']);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('settleAll waits for every shutdown task and surfaces failures', async () => {
    const events = [];
    await settleAll([
        Promise.resolve().then(() => events.push('a')),
        Promise.resolve().then(() => events.push('b')),
    ]);
    assert.deepEqual(events.sort(), ['a', 'b']);

    await assert.rejects(
        settleAll([Promise.resolve(), Promise.reject(new Error('boom'))]),
        AggregateError
    );
});
