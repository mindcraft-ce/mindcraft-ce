import Anthropic from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { runAbortableRequest } from './request_control.js';
import { classifyProviderError } from './provider_error.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

export class Claude {
    static prefix = 'anthropic';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        const providerParams = { ...(params || {}) };
        const configured = Number(providerParams.request_timeout_ms);
        delete providerParams.request_timeout_ms;
        this.params = providerParams;
        this.requestTimeoutMs = Number.isInteger(configured) && configured > 0
            ? configured
            : DEFAULT_REQUEST_TIMEOUT_MS;

        const config = {};
        if (url)
            config.baseURL = url;

        config.apiKey = getKey('ANTHROPIC_API_KEY');
        this.anthropic = new Anthropic(config);
    }

    async sendRequest(turns, systemMessage, _stopSeq = '***', { signal } = {}) {
        const messages = strictFormat(turns);
        let res = null;
        try {
            console.log(`Awaiting anthropic response from ${this.model_name}...`);
            const params = { ...(this.params || {}) };
            if (!params.max_tokens) {
                if (params.thinking?.budget_tokens) {
                    params.max_tokens = params.thinking.budget_tokens + 1000;
                } else {
                    params.max_tokens = 4096;
                }
            }
            const resp = await runAbortableRequest(
                requestSignal => this.anthropic.messages.create({
                    model: this.model_name || 'claude-sonnet-4-6',
                    system: systemMessage,
                    messages,
                    ...params
                }, { signal: requestSignal }),
                { timeoutMs: this.requestTimeoutMs, signal }
            );

            console.log('Received.');
            const textContent = resp.content.find(content => content.type === 'text');
            if (textContent) {
                res = textContent.text;
            } else {
                console.warn('No text content found in the response.');
                res = 'No response from Claude.';
            }
        }
        catch (err) {
            if (String(err?.message).includes('does not support image input')) {
                return 'Vision is only supported by certain models.';
            }
            const providerError = classifyProviderError(err);
            console.log(providerError);
            throw providerError;
        }
        return res;
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer, requestOptions = {}) {
        const imageMessages = [...turns];
        imageMessages.push({
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: systemMessage
                },
                {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: 'image/jpeg',
                        data: imageBuffer.toString('base64')
                    }
                }
            ]
        });

        return this.sendRequest(imageMessages, systemMessage, '***', requestOptions);
    }

    async embed(_text) {
        throw new Error('Embeddings are not supported by Claude.');
    }
}
