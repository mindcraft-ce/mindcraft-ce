import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultClaudeMaxTokens } from '../src/models/claude_limits.js';

test('the Claude max_tokens default follows the model output cap', () => {
    assert.equal(defaultClaudeMaxTokens('claude-3-5-sonnet-latest'), 8192);
    assert.equal(defaultClaudeMaxTokens('anthropic/claude-3-5-sonnet-latest'), 8192);
    assert.equal(defaultClaudeMaxTokens('claude-3-5-haiku-20241022'), 8192);
    assert.equal(defaultClaudeMaxTokens('claude-3-opus-20240229'), 4096);
    assert.equal(defaultClaudeMaxTokens('claude-3-sonnet-20240229'), 4096);
    assert.equal(defaultClaudeMaxTokens('claude-3-haiku-20240307'), 4096);
    assert.equal(defaultClaudeMaxTokens('claude-3-7-sonnet-20250219'), 16000);
    assert.equal(defaultClaudeMaxTokens('claude-sonnet-4-6'), 16000);
    assert.equal(defaultClaudeMaxTokens('claude-opus-4-6'), 16000);
    assert.equal(defaultClaudeMaxTokens(undefined), 16000);
});

test('an explicit thinking budget takes priority over the model default', () => {
    assert.equal(defaultClaudeMaxTokens('claude-sonnet-4-6', 4000), 5000);
    assert.equal(defaultClaudeMaxTokens('claude-test', 0), 16000);
    assert.equal(defaultClaudeMaxTokens('claude-test', -1), 16000);
});
