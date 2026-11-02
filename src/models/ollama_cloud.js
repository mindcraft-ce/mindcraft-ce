import { Ollama } from './ollama.js';
import { getKey } from '../utils/keys.js';

export class OllamaCloud extends Ollama {
    static prefix = 'ollama_cloud';

    constructor(model_name, url, params) {
        super(model_name || 'gpt-oss:120b', url || 'https://ollama.com', params);
        this.apiKey = getKey('OLLAMA_API_KEY');
    }

    embed() {
        return Promise.reject(new Error('Use a local Ollama embedding model or another embedding provider with Ollama Cloud.'));
    }
}
