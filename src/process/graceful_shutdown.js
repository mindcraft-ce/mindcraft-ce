import { settleAll } from '../utils/atomic_file.js';
import { abortActiveModelRequests } from '../models/request_control.js';

function withTimeout(operation, timeoutMs, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label} did not finish within ${timeoutMs} ms.`)),
            timeoutMs
        );
    });
    return Promise.race([
        Promise.resolve().then(operation),
        timeout,
    ]).finally(() => clearTimeout(timer));
}

export function installGracefulShutdown(agent, {
    disconnect = () => {},
    exit = code => process.exit(code),
    actionStopTimeoutMs = 5000,
    selfPromptStopTimeoutMs = 2000,
} = {}) {
    if (!agent || typeof agent !== 'object') {
        throw new TypeError('installGracefulShutdown requires an agent object.');
    }

    agent.cleanKill = function cleanKill(msg = 'Killing agent process...', code = 1) {
        if (agent._shutdownPromise) return agent._shutdownPromise;
        agent._shuttingDown = true;

        agent._shutdownPromise = (async () => {
            try {
                // Abort provider SDK calls before waiting on action/self-prompt cleanup.
                // Each child process owns one agent, so this stays process-local.
                abortActiveModelRequests('Agent is shutting down.');

                try {
                    agent.bot?.chat?.(code > 1 ? 'Restarting.' : 'Exiting.');
                } catch (error) {
                    console.warn('Failed to send shutdown chat message:', error);
                }

                try {
                    if (agent.history?.addShutdownMessage) {
                        await agent.history.addShutdownMessage(msg);
                    } else if (agent.history?.add) {
                        await agent.history.add('system', msg);
                    }
                } catch (error) {
                    console.error('Failed to record shutdown message:', error);
                }

                const stopTasks = [];
                if (agent.actions?.stop) {
                    stopTasks.push(withTimeout(
                        () => agent.actions.stop(),
                        actionStopTimeoutMs,
                        'Action shutdown'
                    ));
                }
                if (agent.self_prompter?.stop) {
                    stopTasks.push(withTimeout(
                        () => agent.self_prompter.stop(false),
                        selfPromptStopTimeoutMs,
                        'Self-prompter shutdown'
                    ));
                }

                try {
                    await settleAll(stopTasks);
                } catch (error) {
                    console.error('Shutdown cleanup did not fully settle:', error);
                }

                try {
                    await agent.history?.save?.();
                    await agent.history?.flush?.();
                } catch (error) {
                    console.error('Failed to flush history during shutdown:', error);
                }

                try {
                    await disconnect();
                } catch (error) {
                    console.error('Failed to disconnect from MindServer during shutdown:', error);
                }

                try {
                    agent.bot?.quit?.();
                } catch (error) {
                    console.warn('Failed to close Minecraft connection during shutdown:', error);
                }
            } finally {
                exit(code);
            }
        })();

        return agent._shutdownPromise;
    };

    return agent.cleanKill;
}
