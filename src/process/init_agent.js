import { Agent } from '../agent/agent.js';
import yargs from 'yargs';

// Add global error handlers for protocol parsing errors
process.on('uncaughtException', (err) => {
    if (err.name === 'PartialReadError' || err.message?.includes('PartialReadError')) {
        console.warn('Uncaught PartialReadError (non-fatal):', err.message);
        // Don't exit the process for these errors
        return;
    }
    
    // For other uncaught exceptions, use default behavior
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Add global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    if (reason && (reason.name === 'PartialReadError' || reason.message?.includes('PartialReadError'))) {
        console.warn('Unhandled PartialReadError rejection (non-fatal):', reason.message);
        // Don't exit the process for these errors
        return;
    }
    
    console.error('Unhandled Rejection at:', {
        promise: promise,
        reason: reason,
        stack: reason?.stack || 'No stack trace'
    });
    process.exit(1);
});

// Override console.error to catch PartialReadError stack traces
const originalConsoleError = console.error;
console.error = function(message, ...args) {
    // Check if this is a PartialReadError stack trace
    if (typeof message === 'string' && message.includes('PartialReadError: Read error for undefined')) {
        console.warn('Protocol parsing error (non-fatal): PartialReadError during packet parsing');
        return;
    }
    
    // Check if the first argument is a PartialReadError object
    if (message && message.name === 'PartialReadError') {
        console.warn('Protocol parsing error (non-fatal):', message.message);
        return;
    }
    
    // For other console.error calls, use the original function
    originalConsoleError.call(console, message, ...args);
};

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [profile] [load_memory] [init_message]');
    process.exit(1);
}

const argv = yargs(args)
    .option('profile', {
        alias: 'p',
        type: 'string',
        description: 'profile filepath to use for agent'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load agent memory from file on startup'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    })
    .option('task_path', {
        alias: 't',
        type: 'string',
        description: 'task filepath to use for agent'
    })
    .option('task_id', {
        alias: 'i',
        type: 'string',
        description: 'task ID to execute'
    })
    .option('count_id', {
        alias: 'c',
        type: 'number',
        default: 0,
        description: 'identifying count for multi-agent scenarios',
    }).argv;

// Wrap agent start in async IIFE
(async () => {
    console.log('Starting agent with profile:', argv.profile);
    const agent = new Agent();
    await agent.start(argv.profile, argv.load_memory, argv.init_message, argv.count_id, argv.task_path, argv.task_id);

    // removed error handling so that `main.js` can catch it and debug
})();
