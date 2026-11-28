/**
 * Default max_tokens for a Claude request.
 *
 * Newer models think by default, and that thinking counts toward max_tokens, so 4,096 cut long turns
 * short. They also accept a much larger output limit. Claude 3.5 and earlier do not: they cap output at
 * 8,192 (Claude 3.0 at 4,096), so sending 16,000 to one of them is a 400 on every call. Keep the default
 * per model, and leave room for an explicit thinking budget when one is set.
 */
export function defaultClaudeMaxTokens(model, thinkingBudget) {
    if (Number.isFinite(thinkingBudget) && thinkingBudget > 0)
        return thinkingBudget + 1000;
    const name = String(model || '').toLowerCase().split('/').pop();
    if (/^claude-3-5(?:-|$)/.test(name))
        return 8192;
    if (/^claude-3-(?:opus|sonnet|haiku)(?:-|$)/.test(name))
        return 4096;
    if (/^claude-(?:2|instant)(?:[.-]|$)/.test(name))
        return 4096;
    return 16000;
}
