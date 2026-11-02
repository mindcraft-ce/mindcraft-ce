import OpenAIApi from 'openai';
import { strictFormat } from '../utils/text.js';

export class LMStudio {
    static prefix = 'lmstudio';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.openai = new OpenAIApi({
            baseURL: url || 'http://localhost:1234/v1',
            apiKey: 'lm-studio', // LM Studio ignores this but the client requires a non-empty value
        });
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{ role: 'system', content: systemMessage }].concat(strictFormat(turns));
        let model = this.model_name || 'andy-4.1';
        let res = null;

        try {
            console.log('Awaiting LM Studio response from model', model);
            const pack = {
                model,
                messages,
                stop: stop_seq,
                ...(this.params || {})
            };
            const completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason === 'length')
                throw new Error('Context length exceeded');
            console.log('Received.');
            res = completion.choices[0].message.content;
            if (res.includes('</think>')) {
                if (!res.includes('<think>')) res = '<think>' + res;
                res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }
        } catch (err) {
            if ((err.message === 'Context length exceeded' || err.code === 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: 'user',
            content: [
                { type: 'text', text: systemMessage },
                {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` }
                }
            ]
        });
        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || 'text-embedding-nomic-embed-text-v1.5',
            input: text,
            encoding_format: 'float',
        });
        return embedding.data[0].embedding;
    }
}
