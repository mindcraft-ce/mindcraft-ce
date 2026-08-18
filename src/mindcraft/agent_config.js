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

export function validateAgentSettings(settings) {
    const agentSettings = Object.fromEntries(
        Object.entries(settings).filter(([key]) => !ROOT_ONLY_SETTINGS.has(key))
    );
    return createAgentConfig(agentSettings, settingsSpec);
}

export function freezeResolvedAgentSettings(settings) {
    return deepFreeze(structuredClone(settings));
}
