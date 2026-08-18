function cloneValue(value) {
    if (value === undefined) return undefined;
    return structuredClone(value);
}

function matchesType(value, type) {
    switch (type) {
        case 'array': return Array.isArray(value);
        case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
        case 'number': return typeof value === 'number' && Number.isFinite(value);
        case 'boolean': return typeof value === 'boolean';
        case 'string': return typeof value === 'string';
        default: throw new Error(`Unsupported settings schema type: ${type}`);
    }
}

function isNullable(definition) {
    return definition?.nullable === true || definition?.default === null;
}

export function validateSettings(settings, spec, { allowUnknown = false, applyDefaults = true } = {}) {
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) throw new TypeError('Settings must be an object.');
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw new TypeError('Settings specification must be an object.');

    const result = {};
    for (const [key, definition] of Object.entries(spec)) {
        let value = settings[key];
        if (value === undefined && applyDefaults && Object.prototype.hasOwnProperty.call(definition, 'default')) value = cloneValue(definition.default);
        if (value === undefined) {
            if (definition.required) throw new Error(`Setting ${key} is required.`);
            continue;
        }
        if (value === null && isNullable(definition)) {
            result[key] = null;
            continue;
        }
        if (definition.type && !matchesType(value, definition.type)) throw new TypeError(`Setting ${key} must be of type ${definition.type}.`);
        if (definition.options && !definition.options.includes(value)) throw new Error(`Setting ${key} must be one of: ${definition.options.join(', ')}.`);
        result[key] = cloneValue(value);
    }

    const unknown = Object.keys(settings).filter(key => !(key in spec));
    if (!allowUnknown && unknown.length > 0) throw new Error(`Unknown settings: ${unknown.join(', ')}.`);
    if (allowUnknown) {
        for (const key of unknown) result[key] = cloneValue(settings[key]);
    }
    return result;
}

export function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

export function createAgentConfig(settings, spec, options) {
    return deepFreeze(validateSettings(settings, spec, options));
}
