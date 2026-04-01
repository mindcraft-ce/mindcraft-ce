import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync, mkdirSync, existsSync, renameSync, statSync, createWriteStream } from 'fs';
import path from 'path';

// --- CONSOLE LOGGING TO FILE ---
// Mirrors ALL console output (stdout + stderr) to a timestamped log file.
// On startup, the previous log is archived so each session has a clean file.
// Logs live in ./logs/ — read them to diagnose issues without needing terminal paste.
const LOG_DIR = './logs';
const CURRENT_LOG = path.join(LOG_DIR, 'latest.log');
mkdirSync(LOG_DIR, { recursive: true });

// Archive previous log if it exists
if (existsSync(CURRENT_LOG)) {
    try {
        const ts = statSync(CURRENT_LOG).mtime.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        renameSync(CURRENT_LOG, path.join(LOG_DIR, `session_${ts}.log`));
    } catch (_) {}
}

// Create write stream for current session
const logStream = createWriteStream(CURRENT_LOG, { flags: 'w' });

// Intercept console.log, console.warn, console.error to write to both terminal and file
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function formatArgs(args) {
    return args.map(a => {
        if (typeof a === 'object') {
            try { return JSON.stringify(a); }
            catch (_) { return '[object Circular]'; }
        }
        return String(a);
    }).join(' ');
}

console.log = (...args) => {
    const line = `[LOG ${new Date().toISOString()}] ${formatArgs(args)}`;
    origLog.apply(console, args);
    logStream.write(line + '\n');
};
console.warn = (...args) => {
    const line = `[WARN ${new Date().toISOString()}] ${formatArgs(args)}`;
    origWarn.apply(console, args);
    logStream.write(line + '\n');
};
console.error = (...args) => {
    const line = `[ERROR ${new Date().toISOString()}] ${formatArgs(args)}`;
    origError.apply(console, args);
    logStream.write(line + '\n');
};

// Also capture uncaught errors
process.on('uncaughtException', (err) => {
    const line = `[FATAL ${new Date().toISOString()}] Uncaught: ${err.stack || err}`;
    logStream.write(line + '\n');
    origError('Uncaught exception:', err);
});

console.log('=== Mindcraft session started ===');

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}
const args = parseArguments();
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    let tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = process.env.MINDSERVER_PORT;
}
if (process.env.PROFILES && JSON.parse(process.env.PROFILES).length > 0) {
    settings.profiles = JSON.parse(process.env.PROFILES);
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
}
if (process.env.MAX_MESSAGES) {
    settings.max_messages = process.env.MAX_MESSAGES;
}
if (process.env.NUM_EXAMPLES) {
    settings.num_examples = process.env.NUM_EXAMPLES;
}
if (process.env.LOG_ALL) {
    settings.log_all_prompts = process.env.LOG_ALL;
}

Mindcraft.init(false, settings.mindserver_port, settings.auto_open_ui);

for (let profile of settings.profiles) {
    const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
    settings.profile = profile_json;
    Mindcraft.createAgent(settings);
}