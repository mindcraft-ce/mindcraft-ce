import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { runAbortableRequest } from './request_control.js';
import { classifyProviderError, ProviderErrorKind } from './provider_error.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

function splitRequestParams(params) {
    const providerParams = { ...(params || {}) };
    const configured = Number(providerParams.request_timeout_ms);
    delete providerParams.request_timeout_ms;
    return {
        providerParams,
        timeoutMs: Number.isInteger(configured) && configured > 0
            ? configured
            : DEFAULT_REQUEST_TIMEOUT_MS,
    };
}

export class GPT {
    static prefix = 'openai';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        const { providerParams, timeoutMs } = splitRequestParams(params);
        this.params = providerParams;
        this.requestTimeoutMs = timeoutMs;
        this.url = url;

        const config = {};
        if (url)
            config.baseURL = url;

        if (hasKey('OPENAI_ORG_ID'))
            config.organization = getKey('OPENAI_ORG_ID');

        config.apiKey = getKey('OPENAI_API_KEY');
        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***', { signal } = {}) {
        const model = this.model_name || 'gpt-5.4-mini';
        let res = null;

        try {
            console.log('Awaiting openai api response from model', model);
            if (this.url) {
                let messages = [{ role: 'system', content: systemMessage }].concat(turns);
                messages = strictFormat(messages);
                const pack = {
                    model,
                    messages,
                    stop: stop_seq,
                    ...(this.params || {})
                };
                if (model.includes('o1') || model.includes('o3') || model.includes('5')) {
                    delete pack.stop;
                }
                const completion = await runAbortableRequest(
                    requestSignal => this.openai.chat.completions.create(pack, { signal: requestSignal }),
                    { timeoutMs: this.requestTimeoutMs, signal }
                );
                if (completion.choices[0].finish_reason === 'length')
                    throw new Error('Context length exceeded');
                console.log('Received.');
                res = completion.choices[0].message.content;
            }
            else {
                let messages = strictFormat(turns);
                messages = messages.map(message => ({
                    ...message,
                    content: message.content + stop_seq,
                }));
                const response = await runAbortableRequest(
                    requestSignal => this.openai.responses.create({
                        model,
                        instructions: systemMessage,
                        input: messages,
                        ...(this.params || {})
                    }, { signal: requestSignal }),
                    { timeoutMs: this.requestTimeoutMs, signal }
                );
                console.log('Received.');
                res = response.output_text;
                const stop_seq_index = res.indexOf(stop_seq);
                res = stop_seq_index !== -1 ? res.slice(0, stop_seq_index) : res;
            }
        }
        catch (err) {
            const providerError = classifyProviderError(err);
            if (providerError.kind === ProviderErrorKind.CONTEXT_LENGTH && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return this.sendRequest(turns.slice(1), systemMessage, stop_seq, { signal });
            }
            if (String(providerError.message).includes('image_url')) {
                console.log(providerError);
                return 'Vision is only supported by certain models.';
            }
            console.log(providerError);
            throw providerError;
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer, requestOptions = {}) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: 'user',
            content: [
                { type: 'input_text', text: systemMessage },
                {
                    type: 'input_image',
                    image_url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                }
            ]
        });

        return this.sendRequest(imageMessages, systemMessage, '***', requestOptions);
    }

    async embed(text, { signal } = {}) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        try {
            const embedding = await runAbortableRequest(
                requestSignal => this.openai.embeddings.create({
                    model: this.model_name || 'text-embedding-3-small',
                    input: text,
                    encoding_format: 'float',
                }, { signal: requestSignal }),
                { timeoutMs: this.requestTimeoutMs, signal }
            );
            return embedding.data[0].embedding;
        } catch (error) {
            throw classifyProviderError(error);
        }
    }
}

const sendAudioRequest = async (text, model, voice, url) => {
    const payload = {
        model,
        voice,
        input: text
    };

    const config = {};
    if (url)
        config.baseURL = url;

    if (hasKey('OPENAI_ORG_ID'))
        config.organization = getKey('OPENAI_ORG_ID');

    config.apiKey = getKey('OPENAI_API_KEY');
    const openai = new OpenAIApi(config);

    try {
        const mp3 = await runAbortableRequest(
            requestSignal => openai.audio.speech.create(payload, { signal: requestSignal }),
            { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS }
        );
        const buffer = Buffer.from(await mp3.arrayBuffer());
        return buffer.toString('base64');
    } catch (error) {
        throw classifyProviderError(error);
    }
};

export const TTSConfig = {
    sendAudioRequest,
    baseUrl: 'https://api.openai.com/v1',
};
