import { Gemini } from './gemini.js';
import { GPT } from './gpt.js';
import { Claude } from './claude.js';
import { Mistral } from './mistral.js';
import { ReplicateAPI } from './replicate.js';
import { Ollama } from './ollama.js';
import { Novita } from './novita.js';
import { GroqCloudAPI } from './groq.js';
import { HuggingFace } from './huggingface.js';
import { Qwen } from "./qwen.js";
import { Grok } from "./grok.js";
import { DeepSeek } from './deepseek.js';
import { Hyperbolic } from './hyperbolic.js';
import { GLHF } from './glhf.js';
import { OpenRouter } from './openrouter.js';
import { VLLM } from './vllm.js';

// Add new models here.
// It maps api prefixes to model classes, eg 'openai/gpt-4o' -> GPT
const apiMap = {
    'openai': GPT,
    'google': Gemini,
    'anthropic': Claude,
    'replicate': ReplicateAPI,
    'ollama': Ollama,
    'mistral': Mistral,
    'groq': GroqCloudAPI,
    'huggingface': HuggingFace,
    'novita': Novita,
    'qwen': Qwen,
    'grok': Grok,
    'deepseek': DeepSeek,
    'hyperbolic': Hyperbolic,
    'glhf': GLHF,
    'openrouter': OpenRouter,
    'vllm': VLLM,
}

export function selectAPI(profile) {
    if (typeof profile === 'string' || profile instanceof String) {
        profile = {model: profile};
    }
    const api = Object.keys(apiMap).find(key => profile.model.startsWith(key));
    if (api) {
        profile.api = api;
    }
    else {
        // backwards compatibility with local->ollama
        if (profile.model.includes('local')) {
            profile.api = 'ollama';
            profile.model = profile.model.replace('local/', '');
        }
        // check for some common models that do not require prefixes
        else if (profile.model.includes('gpt') || profile.model.includes('o1')|| profile.model.includes('o3'))
            profile.api = 'openai';
        else if (profile.model.includes('claude'))
            profile.api = 'anthropic';
        else if (profile.model.includes('gemini'))
            profile.api = "google";
        else if (profile.model.includes('grok'))
            profile.api = 'grok';
        else if (profile.model.includes('mistral'))
            profile.api = 'mistral';
        else if (profile.model.includes('deepseek'))
            profile.api = 'deepseek';
        else if (profile.model.includes('qwen'))
            profile.api = 'qwen';
    }
    if (!profile.api) {
        throw new Error('Unknown model:', profile.model);
    }
    let model_name = profile.model.replace(profile.api + '/', ''); // remove prefix
    profile.model = model_name === "" ? null : model_name; // if model is empty, set to null
    return profile;
}

export function createModel(profile) {
    if (!!apiMap[profile.model]) {
        // if the model value is an api (instead of a specific model name)
        // then set model to null so it uses the default model for that api
        profile.model = null;
    }
    if (!apiMap[profile.api]) {
        throw new Error('Unknown api:', profile.api);
    }
    const model = new apiMap[profile.api](profile.model, profile.url, profile.params);
    return model;
}