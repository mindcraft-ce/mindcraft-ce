import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class Andy {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        
        // Andy API configuration
        let config = {
            baseURL: url || 'https://mindcraft.riqvip.dev/api/andy/v1',
            apiKey: getKey('ANDY_API_KEY') || 'no-key-needed' // Can work without key but with limits
        };
        
        this.openai = new OpenAIApi(config);
        this.supportsRawImageInput = true;
        this.fallbackToPool = true; // Enable pool fallback
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        messages = strictFormat(messages);

        if (imageData) {
            // Andy API supports vision capabilities depending on available hosts
            let lastUserMessageIndex = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            if (lastUserMessageIndex !== -1) {
                const originalContent = messages[lastUserMessageIndex].content;
                messages[lastUserMessageIndex].content = [
                    { type: "text", text: originalContent },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${imageData.toString('base64')}`
                        }
                    }
                ];
            } else {
                console.warn('[Andy] imageData provided, but no user message found to attach it to. Image not sent.');
            }
        }

        const pack = {
            model: this.model_name || "andy-4",
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };

        let res = null;
        try {
            console.log('Awaiting Andy API response from model', this.model_name);

            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length') {
                throw new Error('Context length exceeded');
            }
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            console.log('Andy API error:', err.message);
            
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, imageData, stop_seq);
            } else if (err.message.includes('rate limit') || err.message.includes('429')) {
                res = 'I thought too hard, sorry, try again.';
            } else if (err.message.includes('image_url') || err.message.includes('vision')) {
                console.log(err);
                res = 'Vision is only supported when compatible hosts are available.';
            } else if (err.message.includes('No available hosts')) {
                res = 'No compute hosts are currently available. Please try again later.';
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }

        // Handle thinking tags for o1-style models
        if (typeof res === 'string') {
            res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }

        // Log the interaction
        if (imageData) {
            const conversationForLogVision = [{ role: "system", content: systemMessage }].concat(turns);
            let visionPromptText = "";
            if (turns.length > 0) {
                const lastTurn = turns[turns.length - 1];
                if (lastTurn.role === 'user') {
                    if (typeof lastTurn.content === 'string') {
                        visionPromptText = lastTurn.content;
                    } else if (Array.isArray(lastTurn.content)) {
                        const textPart = lastTurn.content.find(part => part.type === 'text');
                        if (textPart) visionPromptText = textPart.text;
                    }
                }
            }
            logVision(conversationForLogVision, imageData, res, visionPromptText);
        } else {
            log(JSON.stringify([{ role: "system", content: systemMessage }].concat(turns)), res);
        }
        
        return res;
    }

    async sendVisionRequest(original_turns, systemMessage, imageBuffer) {
        const imageFormattedTurns = [...original_turns];
        imageFormattedTurns.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` }
                }
            ]
        });
        
        const res = await this.sendRequest(imageFormattedTurns, systemMessage);

        if (imageBuffer && res) {
            logVision([{ role: "system", content: systemMessage }].concat(original_turns), imageBuffer, res, systemMessage);
        }
        return res;
    }

    async embed(text) {
        // Andy API doesn't currently support embeddings, so we'll return a placeholder
        console.warn('[Andy] Embeddings not supported by Andy API. Consider using a different model for embeddings.');
        
        // Return a random embedding vector as fallback
        const dimension = 1536; // Standard OpenAI embedding size
        return Array.from({ length: dimension }, () => Math.random() - 0.5);
    }

    async checkAPIStatus() {
        /**
         * Check the status of the Andy API pool
         * This is a convenience method for debugging
         */
        try {
            const response = await fetch('https://mindcraft.riqvip.dev/api/andy/pool_status');
            const status = await response.json();
            console.log('[Andy] Pool Status:', {
                totalHosts: status.total_hosts,
                activeHosts: status.active_hosts,
                totalModels: status.total_models
            });
            return status;
        } catch (err) {
            console.warn('[Andy] Could not fetch pool status:', err.message);
            return null;
        }
    }

    async listAvailableModels() {
        /**
         * Get list of currently available models in the pool
         */
        try {
            const response = await fetch('https://mindcraft.riqvip.dev/api/andy/models');
            const models = await response.json();
            console.log('[Andy] Available models:', models.models.map(m => m.name));
            return models.models;
        } catch (err) {
            console.warn('[Andy] Could not fetch available models:', err.message);
            return [];
        }
    }
}
