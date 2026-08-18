import test from 'node:test';
import assert from 'node:assert/strict';
import { Coder } from '../src/agent/coder.js';

test('coder readiness loads both generated-code templates before use', async () => {
    const coder = Object.create(Coder.prototype);
    coder.code_template = '';
    coder.code_lint_template = '';
    coder.ready = null;

    await Promise.all([coder._ensureReady(), coder._ensureReady()]);

    assert.match(coder.code_template, /\/\* CODE HERE \*\//);
    assert.match(coder.code_lint_template, /\/\* CODE HERE \*\//);
    assert.ok(coder.ready instanceof Promise);
});
