import { hasKey, getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

// Keep batches comfortably below provider-specific item limits while still
// reducing the request burst during examples/skill initialization.
const MAX_EMBEDDING_BATCH_SIZE = 64;

export class Andy {
    static prefix = 'andy';

    constructor(model_name, url, params) {
        this.model_name = model_name || 'auto';
        this.params = params;
        this.base_url = url || 'https://andy.mindcraft-ce.com';
        this.chat_endpoint = '/api/v1/chat/completions';
        this.embedding_endpoint = '/api/v1/embeddings';
        this.embedding_queue = Promise.resolve();
    }

    async sendRequest(turns, systemMessage) {
        let model = this.model_name || 'auto';
        let messages = [{ role: 'system', content: systemMessage }].concat(strictFormat(turns));

        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting Andy API response... (model: ${model}, attempt: ${attempt})`);
            let res;
            try {
                const data = await this.send(this.chat_endpoint, {
                    model,
                    messages,
                    stream: false,
                    ...(this.params || {})
                });
                if (data?.choices?.[0]?.message?.content) {
                    res = data.choices[0].message.content;
                } else {
                    res = 'No response data.';
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

            const hasOpenTag = res.includes('<think>');
            const hasCloseTag = res.includes('</think>');

            if (hasOpenTag && !hasCloseTag) {
                console.warn('Partial <think> block detected. Re-generating...');
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
            console.warn('Could not get a valid response after max attempts.');
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return finalRes;
    }

    async embed(text) {
        const embeddings = await this.embedMany([text]);
        return embeddings[0];
    }

    async embedMany(texts) {
        if (!Array.isArray(texts)) {
            throw new TypeError('Andy embeddings require an array of texts.');
        }
        if (texts.length === 0) return [];

        const request = this.embedding_queue.then(async () => {
            const embeddings = [];
            for (let start = 0; start < texts.length; start += MAX_EMBEDDING_BATCH_SIZE) {
                const batch = texts.slice(start, start + MAX_EMBEDDING_BATCH_SIZE);
                const data = await this.send(this.embedding_endpoint, { model: this.model_name, input: batch });
                if (!Array.isArray(data?.data) || data.data.length !== batch.length) {
                    throw new Error('Andy API embeddings not available.');
                }

                // OpenAI-compatible providers normally return `index`; use it
                // when valid so an out-of-order response cannot pair an
                // embedding with the wrong example or skill document. Keep a
                // positional fallback for older compatible providers that omit
                // the field entirely.
                const hasIndexes = data.data.every(item => Number.isInteger(item?.index));
                const ordered = hasIndexes
                    ? [...data.data].sort((a, b) => a.index - b.index)
                    : data.data;
                if (hasIndexes && ordered.some((item, index) => item.index !== index)) {
                    throw new Error('Andy API returned invalid embedding indexes.');
                }
                if (ordered.some(item => !Array.isArray(item?.embedding))) {
                    throw new Error('Andy API embeddings not available.');
                }
                embeddings.push(...ordered.map(item => item.embedding));
            }
            return embeddings;
        });
        this.embedding_queue = request.catch(() => {});
        return await request;
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.base_url);
        const headers = { 'Content-Type': 'application/json' };
        const apiKey = hasKey('ANDY_API_KEY') ? getKey('ANDY_API_KEY') : null;
        if (apiKey && apiKey !== 'optional') {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        const request = new Request(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        const res = await fetch(request);
        if (!res.ok) {
            throw new Error(`Andy API status: ${res.status}`);
        }
        return await res.json();
    }
}
