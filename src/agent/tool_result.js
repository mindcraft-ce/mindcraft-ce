const statuses = new Set(['ok', 'partial', 'failed', 'blocked', 'cancelled']);
export function toolResult(status, text, code = null, details = {}) {
    if (!statuses.has(status)) throw new Error(`Invalid tool status: ${status}`);
    return {status, text: String(text ?? ''), ...(code ? {code} : {}), ...details};
}
export function asToolResult(value) {
    if (value && statuses.has(value.status) && typeof value.text === 'string') return value;
    const text = String(value ?? 'Success (no output)');
    return toolResult(/^error|failed|could not|don't have/i.test(text) ? 'failed' : 'ok', text);
}
export function toolResultText(value) {
    const result = asToolResult(value);
    return result.status === 'ok' ? result.text : `[${result.status}${result.code ? `: ${result.code}` : ''}] ${result.text}`;
}
