import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageMeter, normalizeUsage } from '../src/models/usage.js';

// Tokens written to Claude's prompt cache are counted apart, and priced by cache_write_per_million when the
// rates give one (writes cost more than plain input). Without it nothing changes.

const claude = {usage: {input_tokens: 100, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, output_tokens: 50}};

test('cache reads and writes are told apart', () => {
    assert.deepEqual(normalizeUsage(claude), {input: 1000, output: 50, cached: 800, written: 100, cost: null});
    assert.equal(normalizeUsage({usage: {prompt_tokens: 10, completion_tokens: 2}}).written, 0);
});

test('a write rate prices writes; without one they cost plain input as before', () => {
    const rates = {input_per_million: 1, output_per_million: 10, cached_input_per_million: 0.1};
    const plain = new UsageMeter().record(claude, 'task', rates);
    assert.ok(Math.abs(plain.cost - (200 * 1 + 800 * 0.1 + 50 * 10) / 1e6) < 1e-12);
    const priced = new UsageMeter().record(claude, 'task', {...rates, cache_write_per_million: 1.25});
    assert.ok(Math.abs(priced.cost - (100 * 1 + 800 * 0.1 + 100 * 1.25 + 50 * 10) / 1e6) < 1e-12);
});

test('each role counts the tokens it wrote to the cache', () => {
    const meter = new UsageMeter();
    meter.record(claude, 'task');
    meter.record(claude, 'task');
    assert.equal(meter.snapshot().roles.task.written, 200);
    assert.equal(meter.snapshot().roles.task.cached, 1600);
});
