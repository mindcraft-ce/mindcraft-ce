const MAX_COMMAND_LENGTH = 16 * 1024;
const MAX_NESTING_DEPTH = 32;

function assertInputSize(text) {
    if (text.length > MAX_COMMAND_LENGTH) {
        throw new SyntaxError(`Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters.`);
    }
}

function assertValueDepth(value, depth = 0) {
    if (depth > MAX_NESTING_DEPTH) {
        throw new SyntaxError(`Command arguments exceed maximum nesting depth of ${MAX_NESTING_DEPTH}.`);
    }
    if (value === null || typeof value !== 'object') return;
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
        assertValueDepth(child, depth + 1);
    }
}

function findClosingParen(text, openIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = openIndex; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '(') {
            depth++;
        } else if (char === ')') {
            depth--;
            if (depth === 0) return i;
        }
    }

    throw new SyntaxError('Command is missing a closing parenthesis.');
}

export function parseStructuredCommand(message) {
    if (typeof message !== 'string') throw new TypeError('Command message must be a string.');
    assertInputSize(message);

    const match = /!(\w+)/.exec(message);
    if (!match) return null;

    const commandName = `!${match[1]}`;
    const start = match.index;
    let cursor = start + match[0].length;
    while (/\s/.test(message[cursor] ?? '')) cursor++;

    if (message[cursor] !== '(') {
        return { commandName, args: [], start, end: cursor };
    }

    const close = findClosingParen(message, cursor);
    const rawArgs = message.slice(cursor + 1, close).trim();
    let args = [];

    if (rawArgs) {
        try {
            args = JSON.parse(`[${rawArgs}]`);
        } catch (error) {
            throw new SyntaxError(`Invalid command arguments: ${error.message}`, { cause: error });
        }
        assertValueDepth(args);
    }

    return {
        commandName,
        args,
        start,
        end: close + 1,
    };
}

export function truncateToStructuredCommand(message) {
    const parsed = parseStructuredCommand(message);
    if (!parsed) return message;
    return message.slice(0, parsed.end);
}

export const structuredCommandLimits = Object.freeze({
    maxLength: MAX_COMMAND_LENGTH,
    maxDepth: MAX_NESTING_DEPTH,
});
