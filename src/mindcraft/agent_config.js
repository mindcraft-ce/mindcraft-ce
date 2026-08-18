import { readFileSync } from 'node:fs';
import { createAgentConfig, deepFreeze } from '../utils/config.js';

const settingsSpec = JSON.parse(
    readFileSync(new URL('./public/settings_spec.json', import.meta.url), 'utf8')
);

const ROOT_ONLY_SETTINGS = new Set([
    'profiles',
    'mindserver_port',
    'auto_open_ui',
]);

const AGENT_NAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

export function normalizeAgentName(name) {
    if (typeof name !== 'string') {
        throw new TypeError('Agent name must be a string.');
    }
    const normalized = name.trim();
    if (!AGENT_NAME_PATTERN.test(normalized)) {
        throw new Error(`Invalid agent name '${name}'. Must be 3-16 alphanumeric/underscore characters.`);
    }
    return normalized;
}

export function validateAgentSettings(settings) {
    const agentSettings = Object.fromEntries(
        Object.entries(settings).filter(([key]) => !ROOT_ONLY_SETTINGS.has(key))
    );
    const config = structuredClone(createAgentConfig(agentSettings, settingsSpec));
    if (!config.profile || typeof config.profile !== 'object' || Array.isArray(config.profile)) {
        throw new TypeError('Agent profile must be an object.');
    }
    config.profile.name = normalizeAgentName(config.profile.name);
    return deepFreeze(config);
}

export function freezeResolvedAgentSettings(settings) {
    return deepFreeze(structuredClone(settings));
}
