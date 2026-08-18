export function parseBooleanEnv(value, name = 'environment variable') {
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`${name} must be a boolean value (true/false, 1/0, yes/no, on/off).`);
}

export function parseIntegerEnv(value, name = 'environment variable', { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    const normalized = String(value).trim();
    if (!/^-?\d+$/.test(normalized)) {
        throw new Error(`${name} must be an integer.`);
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isSafeInteger(parsed)) {
        throw new Error(`${name} must be a safe integer.`);
    }
    if (parsed < min || parsed > max) {
        throw new Error(`${name} must be between ${min} and ${max}.`);
    }
    return parsed;
}

export function parseJsonEnv(value, name = 'environment variable') {
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`${name} must contain valid JSON: ${error.message}`);
    }
}

export function parseJsonObjectEnv(value, name = 'environment variable') {
    const parsed = parseJsonEnv(value, name);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error(`${name} must contain a JSON object.`);
    }
    return parsed;
}
