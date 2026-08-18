import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

// llama, mistral
export class Novita {
    static prefix = 'novita';

    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url || 'https://api.novita.ai/v3/openai';
        this.params = params;

        const config = {
            baseURL: this.url,
            apiKey: getKey('NOVITA_API_KEY'),
        };

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{ role: 'system', content: systemMessage }].concat(turns);
        messages = strictFormat(messages);

        const pack = {
            model: this.model_name || 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages,
            stop: [stop_seq],
            ...(this.params || {}),
        };

        let res;
        try {
            console.log('Awaiting novita api response...');
            const completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason === 'length') {
                console.warn('Novita response stopped with finish_reason=length; returning partial response.');
            }
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            if (err?.code === 'context_length_exceeded' && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            }
            console.log(err);
            res = 'My brain disconnected, try again.';
        }

        if (res.includes('<think>')) {
            const start = res.indexOf('<think>');
            const end = res.indexOf('</think>');
            if (start !== -1) {
                res = end !== -1
                    ? res.substring(0, start) + res.substring(end + 8)
                    : res.substring(0, start);
            }
            res = res.trim();
        }
        return res;
    }

    embed(_text) {
        return Promise.reject(new Error('Embeddings are not supported by Novita AI.'));
    }
}
