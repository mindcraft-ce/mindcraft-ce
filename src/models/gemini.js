import { GoogleGenAI } from '@google/genai';
import { toSinglePrompt, strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Gemini {
    constructor(model, url, params) {
        this.model = model || "gemini-2.5-flash";
        this.params = params;
        this.safetySettings = [
            {
                "category": "HARM_CATEGORY_DANGEROUS",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_NONE",
            },
        ];

        this.genAI = new GoogleGenAI({apiKey: getKey('GEMINI_API_KEY')});
    }

    async sendRequest(turns, systemMessage) {
        console.log('Awaiting Google API response...');

        turns = strictFormat(turns);
        let contents = [];
        for (let turn of turns) {
            contents.push({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }]
            });
        }

        const result = await this.genAI.models.generateContent({
            model: this.model,
            contents: contents,
            safetySettings: this.safetySettings,
            config: {
                systemInstruction: systemMessage,
                ...(this.params || {})
            }
        });
        const response = await result.text;

        console.log('Received.');

        return response;
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
        const imagePart = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: 'image/jpeg'
            }
        };
       
        turns = strictFormat(turns);
        let contents = [];
        for (let turn of turns) {
            contents.push({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }]
            });
        }
        contents.push({
            role: 'user',
            parts: [{ text: 'SYSTEM: Vision response' }, imagePart]
        })

        let res = null;
        try {
            console.log('Awaiting Google API vision response...');
            const result = await this.genAI.models.generateContent({
                contents: contents,
                safetySettings: this.safetySettings,
                systemInstruction: systemMessage,
                model: this.model,
                config: {
                    systemInstruction: systemMessage,
                    ...(this.params || {})
                }
            });
            res = await result.text;
            console.log('Received.');
        } catch (err) {
            console.log(err);
            if (err.message.includes("Image input modality is not enabled for models/")) {
                res = "Vision is only supported by certain models.";
            } else {
                res = "An unexpected error occurred, please try again.";
            }
        }
        return res;
    }

    async embed(text) {
        const result = await this.genAI.models.embedContent({
            model: 'gemini-embedding-001',
            contents: text,
        })

        return result.embeddings;
    }
}
