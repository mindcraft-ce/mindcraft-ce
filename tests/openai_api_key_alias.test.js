import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiKeyAlias } from '../src/models/gpt.js';

test('API key alias defaults and normalizes configured identifiers', () => {
    assert.equal(normalizeApiKeyAlias(), 'OPENAI_API_KEY');
    assert.equal(normalizeApiKeyAlias(''), 'OPENAI_API_KEY');
    assert.equal(normalizeApiKeyAlias('   '), 'OPENAI_API_KEY');
    assert.equal(normalizeApiKeyAlias('  LOCAL_LLM_KEY  '), 'LOCAL_LLM_KEY');
    assert.equal(normalizeApiKeyAlias('local-openai'), 'local-openai');
});

test('API key alias rejects non-string and control-character values', () => {
    assert.throws(() => normalizeApiKeyAlias(123), /must be a string/);
    assert.throws(() => normalizeApiKeyAlias('bad\nkey'), /control characters/);
    assert.throws(() => normalizeApiKeyAlias('bad\0key'), /control characters/);
});
