import { Agent } from '../agent/agent.js';
import { serverProxy } from '../agent/mindserver_proxy.js';
import yargs from 'yargs';

// Suppress mineflayer's PartialReadError protocol-parser noise. Doesn't affect
// gameplay — just floods logs (76k occurrences in one session) and makes real
// errors hard to find with grep. The error is THROWN by mineflayer's protocol
// parser and reaches the runtime via three paths: console.error, stderr.write
// (Node's default uncaughtException printer), and unhandledRejection. Wrap
// all three.
{
    const isPartialRead = (s) => typeof s === 'string' && s.includes('PartialReadError');

    const origErr = console.error;
    console.error = (...args) => {
        const first = args[0];
        const s = first && first.toString ? first.toString() : '';
        if (isPartialRead(s)) return;
        origErr(...args);
    };

    // Node prints uncaught throws via process.stderr.write — intercept that too.
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
        const s = typeof chunk === 'string' ? chunk : (chunk?.toString?.() || '');
        if (isPartialRead(s)) return true;
        return origStderrWrite(chunk, ...rest);
    };

    process.on('uncaughtException', (err) => {
        if (err && (err.name === 'PartialReadError' || isPartialRead(err.message))) return;
        origErr('uncaughtException:', err);
    });
    process.on('unhandledRejection', (reason) => {
        if (reason && (reason.name === 'PartialReadError' || isPartialRead(reason?.message))) return;
        origErr('unhandledRejection:', reason);
    });
}

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js -n <agent_name> -p <port> -l <load_memory> -m <init_message> -c <count_id>');
    process.exit(1);
}

const argv = yargs(args)
    .option('name', {
        alias: 'n',
        type: 'string',
        description: 'name of agent'
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
    .option('count_id', {
        alias: 'c',
        type: 'number',
        default: 0,
        description: 'identifying count for multi-agent scenarios',
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'port of mindserver'
    })
    .argv;

(async () => {
    try {
        console.log('Connecting to MindServer');
        await serverProxy.connect(argv.name, argv.port);
        console.log('Starting agent');
        const agent = new Agent();
        serverProxy.setAgent(agent);
        await agent.start(argv.load_memory, argv.init_message, argv.count_id);
    } catch (error) {
        console.error('Failed to start agent process:');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
