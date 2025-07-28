import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from "../utils/text.js";
import fs from 'fs';
import { log, logVision } from '../../logger.js';

export class Pollinations {
    // models: https://text.pollinations.ai/models
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || "https://text.pollinations.ai/openai";
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        if (imageData) {
            const visionModels = ["openai", "openai-fast", "openai-large", "openai-roblox", "mistral", "unity", "mirexa", "searchgpt", "evil", "elixposearch", "phi", "sur", "bidara", "openai-audio"];
            if (!visionModels.some(vm => this.model_name.includes(vm))) {
                console.warn(`[pollinations] Warning: imageData provided for model ${this.model_name}, which is not explicitly a vision model. The image may be ignored or cause an error.`);
            }

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
                // No user message to attach image to, log warning or prepend a new one?
                // For now, log a warning. Prompter should ensure user message exists if imagePath is set.
                console.warn('[pollinations] imageData provided, but no user message found to attach it to. Image not sent.');
            }
        }

        const payload = {
            model: this.model_name || "openai-large",
            messages: strictFormat(messages),
            seed: Math.floor( Math.random() * (99999) ),
            referrer: "mindcraft-ce",
            ...(this.params || {})
        };

        const headers = {
            "Content-Type": "application/json"
        }

        if (hasKey("POLLINATIONS_API_KEY")) {
            headers["Authorization"] = `Bearer ${getKey("POLLINATIONS_API_KEY")}`;
        }

        let res = null;

        try {
            console.log(`Awaiting pollinations response from model`, this.model_name);
            const response = await fetch(this.url, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                console.error(`Failed to receive response. Status`, response.status, (await response.text()));
                res = "My brain disconnected, try again.";
            } else {
                const result = await response.json();
                res = result.choices[0].message.content;
            }
        } catch (err) {
            console.error(`Failed to receive response.`, err || err.message);
            res = "My brain disconnected, try again.";
        }

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

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
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

        const res = this.sendRequest(imageMessages, systemMessage);
        if (imageBuffer && res) {
            logVision([{ role: "system", content: systemMessage }].concat(messages), imageBuffer, res, systemMessage);
        }
        return res;
    }
}

export async function sendAudioRequest(text, model, voice, url) {
    const payload = {
        model: model,
        modalities: ["text", "audio"],
        audio: {
            voice: voice,
            format: "mp3",
        },
        messages: [
            {
                role: "developer",
                content: "You are an AI that echoes. Your sole function is to repeat back everything the user says to you exactly as it is written. This includes punctuation, grammar, language, and text formatting. Do not add, remove, or alter anything in the user's input in any way. Respond only with an exact duplicate of the user’s query. If there is no audio to transcribe, respond with a tab ` `"
                // this is required because pollinations attempts to send an AI response to the text instead of just saying the text.
            },
            {
                role: "user",
                content: text
            }
        ]
    }

    let audioData = null;

    const headers = {
        "Content-Type": "application/json"
    }

    if (hasKey("POLLINATIONS_API_KEY")) {
        headers["Authorization"] = `Bearer ${getKey("POLLINATIONS_API_KEY")}`;
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            console.error("Failed to get text transcription. Status", response.status, (await response.text()))
            return null;
        }

        const result = await response.json();
        audioData = result.choices[0].message.audio.data;
        return audioData;
    } catch (err) {
        console.error("TTS fetch failed:", err);
        return null;
    }
}

export async function sendSTTRequest(audioFilePath, url) {
    try {
        // Read the audio file and convert to base64
        const audioBuffer = fs.readFileSync(audioFilePath);
        const base64Audio = audioBuffer.toString('base64');
        
        // Determine audio format from file extension
        const audioFormat = audioFilePath.split('.').pop().toLowerCase();
        const supportedFormats = ['mp3', 'wav'];
        
        if (!supportedFormats.includes(audioFormat)) {
            console.warn(`[Pollinations STT] Warning: Audio format '${audioFormat}' may not be supported. Supported formats: ${supportedFormats.join(', ')}`);
        }

        const payload = {
            model: "openai-audio",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Transcribe this audio:" },
                        {
                            type: "input_audio",
                            input_audio: {
                                data: base64Audio,
                                format: audioFormat
                            }
                        }
                    ]
                }
            ]
        };

        const headers = {
            "Content-Type": "application/json"
        }

        if (hasKey("POLLINATIONS_API_KEY")) {
            headers["Authorization"] = `Bearer ${getKey("POLLINATIONS_API_KEY")}`;
        }

        console.log(`Awaiting Pollinations STT response...`);
        const response = await fetch(url || "https://text.pollinations.ai/openai", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Failed to receive STT response. Status`, response.status, (await response.text()));
            return null;
        }

        const result = await response.json();
        const transcription = result.choices[0].message.content;
        return transcription;

    } catch (err) {
        console.error(`Failed to transcribe audio with Pollinations.`, err?.message || err);
        return null;
    }
}

export class PollinationsSTT {
    constructor(url) {
        this.url = url || "https://text.pollinations.ai/openai";
    }

    async transcribe(filePath, options = {}) {
        return await sendSTTRequest(filePath, this.url);
    }
}
