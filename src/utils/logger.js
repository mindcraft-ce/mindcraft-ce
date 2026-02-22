import settings from '../agent/settings.js';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'];

function getTimestamp() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

function parseLevel(str) {
    if (!str) return LEVELS.INFO;
    const upper = str.toUpperCase();
    return LEVELS[upper] !== undefined ? LEVELS[upper] : LEVELS.INFO;
}

function getEffectiveLevel(mod) {
    const overrides = settings.log_module_levels || {};
    if (mod && overrides[mod] !== undefined)
        return parseLevel(overrides[mod]);
    return parseLevel(settings.log_level);
}

function formatArgs(args) {
    return args.map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
}

function logAt(level, mod, args) {
    if (level < getEffectiveLevel(mod)) return;

    const prefix = `[${getTimestamp()}] [${LEVEL_NAMES[level]}] [${mod}]`;
    const msg = formatArgs(args);

    if (level === LEVELS.ERROR) console.error(prefix, msg);
    else if (level === LEVELS.WARN) console.warn(prefix, msg);
    else console.log(prefix, msg);
}

export function createLogger(mod) {
    return {
        debug: (...args) => logAt(LEVELS.DEBUG, mod, args),
        info:  (...args) => logAt(LEVELS.INFO, mod, args),
        warn:  (...args) => logAt(LEVELS.WARN, mod, args),
        error: (...args) => logAt(LEVELS.ERROR, mod, args),
    };
}
