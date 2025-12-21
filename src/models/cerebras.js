import CerebrasSDK from '@cerebras/cerebras_cloud_sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Cerebras {
    static prefix = 'cerebras';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url;
        this.params = params;

        // Initialize client with API key
        this.client = new CerebrasSDK({ apiKey: getKey('CEREBRAS_API_KEY') });
    }

    async sendRequest(turns, systemMessage, tools = []) {
        let stop_seq = '***';
        // Format messages array
        const messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });
        

        /*
        tools = [
    {
        "type": "function",
        "function": {
            "name": "calculate",
            "strict": True,
            "description": "A calculator tool that can perform basic arithmetic operations. Use this when you need to compute mathematical expressions or solve numerical problems.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "The mathematical expression to evaluate"
                    }
                },
                "required": ["expression"]
            }
        }
    }
]
*/

        let converted_tools = [];
        for (const tool of tools) {
            let converted_tool = {
                type: 'function',
                function: {
                    name: tool.name,
                    strict: true,
                    description: tool.description || 'No description provided.',
                    parameters: tool.parameters || {}
                }
            };
            converted_tools.push(converted_tool);
        }

        const pack = {
            model: this.model_name || 'gpt-oss-120b',
            messages,
            tools: converted_tools,
            stream: false,
            ...(this.params || {}),
        };

        let res;
        let function_calls = [];
        try {
            const completion = await this.client.chat.completions.create(pack);
            // OpenAI-compatible shape
            res = completion.choices?.[0]?.message?.content || '';
            for (const tool_call of completion.choices[0].message.tool_calls || []) {
                function_calls.push({
                    name: tool_call.function.name,
                    arguments: tool_call.function.arguments
                });
            }
        } catch (err) {
            console.error('Cerebras API error:', err);
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
        throw new Error('Embeddings are not supported by Cerebras.');
    }
}
