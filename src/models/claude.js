import Anthropic from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { defaultClaudeMaxTokens } from './claude_limits.js';

export class Claude {
    static prefix = 'anthropic';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params || {};

        let config = {};
        if (url)
            config.baseURL = url;
        
        config.apiKey = getKey('ANTHROPIC_API_KEY');

        this.anthropic = new Anthropic(config);
    }

    async sendRequest(turns, systemMessage) {
        const messages = strictFormat(turns);
        // Claude 4.6 and later reject a request that ends on an assistant turn (a prefill), so close it with
        // a user turn. Ported from r77tchan/mindcraft (MIT), as are the retry and refusal handling below.
        if (messages[messages.length - 1].role === 'assistant')
            messages.push({role: 'user', content: '_'});
        // The default goes in a copy: the native tool path reads this.params as well, and a default written
        // into it here used to become that path's limit too.
        const params = {...this.params};
        const model = this.model_name || 'claude-sonnet-4-6';
        if (!params.max_tokens) {
            // max_tokens must be greater than thinking.budget_tokens, and older Claude models cap output
            // below the newer default, so the default depends on the model (see claude_limits.js).
            params.max_tokens = defaultClaudeMaxTokens(model, params.thinking?.budget_tokens);
        }
        let res = null;
        try {
            console.log(`Awaiting anthropic response from ${this.model_name}...`)
            // Newer models now and then end a turn with no text at all; one more try fixes it.
            for (let attempt = 1; attempt <= 2; attempt++) {
                const resp = await this.anthropic.messages.create({
                    model,
                    system: systemMessage,
                    messages: messages,
                    ...params
                });

                console.log('Received.')
                if (resp.stop_reason === 'refusal') {
                    console.warn('Claude declined to respond:', resp.stop_details?.category ?? 'no category');
                    return "Sorry, I can't respond to that.";
                }
                // The first text block with something in it. A lone tab is a real answer ("nothing to say").
                const textContent = resp.content.find(content => content.type === 'text' && content.text);
                if (textContent) {
                    res = textContent.text;
                    break;
                }
                console.warn(`No text content found in the response (stop_reason ${resp.stop_reason}, attempt ${attempt} of 2).`);
                res = 'No response from Claude.';
                // A reply cut off at max_tokens would be cut off again.
                if (resp.stop_reason !== 'end_turn') break;
            }
        }
        catch (err) {
            if (err.message.includes("does not support image input")) {
                res = "Vision is only supported by certain models.";
            } else {
                res = "My brain disconnected, try again.";
            }
            console.log(err);
        }
        return res;
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
        const imageMessages = [...turns];
        imageMessages.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: systemMessage
                },
                {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: "image/jpeg",
                        data: imageBuffer.toString('base64')
                    }
                }
            ]
        });

        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Claude.');
    }
}
