import { strictFormat } from '../utils/text.js';
import { responseFormatSchema } from './_response_format.js';

export class Ollama {
    static prefix = 'ollama';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
    }

    async sendRequest(turns, systemMessage, tools = [], responseFormat = responseFormatSchema) {
        let model = this.model_name || 'sweaterdog/andy-4:micro-q8_0';
        let messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;
        let function_calls = [];

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting local response... (model: ${model}, attempt: ${attempt})`);
            let res = null;
            try {
                // Only include tools/format when they're actually provided. Sending
                // `format: null` or `tools: []` makes Ollama 500 in some versions.
                const body = {
                    model: model,
                    messages: messages,
                    stream: false,
                    ...(tools && tools.length ? { tools } : {}),
                    ...(responseFormat ? { format: responseFormat } : {}),
                    ...(this.params || {})
                };
                let apiResponse = await this.send(this.chat_endpoint, body);
                if (apiResponse) {
                    res = apiResponse['message']['content'];
                } else {
                    res = 'No response data.';
                }
                for (const tool_call of apiResponse['message']['tool_calls'] || []) {
                    function_calls.push({
                        name: tool_call.function.name,
                        arguments: tool_call.function.arguments
                    });
                }
            } catch (err) {
                if (err.message.toLowerCase().includes('context length') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await this.sendRequest(turns.slice(1), systemMessage);
                } else {
                    console.log(err);
                    res = 'My brain disconnected, try again.';
                }
            }

            const hasOpenTag = res.includes("<think>");
            const hasCloseTag = res.includes("</think>");

            if ((hasOpenTag && !hasCloseTag)) {
                console.warn("Partial <think> block detected. Re-generating...");
                if (attempt < maxAttempts) continue;
            }
            if (hasCloseTag && !hasOpenTag) {
                res = '<think>' + res;
            }
            if (hasOpenTag && hasCloseTag) {
                res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }
            finalRes = res;
            break;
        }

        if (finalRes == null) {
            console.warn("Could not get a valid response after max attempts.");
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return [finalRes, function_calls];
    }

    async embed(text) {
        let model = this.model_name || 'embeddinggemma';
        // /api/embeddings expects `prompt` (singular). Sending `input` returns
        // HTTP 200 with `{"embedding":[]}` — silently empty, RAG falls back to
        // word-overlap with no warning.
        let body = { model: model, prompt: text };
        let res = await this.send(this.embedding_endpoint, body);
        return res?.['embedding'];
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        const method = 'POST';
        const headers = new Headers();
        // Retry on 503/429: 8 bots booting in parallel hammer Ollama with embed
        // requests during initial RAG indexing and Ollama returns 503 while the
        // model is loading or under load.
        const maxAttempts = 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const request = new Request(url, { method, headers, body: JSON.stringify(body) });
                const res = await fetch(request);
                if (res.ok) {
                    return await res.json();
                }
                if ((res.status === 503 || res.status === 429) && attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 300 * attempt));
                    continue;
                }
                throw new Error(`Ollama Status: ${res.status}`);
            } catch (err) {
                if (attempt === maxAttempts) {
                    console.error('Failed to send Ollama request.');
                    console.error(err);
                    return null;
                }
                await new Promise(r => setTimeout(r, 300 * attempt));
            }
        }
        return null;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer, tools = [], responseFormat = responseFormatSchema) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });
        
        return this.sendRequest(imageMessages, systemMessage, tools, responseFormat);
    }
}
