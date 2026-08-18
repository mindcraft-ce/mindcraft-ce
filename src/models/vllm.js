// This code uses an OpenAI-compatible vLLM endpoint for text generation.

import OpenAIApi from 'openai';
import { strictFormat } from '../utils/text.js';

export class VLLM {
    static prefix = 'vllm';

    constructor(model_name, url) {
        this.model_name = model_name;

        const vllm_config = {
            baseURL: url || 'http://0.0.0.0:8000/v1',
            apiKey: '',
        };

        this.vllm = new OpenAIApi(vllm_config);
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        let messages = [{ role: 'system', content: systemMessage }].concat(turns);
        const model = this.model_name || 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B';

        if (model.includes('deepseek') || model.includes('qwen')) {
            messages = strictFormat(messages);
        }

        const pack = {
            model,
            messages,
            stop: stop_seq,
        };

        try {
            console.log('Awaiting vLLM API response...');
            const completion = await this.vllm.chat.completions.create(pack);
            if (completion.choices[0].finish_reason === 'length') {
                console.warn('vLLM response stopped with finish_reason=length; returning partial response.');
            }
            console.log('Received.');
            return completion.choices[0].message.content;
        } catch (err) {
            if (err?.code === 'context_length_exceeded' && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            }
            console.log(err);
            return 'My brain disconnected, try again.';
        }
    }
}
