import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { responseFormatSchema } from './_response_format.js';

export class GLHF {
    static prefix = 'glhf';
    constructor(model_name, url) {
        this.model_name = model_name;
        const apiKey = getKey('GHLF_API_KEY');
        if (!apiKey) {
            throw new Error('API key not found. Please check keys.json and ensure GHLF_API_KEY is defined.');
        }
        this.openai = new OpenAIApi({
            apiKey,
            baseURL: url || "https://glhf.chat/api/openai/v1"
        });
    }

    async sendRequest(turns, systemMessage, tools = [], responseFormat = responseFormatSchema) {
        let stop_seq = '***';
        // Construct the message array for the API request.
        let messages = [{ role: 'system', content: systemMessage }].concat(turns);
        const pack = {
            model: this.model_name || "hf:meta-llama/Llama-3.1-405B-Instruct",
            messages,
            stop: [stop_seq],
            response_format: responseFormat
        };

        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        let function_calls = [];

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting glhf.chat API response... (attempt: ${attempt})`);
            try {
                let completion = await this.openai.chat.completions.create(pack);
                if (completion.choices[0].finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }
                let res = completion.choices[0].message.content;
                // If there's an open <think> tag without a corresponding </think>, retry.
                if (res.includes("<think>") && !res.includes("</think>")) {
                    console.warn("Partial <think> block detected. Re-generating...");
                    continue;
                }
                // If there's a closing </think> tag but no opening <think>, prepend one.
                if (res.includes("</think>") && !res.includes("<think>")) {
                    res = "<think>" + res;
                }
                finalRes = res.replace(/<\|separator\|>/g, '*no response*');
                for (const tool_call of completion.choices[0].message.tool_calls || []) {
                    function_calls.push({
                        name: tool_call.function.name,
                        arguments: tool_call.function.arguments
                    });
                }
                break; // Valid response obtained.
            } catch (err) {
                if ((err.message === 'Context length exceeded' || err.code === 'context_length_exceeded') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
                } else {
                    console.error(err);
                    finalRes = 'My brain disconnected, try again.';
                    break;
                }
            }
        }
        if (finalRes === null) {
            finalRes = "I thought too hard, sorry, try again";
        }
        return [finalRes, function_calls];
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by glhf.');
    }
}
