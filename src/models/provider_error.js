export const ProviderErrorKind = Object.freeze({
    AUTH: 'auth',
    RATE_LIMIT: 'rate_limit',
    TIMEOUT: 'timeout',
    CANCELLED: 'cancelled',
    CONTEXT_LENGTH: 'context_length',
    BAD_REQUEST: 'bad_request',
    SERVER: 'server',
    NETWORK: 'network',
    UNKNOWN: 'unknown',
});

export class ProviderError extends Error {
    constructor(message, { kind = ProviderErrorKind.UNKNOWN, retryable = false, status = null, cause = null } = {}) {
        super(message, { cause });
        this.name = 'ProviderError';
        this.kind = kind;
        this.retryable = retryable;
        this.status = status;
    }
}

export function classifyProviderError(error) {
    if (error instanceof ProviderError) return error;

    const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status) || null;
    const code = String(error?.code ?? '').toLowerCase();
    const name = String(error?.name ?? '').toLowerCase();
    const message = String(error?.message ?? error ?? 'Unknown provider error');
    const normalized = message.toLowerCase();

    let kind = ProviderErrorKind.UNKNOWN;
    let retryable = false;

    if (status === 401 || status === 403 || normalized.includes('api key') || normalized.includes('unauthorized')) {
        kind = ProviderErrorKind.AUTH;
    } else if (status === 429 || normalized.includes('rate limit')) {
        kind = ProviderErrorKind.RATE_LIMIT;
        retryable = true;
    } else if (code.includes('abort') || name.includes('abort') || normalized.includes('cancelled') || normalized.includes('canceled')) {
        kind = ProviderErrorKind.CANCELLED;
    } else if (code.includes('timeout') || name.includes('timeout') || normalized.includes('timed out')) {
        kind = ProviderErrorKind.TIMEOUT;
        retryable = true;
    } else if (code === 'context_length_exceeded' || normalized.includes('context length')) {
        kind = ProviderErrorKind.CONTEXT_LENGTH;
    } else if (status != null && status >= 500) {
        kind = ProviderErrorKind.SERVER;
        retryable = true;
    } else if (status != null && status >= 400) {
        kind = ProviderErrorKind.BAD_REQUEST;
    } else if (['econnreset', 'econnrefused', 'enotfound', 'etimedout'].some(value => code.includes(value))) {
        kind = ProviderErrorKind.NETWORK;
        retryable = true;
    }

    return new ProviderError(message, { kind, retryable, status, cause: error });
}

function cancelledFromSignal(signal) {
    const reason = signal?.reason;
    const message = typeof reason === 'string' && reason ? reason : 'Provider request cancelled.';
    return new ProviderError(message, {
        kind: ProviderErrorKind.CANCELLED,
        retryable: false,
        cause: reason instanceof Error ? reason : null,
    });
}

function wait(ms, signal) {
    if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
    if (signal.aborted) return Promise.reject(cancelledFromSignal(signal));

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timeout);
            reject(cancelledFromSignal(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export async function withProviderRetries(operation, {
    maxAttempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 2000,
    signal,
} = {}) {
    if (typeof operation !== 'function') {
        throw new TypeError('withProviderRetries requires an operation function.');
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new RangeError('maxAttempts must be a positive integer.');
    }

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal?.aborted) throw cancelledFromSignal(signal);
        try {
            return await operation(attempt);
        } catch (error) {
            const providerError = classifyProviderError(error);
            lastError = providerError;
            if (!providerError.retryable || attempt === maxAttempts) {
                throw providerError;
            }

            const delayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
            await wait(delayMs, signal);
        }
    }

    throw lastError;
}
