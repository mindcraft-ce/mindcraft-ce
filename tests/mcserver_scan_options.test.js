import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveScanOptions } from '../src/mindcraft/mcserver.js';

test('LAN scan options expose safe defaults and allow bounded overrides', () => {
    assert.deepEqual(resolveScanOptions(), {
        startPort: 49000,
        endPort: 65000,
        concurrency: 64,
        pingTimeout: 200,
    });
    assert.deepEqual(resolveScanOptions({ startPort: 50000, endPort: 50010, concurrency: 4, pingTimeout: 500 }), {
        startPort: 50000,
        endPort: 50010,
        concurrency: 4,
        pingTimeout: 500,
    });
});

test('LAN scan options reject invalid bounds', () => {
    assert.throws(() => resolveScanOptions({ startPort: 0 }), /port range/);
    assert.throws(() => resolveScanOptions({ startPort: 60000, endPort: 50000 }), /port range/);
    assert.throws(() => resolveScanOptions({ concurrency: 0 }), /concurrency/);
    assert.throws(() => resolveScanOptions({ pingTimeout: 0 }), /pingTimeout/);
});
