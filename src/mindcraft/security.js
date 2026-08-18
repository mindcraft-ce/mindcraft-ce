import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export function normalizeBindHost(host) {
    if (host == null || host === '') return null;
    if (typeof host !== 'string') throw new Error('MindServer bind host must be a string.');
    const normalized = host.trim();
    if (!normalized) return null;
    if (/[\r\n\0]/.test(normalized)) throw new Error('MindServer bind host contains invalid control characters.');
    return normalized;
}

export function resolveMindServerBindHost(hostPublic = false, bindHost = process.env.MINDCRAFT_BIND_HOST) {
    const configured = normalizeBindHost(bindHost);
    if (configured) return configured;
    return hostPublic ? '0.0.0.0' : '127.0.0.1';
}

export function isLoopbackBindHost(host) {
    const normalized = normalizeBindHost(host);
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    if (lower === 'localhost' || lower === '::1') return true;
    if (isIP(lower) === 4) return lower.startsWith('127.');
    return false;
}

export function normalizeControlToken(token) {
    if (token == null || token === '') return null;
    if (typeof token !== 'string') throw new Error('MindServer control token must be a string.');
    const normalized = token.trim();
    if (!normalized) return null;
    if (/[\r\n\0]/.test(normalized)) throw new Error('MindServer control token contains invalid control characters.');
    return normalized;
}

export function resolveControlToken(
    hostPublic,
    token = process.env.MINDCRAFT_CONTROL_TOKEN,
    bindHost = process.env.MINDCRAFT_BIND_HOST
) {
    const normalized = normalizeControlToken(token);
    const effectiveHost = resolveMindServerBindHost(hostPublic, bindHost);
    if (!isLoopbackBindHost(effectiveHost) && !normalized) {
        throw new Error('Non-loopback MindServer binding requires MINDCRAFT_CONTROL_TOKEN.');
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
