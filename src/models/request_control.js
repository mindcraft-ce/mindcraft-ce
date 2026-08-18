export class RequestTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Model request timed out after ${timeoutMs} ms.`);
        this.name = 'RequestTimeoutError';
        this.code = 'MODEL_REQUEST_TIMEOUT';
        this.timeoutMs = timeoutMs;
    }
}

export class RequestAbortedError extends Error {
    constructor(reason = 'Model request aborted.') {
        super(typeof reason === 'string' ? reason : 'Model request aborted.');
        this.name = 'RequestAbortedError';
        this.code = 'MODEL_REQUEST_ABORTED';
    }
}

const activeControllers = new Set();

export function abortActiveModelRequests(reason = 'Model requests cancelled during shutdown.') {
    for (const controller of activeControllers) {
        if (!controller.signal.aborted) {
            controller.abort(reason);
        }
    }
}

export function activeModelRequestCount() {
    return activeControllers.size;
}

export async function runAbortableRequest(operation, { timeoutMs = 120000, signal } = {}) {
    if (typeof operation !== 'function') {
        throw new TypeError('runAbortableRequest requires an operation function.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new RangeError('timeoutMs must be a positive integer.');
    }

    const controller = new AbortController();
    activeControllers.add(controller);
    let timedOut = false;
    let timeout;
    let externalAbort;

    const abortPromise = new Promise((_, reject) => {
        const rejectForAbort = () => {
            if (timedOut) {
                reject(new RequestTimeoutError(timeoutMs));
            } else {
                reject(new RequestAbortedError(controller.signal.reason ?? signal?.reason));
            }
        };
        controller.signal.addEventListener('abort', rejectForAbort, { once: true });
    });

    if (signal) {
        if (signal.aborted) {
            controller.abort(signal.reason);
        } else {
            externalAbort = () => controller.abort(signal.reason);
            signal.addEventListener('abort', externalAbort, { once: true });
        }
    }

    timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(new RequestTimeoutError(timeoutMs));
    }, timeoutMs);

    try {
        return await Promise.race([
            Promise.resolve().then(() => operation(controller.signal)),
            abortPromise,
        ]);
    } finally {
        clearTimeout(timeout);
        activeControllers.delete(controller);
        if (signal && externalAbort) signal.removeEventListener('abort', externalAbort);
    }
}
