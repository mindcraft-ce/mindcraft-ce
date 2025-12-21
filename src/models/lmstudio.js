import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { json } from 'express';
import { responseFormatSchema } from './_response_format.js';

export class GPT {
    static prefix = 'lmstudio';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;

        let config = {};
        if (url)
            config.baseURL = url;

        config.apiKey = "not_needed";

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, tools = []) {
        let stop_seq = '*';
        let messages = [{ role: 'system', content: systemMessage }, ...turns];
        messages = strictFormat(messages);

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
            console.log('Awaiting lm studio response...');
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
                { type: "input_text", text: systemMessage },
                {
                    type: "input_image",
                    image_url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                }
            ]
        });
        
        return this.sendRequest(imageMessages, systemMessage, tools);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
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
