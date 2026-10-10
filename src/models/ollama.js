import { strictFormat } from '../utils/text.js';

export class Ollama {
    static prefix = 'ollama';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embed';
    }

    async sendRequest(turns, systemMessage, imageBuffer = null) {
        let model = this.model_name || 'sweaterdog/andy-4:micro-q8_0';
        let messages = strictFormat(turns.map(turn => ({ ...turn })));
        messages.unshift({ role: 'system', content: systemMessage });
        if (imageBuffer) {
            messages.push({ role: 'user', content: systemMessage, images: [imageBuffer.toString('base64')] });
        }
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting ${this.constructor.prefix} response... (model: ${model}, attempt: ${attempt})`);
            let res;
            try {
                let apiResponse = await this.send(this.chat_endpoint, {
                    model: model,
                    messages: messages,
                    stream: false,
                    ...(this.params || {})
                });
                if (typeof apiResponse?.message?.content !== 'string') {
                    throw new Error('Ollama returned no chat message.');
                }
                res = apiResponse.message.content;
            } catch (err) {
                if (err.message.toLowerCase().includes('context length') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await this.sendRequest(turns.slice(1), systemMessage, imageBuffer);
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
        return finalRes;
    }

    async embed(text) {
        let model = this.model_name || 'embeddinggemma';
        let body = { model: model, input: text };
        let res = await this.send(this.embedding_endpoint, body);
        const embedding = res?.embeddings?.[0];
        if (!Array.isArray(embedding)) throw new Error('Ollama returned no embedding.');
        return embedding;
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        let method = 'POST';
        let headers = new Headers({ 'Content-Type': 'application/json' });
        if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);
        const request = new Request(url, { method, headers, body: JSON.stringify(body) });
        const res = await fetch(request);
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(`Ollama status ${res.status}${data?.error ? ': ' + data.error : ''}`);
        }
        return await res.json();
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        return await this.sendRequest(messages, systemMessage, imageBuffer);
    }
}
