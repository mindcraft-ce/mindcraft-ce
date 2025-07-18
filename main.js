import { AgentProcess } from './src/process/agent_process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createMindServer } from './src/server/mind_server.js';
import { mainProxy } from './src/process/main_proxy.js';
import { readFileSync } from 'fs';
import { initSTT } from './src/process/stt_process.js';

// Global error handlers for protocol parsing errors
process.on('uncaughtException', (err) => {
    if (err.name === 'PartialReadError' || err.message?.includes('PartialReadError') || err.message?.includes('Unexpected buffer end')) {
        // Suppress completely - these are non-fatal protocol errors
        return;
    }
    
    // Handle empty or undefined errors (common with SES)
    if (!err || !err.message || err.message === '{}' || Object.keys(err).length === 0) {
        console.warn('Empty uncaught exception (likely non-fatal)');
        return;
    }
    
    // For other uncaught exceptions, log but don't crash immediately
    console.error('Uncaught Exception:', err.message || err);
    // Only exit for truly critical errors
    if (err.code === 'EADDRINUSE' || err.code === 'MODULE_NOT_FOUND') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason) => {
    if (reason && (reason.name === 'PartialReadError' || reason.message?.includes('PartialReadError') || reason.message?.includes('Unexpected buffer end'))) {
        // Suppress completely - these are non-fatal protocol errors
        return;
    }
    
    // Handle empty or undefined rejections
    if (!reason || !reason.message || reason.message === '{}' || Object.keys(reason).length === 0) {
        console.warn('Empty unhandled rejection (likely non-fatal)');
        return;
    }
    
    // For other unhandled rejections, log but don't crash
    console.error('Unhandled Rejection:', reason.message || reason);
});

// Override stderr.write to catch stack traces that bypass console methods
const originalStderrWrite = process.stderr.write;
process.stderr.write = function(string, encoding, callback) {
    if (typeof string === 'string') {
        // Suppress all PartialReadError and buffer end errors
        if (string.includes('PartialReadError') || string.includes('Unexpected buffer end')) {
            return true;
        }
        
        // Suppress THREE.js geometry errors
        if (string.includes('THREE.BufferGeometry.computeBoundingSphere()') || 
            string.includes('Computed radius is NaN') || 
            string.includes('The "position" attribute is likely to have NaN values')) {
            return true; // Suppress completely
        }
        
        // Suppress SES uncaught exception messages that are just "{}"
        if (string.includes('SES_UNCAUGHT_EXCEPTION: {}')) {
            return true; // Suppress completely
        }
    }
    
    // For other stderr output, use the original function
    return originalStderrWrite.call(this, string, encoding, callback);
};

// Also override stdout.write to catch similar issues there
const originalStdoutWrite = process.stdout.write;
process.stdout.write = function(string, encoding, callback) {
    // Check if the output contains problematic messages
    if (typeof string === 'string') {
        // Suppress THREE.js geometry errors
        if (string.includes('THREE.BufferGeometry.computeBoundingSphere()') || 
            string.includes('Computed radius is NaN') || 
            string.includes('The "position" attribute is likely to have NaN values')) {
            return true; // Suppress completely
        }
    }
    
    // For other stdout output, use the original function
    return originalStdoutWrite.call(this, string, encoding, callback);
};

// Override console.error to catch problematic error messages
const originalConsoleError = console.error;
console.error = function(message, ...args) {
    if (typeof message === 'string') {
        // Suppress all PartialReadError and buffer end errors
        if (message.includes('PartialReadError') || message.includes('Unexpected buffer end')) {
            return;
        }
        
        // Suppress THREE.js geometry errors
        if (message.includes('THREE.BufferGeometry.computeBoundingSphere()') || 
            message.includes('Computed radius is NaN')) {
            return; // Suppress completely
        }
        
        // Suppress SES uncaught exception messages
        if (message.includes('SES_UNCAUGHT_EXCEPTION')) {
            return; // Suppress completely
        }
    }
    
    // Check if the first argument is a problematic error object
    if (message && message.name === 'PartialReadError') {
        return; // Suppress completely
    }
    
    // Check for PartialReadError in any of the arguments
    for (let arg of [message, ...args]) {
        if (typeof arg === 'string' && (arg.includes('PartialReadError') || arg.includes('Unexpected buffer end'))) {
            return;
        }
        if (arg && arg.name === 'PartialReadError') {
            return;
        }
    }
    // For other console.error calls, use the original function
    originalConsoleError.call(console, message, ...args);
};

// Override console.trace to suppress PartialReadError stack traces
const originalConsoleTrace = console.trace;
console.trace = function(message, ...args) {
    if (typeof message === 'string' && (message.includes('PartialReadError') || message.includes('Unexpected buffer end'))) {
        console.warn('Protocol parsing error (non-fatal): PartialReadError during packet parsing');
        return;
    }
    // For other console.trace calls, use the original function
    originalConsoleTrace.call(console, message, ...args);
};

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

function getProfiles(args) {
    return args.profiles || settings.profiles;
}

async function main() {
    if (settings.host_mindserver) {
        const mindServer = createMindServer(settings.mindserver_port);
    }
    mainProxy.connect();

    const args = parseArguments();
    const profiles = getProfiles(args);
    console.log(profiles);
    const { load_memory, init_message } = settings;
    
    for (let i=0; i<profiles.length; i++) {
        const agent_process = new AgentProcess();
        const profile = readFileSync(profiles[i], 'utf8');
        const agent_json = JSON.parse(profile);
        mainProxy.registerAgent(agent_json.name, agent_process);
        agent_process.start(profiles[i], load_memory, init_message, i, args.task_path, args.task_id);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    initSTT();
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    console.error(error.stack || '', error.message || '');

    let suggestedFix = "Not sure. Try asking on Discord, or filing a GitHub issue.";

    if (error.message) {
        if (error.message.includes("ECONNREFUSED")) {
            suggestedFix = `Ensure your game is Open to LAN on port ${settings.port}, and you're playing version ${settings.minecraft_version}. If you're using a different version, change it in settings.js!`
        } else if (error.message.includes("ERR_MODULE_NOT_FOUND")) {
            suggestedFix = "Run `npm install`."
        } else if (error.message.includes("ECONNRESET")) {
            suggestedFix = `Make sure that you're playing version ${settings.minecraft_version}. If you're using a different version, change it in settings.js!`
        } else if (error.message.includes("ERR_DLOPEN_FAILED")) {
            suggestedFix = "Delete the `node_modules` folder, and run `npm install` again."
        } else if (error.message.includes("Cannot read properties of null (reading 'version')")) {
            suggestedFix = "Try again, with a vanilla Minecraft client - mindcraft-ce doesn't support mods!"
        } else if (error.message.includes("not found in keys.json")) {
            suggestedFix = "Ensure to rename `keys.example.json` to `keys.json`, and fill in the necessary API key."
        }
    }


    console.log("\n\n✨ Suggested Fix: " + suggestedFix)
    process.exit(1);
}
