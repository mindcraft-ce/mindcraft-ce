import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';
import { responseFormatSchema } from './_response_format.js';

// THIS API IS NOT TO BE CONFUSED WITH GROK!
// Go to grok.js for that. :)

// Umbrella class for everything under the sun... That GroqCloud provides, that is.
export class GroqCloudAPI {
    static prefix = 'groq';

    constructor(model_name, url, params) {

        this.model_name = model_name;
        this.url = url;
        this.params = params || {};

        // Remove any mention of "tools" from params:
        if (this.params.tools)
            delete this.params.tools;
        // This is just a bit of future-proofing in case we drag Mindcraft in that direction.

        // I'm going to do a sneaky ReplicateAPI theft for a lot of this, aren't I?
        if (this.url)
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");

        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });


    }

    async sendRequest(turns, systemMessage, tools = [], responseFormat = responseFormatSchema) {
        let stop_seq=null;
        // Construct messages array
        let messages = [{"role": "system", "content": systemMessage}].concat(turns);

        let res = null;
        let function_calls = [];

        try {
            console.log("Awaiting Groq response...");

            // Handle deprecated max_tokens parameter
            if (this.params.max_tokens) {
                console.warn("GROQCLOUD WARNING: A profile is using `max_tokens`. This is deprecated. Please move to `max_completion_tokens`.");
                this.params.max_completion_tokens = this.params.max_tokens;
                delete this.params.max_tokens;
            }

            if (!this.params.max_completion_tokens) {
                this.params.max_completion_tokens = 4000;
            }

            let completion = await this.groq.chat.completions.create({
                "messages": messages,
                "model": this.model_name || "qwen/qwen3-32b",
                "stream": false,
                "tools": tools,
                "stop": stop_seq,
                "response_format": responseFormat,
                ...(this.params || {})
            });

            res = completion.choices[0].message.content;
            for (const tool_call of completion.choices[0].message.tool_calls || []) {
                function_calls.push({
                    name: tool_call.function.name,
                    arguments: tool_call.function.arguments
                });
            }

            res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }
        catch(err) {
            if (err.message.includes("content must be a string")) {
                res = "Vision is only supported by certain models.";
            } else {
                res = "My brain disconnected, try again.";
            }
            console.log(err);
        }
        return [res, function_calls];
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer, tools = [], responseFormat = responseFormatSchema) {
        const imageMessages = messages.filter(message => message.role !== 'system');
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

    async embed(_) {
        throw new Error('Embeddings are not supported by Groq.');
    }
}
