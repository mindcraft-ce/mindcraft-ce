import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiKeyAlias } from '../src/models/gpt.js';

test('API key alias defaults and normalizes environment-style identifiers', () => {
    assert.equal(normalizeApiKeyAlias(), 'OPENAI_API_KEY');
    assert.equal(normalizeApiKeyAlias('  LOCAL_LLM_KEY  '), 'LOCAL_LLM_KEY');
});

test('API key alias rejects invalid profile values', () => {
    assert.throws(() => normalizeApiKeyAlias(123), /must be a string/);
    assert.throws(() => normalizeApiKeyAlias('bad-key'), /valid environment\/key identifier/);
    assert.throws(() => normalizeApiKeyAlias('1BAD'), /valid environment\/key identifier/);
});
