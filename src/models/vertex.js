import { GoogleGenAI } from '@google/genai';
import { toSinglePrompt, strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

export class Vertex {
    constructor(model_name, url, params) {
        this.model_name = model_name || "gemini-2.0-flash";
        this.params = params;
        this.url = url;
        // Only use valid categories for the new SDK
        this.safetySettings = [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "BLOCK_NONE" },
        ];
        
        // Get configuration from keys.json or environment variables
        const project = getOptionalKey('VERTEX_PROJECT_ID') || process.env.GOOGLE_CLOUD_PROJECT;
        const location = getOptionalKey('VERTEX_LOCATION') || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
        
        if (!project) {
            throw new Error('VERTEX_PROJECT_ID must be set in keys.json or GOOGLE_CLOUD_PROJECT environment variable must be set');
        }
        
        console.log(`Initializing Vertex AI with project: ${project}, location: ${location}`);
        console.log('Authentication will use Application Default Credentials. Ensure you are authenticated with: gcloud auth application-default login');
        
        // Initialize with the new Google Gen AI SDK approach
        this.genAI = new GoogleGenAI({
            vertexai: true,
            project: project,
            location: location
        });
        
        this.supportsRawImageInput = true;
    }

    async sendRequest(turns, systemMessage, imageData = null) {
        console.log('Awaiting Vertex AI response...');
        const originalTurnsForLog = [{role: 'system', content: systemMessage}, ...turns];
        turns.unshift({ role: 'system', content: systemMessage });
        turns = strictFormat(turns);
        
        let contents = [];
        for (let turn of turns) {
            contents.push({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }]
            });
        }

        if (imageData && contents.length > 0) {
            const lastContent = contents[contents.length - 1];
            if (lastContent.role === 'user') {
                lastContent.parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: imageData.toString('base64')
                    }
                });
            } else {
                console.warn('[Vertex] imageData provided, but the last content entry was not from a user. Image not sent.');
            }
        }

        // Always enable thought summaries
        let config = {
            ...this.params,
            thinkingConfig: {
                includeThoughts: true,
                ...(this.params?.thinkingConfig || {})
            }
        };

        // Add safety settings
        if (this.safetySettings) {
            config.safetySettings = this.safetySettings;
        }

        try {
            const response = await this.genAI.models.generateContent({
                model: this.model_name,
                contents,
                config,
            });

            // Extract main text and thinking summary
            let text = "";
            let thinkingSummary = "";
            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.thought) {
                        thinkingSummary += part.text || "";
                    } else if (part.text) {
                        text += part.text;
                    }
                }
            }
            if (!text && response.text) text = response.text;

            // clean up output text
            text = text.replace(/<thinking>/g,'<think>').replace(/<\/thinking>/g,'</think>');
            text = text.replace(/<think>[\s\S]*?<\/think>/g,'').trim();

            // combine thinking summary + output into a single log string
            const combinedOutput = thinkingSummary.trim()
                ? `<think>${thinkingSummary.trim()}\n</think>\n${text}`
                : text;

            // final single log call
            if (imageData) {
                let visionPromptText = "";
                if (contents.length > 0) {
                    const lastParts = contents[contents.length-1].parts;
                    const textPart = Array.isArray(lastParts) && lastParts.find(p=>p.text);
                    visionPromptText = textPart?.text||"";
                }
                logVision(originalTurnsForLog, imageData, combinedOutput, visionPromptText);
            } else {
                log(JSON.stringify(originalTurnsForLog), combinedOutput);
            }

            return text;

        } catch (err) {
            console.error('[Vertex] Error:', err);
            const fallbackText = "An unexpected error occurred, please try again.";
            if (imageData) {
                logVision(originalTurnsForLog, imageData, fallbackText);
            } else {
                log(JSON.stringify(originalTurnsForLog), fallbackText);
            }
            return fallbackText;
        }
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
        // Update to use generateContent directly
        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        
        try {
            console.log('Awaiting Vertex AI vision response...');
            const response = await this.genAI.models.generateContent({
                model: this.model_name,
                contents: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: imageBuffer.toString('base64')
                        }
                    }
                ],
                config: {
                    safetySettings: this.safetySettings,
                }
            });

            let text = response.text || "";
            console.log('Received.');

            if (imageBuffer && text) {
                logVision([{role: 'system', content: systemMessage}, ...turns], imageBuffer, text, prompt);
            }

            if (!text.includes(stop_seq)) return text;
            return text.slice(0, text.indexOf(stop_seq));

        } catch (err) {
            console.error('[Vertex] Vision error:', err);
            let res = "Vision is only supported by certain models.";
            if (!err.message?.includes("Image input modality is not enabled for models/")) {
                res = "An unexpected error occurred, please try again.";
            }

            const loggedTurnsForError = [{role: 'system', content: systemMessage}, ...turns];
            log(JSON.stringify(loggedTurnsForError), res);
            return res;
        }
    }

    async embed(text) {
        try {
            const result = await this.genAI.models.embedContent({
                model: "text-embedding-004",
                contents: text,
            });
            return result.embeddings || [];
        } catch (e) {
            console.error('[Vertex] Embedding error:', e);
            return [];
        }
    }
}

