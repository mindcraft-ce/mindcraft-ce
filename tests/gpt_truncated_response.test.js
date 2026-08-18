import test from 'node:test';
import assert from 'node:assert/strict';
import { GPT } from '../src/models/gpt.js';

test('OpenAI-compatible finish_reason=length preserves partial response content', async () => {
    const model = Object.create(GPT.prototype);
    model.model_name = 'local-model';
    model.params = {};
    model.url = 'http://localhost:1234/v1';
    model.openai = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{
                        finish_reason: 'length',
                        message: { content: 'usable partial response' },
                    }],
                }),
            },
        },
    };

    const result = await model.sendRequest([], 'system prompt');
    assert.equal(result, 'usable partial response');
});
