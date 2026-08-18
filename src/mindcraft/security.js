import { timingSafeEqual } from 'node:crypto';

export function normalizeBindHost(host) {
    if (host == null || host === '') return null;
    if (typeof host !== 'string') {
        throw new Error('MindServer bind host must be a string.');
    }
    const normalized = host.trim();
    if (!normalized) return null;
    if (/[\r\n\0]/.test(normalized)) {
        throw new Error('MindServer bind host contains invalid control characters.');
    }
    return normalized;
}

export function resolveMindServerBindHost(hostPublic = false, bindHost = process.env.MINDCRAFT_BIND_HOST) {
    const configured = normalizeBindHost(bindHost);
    if (configured) return configured;
    return hostPublic ? '0.0.0.0' : '127.0.0.1';
}

export function normalizeControlToken(token) {
    if (token == null || token === '') return null;
    if (typeof token !== 'string') {
        throw new Error('MindServer control token must be a string.');
    }
    const normalized = token.trim();
    if (!normalized) return null;
    if (/[\r\n\0]/.test(normalized)) {
        throw new Error('MindServer control token contains invalid control characters.');
    }
    return normalized;
}

export function resolveControlToken(hostPublic, token = process.env.MINDCRAFT_CONTROL_TOKEN) {
    const normalized = normalizeControlToken(token);
    if (hostPublic && !normalized) {
        throw new Error('Public MindServer hosting requires MINDCRAFT_CONTROL_TOKEN.');
    }
    return normalized;
}

export function isAuthorizedControlRequest(providedToken, expectedToken) {
    const expected = normalizeControlToken(expectedToken);
    if (!expected || typeof providedToken !== 'string') return false;

    let provided;
    try {
        provided = normalizeControlToken(providedToken);
    } catch {
        return false;
    }
    if (!provided) return false;

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
}
