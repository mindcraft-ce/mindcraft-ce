import { readFileSync } from 'fs';
import path from 'path';

const BASE_PROFILE_FILES = {
    survival: 'survival.json',
    assistant: 'assistant.json',
    creative: 'creative.json',
    god_mode: 'god_mode.json',
};

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function resolveProfile(profile, baseProfileName, defaultsDir) {
    const normalizedBase = String(baseProfileName ?? '').trim().toLowerCase();
    const baseProfileFile = BASE_PROFILE_FILES[normalizedBase];

    if (!baseProfileFile) {
        throw new Error(`Unknown base profile: ${baseProfileName}`);
    }

    const defaultProfile = readJson(path.join(defaultsDir, '_default.json'));
    const baseProfile = readJson(path.join(defaultsDir, baseProfileFile));

    return {
        ...defaultProfile,
        ...baseProfile,
        ...profile,
    };
}
