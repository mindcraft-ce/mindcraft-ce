import Anthropic from '@anthropic-ai/sdk';
import OpenAIApi from 'openai';
import { strictFormat } from '../utils/text.js';
import { responseFormatSchema } from './_response_format.js';

// Convert OpenAI-format tool definitions to Anthropic format
function toAnthropicTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters || { type: 'object', properties: {} }
    }));
}

export class GPT {
    static prefix = 'lmstudio';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params || {};
        this.url = url;

        this.anthropic = new Anthropic({
            baseURL: url || 'http://localhost:1234',
            apiKey: 'not_needed',
        });

        // Keep OpenAI client for embeddings (Anthropic SDK doesn't support embeddings)
        this.openai = new OpenAIApi({
            baseURL: url || 'http://localhost:1234',
            apiKey: 'not_needed',
        });
    }

    async sendRequest(turns, systemMessage, tools = [], responseFormat = responseFormatSchema) {
        const messages = strictFormat(turns);
        let res = null;
        let function_calls = [];

        try {
            console.log('Awaiting lm studio response...');
            if (!this.params.max_tokens) {
                this.params.max_tokens = 4096;
            }

            const pack = {
                model: this.model_name,
                messages: messages,
                ...(this.params || {})
            };
            if (systemMessage) {
                pack.system = systemMessage;
            }

            const anthropicTools = toAnthropicTools(tools);
            if (anthropicTools) {
                pack.tools = anthropicTools;
            }

            const resp = await this.anthropic.messages.create(pack);

            console.log('Received.');

            // Extract text content
            const textContent = resp.content.find(c => c.type === 'text');
            if (textContent) {
                res = textContent.text;
            } else {
                console.warn('No text content in LM Studio response.');
                res = '';
            }

            // Extract tool use blocks
            for (const content of resp.content) {
                if (content.type === 'tool_use') {
                    function_calls.push({
                        name: content.name,
                        arguments: content.input
                    });
                }
            }
        } catch (err) {
            console.error('Error while awaiting LM Studio response:', err);
            res = 'My brain disconnected, try again.';
        }

        return [res, function_calls];
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer, tools = [], responseFormat = responseFormatSchema) {
        const imageMessages = [...messages];
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

        return this.sendRequest(imageMessages, systemMessage, tools, responseFormat);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        // Embeddings still use OpenAI-compatible endpoint
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-nomic-embed-text-v1.5",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
    }
}

const sendAudioRequest = async (text, model, voice, url) => {
    const payload = {
        model: model,
        voice: voice,
        input: text
    }

    let config = {};

    if (url)
        config.baseURL = url;

    config.apiKey = "not_needed";

    const openai = new OpenAIApi(config);

    const mp3 = await openai.audio.speech.create(payload);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64 = buffer.toString("base64");
    return base64;
}

export const TTSConfig = {
    sendAudioRequest: sendAudioRequest,
    baseUrl: 'https://tts.mce.run/v1',
}
