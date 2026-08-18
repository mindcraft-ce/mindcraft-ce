import { ProviderError } from './provider_error.js';
import {
    RequestAbortedError,
    RequestTimeoutError,
    runAbortableRequest,
} from './request_control.js';

export const DEFAULT_RESPONSE_TIMEOUT_MS = 120000;

export function resolveResponseTimeoutMs(modelProfile) {
    const configured = Number(modelProfile?.params?.request_timeout_ms);
    return Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_RESPONSE_TIMEOUT_MS;
}

export function shouldRetryPromptError(error) {
    if (error instanceof ProviderError) return false;
    if (error instanceof RequestTimeoutError || error instanceof RequestAbortedError) return false;
    return true;
}

export async function sendWithResponseDeadline(
    model,
    turns,
    systemMessage,
    { timeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS, stopSeq = '***' } = {}
) {
    return runAbortableRequest(
        signal => model.sendRequest(turns, systemMessage, stopSeq, { signal }),
        { timeoutMs }
    );
}
