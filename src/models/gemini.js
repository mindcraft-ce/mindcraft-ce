import { GoogleGenAI } from '@google/genai';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

import { lamejs } from 'lamejs/lame.all.js';


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

const sendAudioRequest = async (text, model, voice, url) => {
    const ai = new GoogleGenAI({apiKey: getKey('GEMINI_API_KEY')});

    const response = await ai.models.generateContent({
        model: model,
        contents: [{ parts: [{text: text}] }],
        config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice },
                },
            },
        },
    })

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    // data is base64-encoded pcm

    // convert pcm to mp3
    const SAMPLE_RATE = 24000;
    const CHANNELS = 1;
    const pcmBuffer = Buffer.from(data, 'base64');
    const pcmInt16Array = new Int16Array(
        pcmBuffer.buffer, 
        pcmBuffer.byteOffset, 
        pcmBuffer.length / 2
    );
    const mp3encoder = new lamejs.Mp3Encoder(CHANNELS, SAMPLE_RATE, 128);
    const sampleBlockSize = 1152; // Standard for MPEG audio
    const mp3Data = [];
    for (let i = 0; i < pcmInt16Array.length; i += sampleBlockSize) {
        const sampleChunk = pcmInt16Array.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(Buffer.from(mp3buf));
        }
    }
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(Buffer.from(mp3buf));
    }
    const finalBuffer = Buffer.concat(mp3Data);
    // finished converting

    return finalBuffer.toString('base64');
}

export const TTSConfig = {
    sendAudioRequest: sendAudioRequest,
}