import { serverProxy } from '../agent/mindserver_proxy.js';
import { installGracefulShutdown } from './graceful_shutdown.js';
import yargs from 'yargs';

const nativeExit = process.exit.bind(process);
const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js -n <agent_name> -p <port> -l <load_memory> -m <init_message> -c <count_id>');
    nativeExit(1);
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

await (async () => {
    let agent = null;
    try {
        console.log('Connecting to MindServer');
        await serverProxy.connect(argv.name, argv.port);

        // Keep #75's invariant: settings are loaded before the Agent dependency
        // graph (which contains import-time settings reads) is evaluated.
        const { Agent } = await import('../agent/agent.js');

        console.log('Starting agent');
        agent = new Agent();
        installGracefulShutdown(agent, {
            disconnect: () => serverProxy.getSocket()?.disconnect(),
            exit: nativeExit,
        });

        // Route runtime process.exit() calls through persistence and cleanup.
        process.exit = (code = 0) => {
            const numericCode = Number(code);
            const exitCode = Number.isInteger(numericCode) ? numericCode : 1;
            void agent.cleanKill(`Process exit requested with code ${exitCode}. Saving state before exit.`, exitCode);
        };

        serverProxy.setAgent(agent);

        process.once('SIGINT', () => {
            console.log('Received SIGINT; shutting agent down cleanly.');
            void agent.cleanKill('Received SIGINT. Saving state before exit.', 0);
        });
        process.once('SIGTERM', () => {
            console.log('Received SIGTERM; shutting agent down cleanly.');
            void agent.cleanKill('Received SIGTERM. Saving state before exit.', 0);
        });

        await agent.start(argv.load_memory, argv.init_message, argv.count_id);
    } catch (error) {
        console.error('Failed to start agent process:');
        console.error(error.message);
        console.error(error.stack);
        if (agent?.cleanKill) {
            await agent.cleanKill(`Failed to start agent process: ${error.message}`, 1);
        } else {
            nativeExit(1);
        }
    }
})();
