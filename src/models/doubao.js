import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class Doubao {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        let config = {};

        config.baseURL = url || 'https://ark.cn-beijing.volces.com/api/v3';
        config.apiKey = getKey('DOUBAO_API_KEY');

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        messages = strictFormat(messages);

        const pack = {
            model: this.model_name || "doubao-1-5-pro-32k-250115",
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };

        let res = null;
        try {
            console.log('Awaiting Doubao api response...');
            // console.log('Messages:', messages);
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded');
            console.log('Received.');
            res = completion.choices[0].message.content;
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
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
        if (!this.model_name.includes("vision"))
            return null; 
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
        
        return this.sendRequest(imageMessages, systemMessage);
    }
}