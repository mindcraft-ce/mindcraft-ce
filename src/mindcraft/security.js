import { timingSafeEqual } from 'node:crypto';

export function resolveMindServerBindHost(hostPublic = false) {
    return hostPublic ? '0.0.0.0' : '127.0.0.1';
}

export function normalizeControlToken(token) {
    if (token == null || token === '') return null;
    if (typeof token !== 'string') {
        throw new Error('MindServer control token must be a string.');
    }
    const normalized = token.trim();
    if (!normalized) return null;
    if (/[/\r\n\0]/.test(normalized)) {
        throw new Error('MindServer control token contains invalid control characters.');
    }
    return normalized;
}

export function isAuthorizedControlRequest(providedToken, expectedToken) {
    const expected = normalizeControlToken(expectedToken);
    if (!expected) return false;

    const provided = normalizeControlToken(providedToken);
    if (!provided) return false;

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
}
