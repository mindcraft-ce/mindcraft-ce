import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { response } from 'express';
import { responseFormatSchema } from './_response_format.js';

export class OpenRouter {
    static prefix = 'openrouter';
    constructor(model_name, url) {
        this.model_name = model_name;

        let config = {};
        config.baseURL = url || 'https://openrouter.ai/api/v1';

        const apiKey = getKey('OPENROUTER_API_KEY');
        if (!apiKey) {
            console.error('Error: OPENROUTER_API_KEY not found. Make sure it is set properly.');
        }

        // Pass the API key to OpenAI compatible Api
        config.apiKey = apiKey;
        config.defaultHeaders = {
            'HTTP-Referer': 'https://mindcraft-ce.com/',
            'X-Title': 'Mindcraft CE',
        };

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, tools = []) {
        let stop_seq = '*';
        let messages = [{ role: 'system', content: systemMessage }, ...turns];
        messages = strictFormat(messages);

        // Choose a valid model from openrouter.ai (for example, "openai/gpt-4o")
        const pack = {
            model: this.model_name,
            tools: tools,
            messages,
            stop: stop_seq,
            tool_choice: "auto",
            response_format: responseFormatSchema
        };
        
        let res = null;
        let function_calls = [];
        try {
            console.log('Awaiting openrouter api response...');
            let completion = await this.openai.chat.completions.create(pack);
            if (!completion?.choices?.[0]) {
                console.error('No completion or choices returned:', completion);
                return 'No response received.';
            }
            if (completion.choices[0].finish_reason === 'length') {
                throw new Error('Context length exceeded');
            }
            console.log('Received.', JSON.stringify(completion));
            res = completion.choices[0].message.content;
            for (const tool_call of completion.choices[0].message.tool_calls || []) {
                function_calls.push({
                    name: tool_call.function.name,
                    arguments: JSON.parse(tool_call.function.arguments)
                });
            }
        } catch (err) {
            console.error('Error while awaiting response:', err);
            // If the error indicates a context-length problem, we can slice the turns array, etc.
            res = 'My brain disconnected, try again.';
        }


        return [res, function_calls];
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer, tools = []) {
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

        return this.sendRequest(imageMessages, systemMessage, tools);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "qwen/qwen3-embedding-4b",
            input: text,
            dimensions: 1024
        });
        return embedding.data[0].embedding;
    }
}