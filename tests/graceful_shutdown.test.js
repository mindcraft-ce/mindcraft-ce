import test from 'node:test';
import assert from 'node:assert/strict';
import { installGracefulShutdown } from '../src/process/graceful_shutdown.js';
import {
    RequestAbortedError,
    activeModelRequestCount,
    runAbortableRequest,
} from '../src/models/request_control.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('graceful shutdown aborts provider work, waits for cleanup and exits once', async () => {
    const events = [];
    const agent = {
        bot: {
            chat: () => events.push('chat'),
            quit: () => events.push('quit'),
        },
        history: {
            addShutdownMessage: () => events.push('record'),
            save: async () => {
                events.push('save:start');
                await delay(2);
                events.push('save:end');
            },
        },
        actions: {
            stop: async () => {
                events.push('actions:start');
                await delay(5);
                events.push('actions:end');
            },
        },
        self_prompter: {
            stop: async () => {
                events.push('prompt:start');
                await delay(1);
                events.push('prompt:end');
            },
        },
    };

    let exits = 0;
    installGracefulShutdown(agent, {
        disconnect: () => events.push('disconnect'),
        exit: code => {
            exits++;
            events.push(`exit:${code}`);
        },
        actionStopTimeoutMs: 50,
        selfPromptStopTimeoutMs: 50,
    });

    const providerRequest = runAbortableRequest(() => new Promise(() => {}), { timeoutMs: 1000 });
    assert.equal(activeModelRequestCount(), 1);

    const first = agent.cleanKill('bye', 7);
    const second = agent.cleanKill('ignored', 9);
    assert.equal(first, second);

    await assert.rejects(providerRequest, error => error instanceof RequestAbortedError);
    await first;

    assert.equal(activeModelRequestCount(), 0);
    assert.equal(exits, 1);
    assert.ok(events.indexOf('actions:end') < events.indexOf('save:start'));
    assert.ok(events.indexOf('prompt:end') < events.indexOf('save:start'));
    assert.ok(events.indexOf('save:end') < events.indexOf('disconnect'));
    assert.ok(events.indexOf('disconnect') < events.indexOf('quit'));
    assert.equal(events.at(-1), 'exit:7');
});

test('graceful shutdown bounds stuck cleanup and still flushes history', async () => {
    const events = [];
    const agent = {
        history: {
            addShutdownMessage() {},
            save: () => events.push('saved'),
        },
        actions: {
            stop: () => new Promise(() => {}),
        },
    };

    installGracefulShutdown(agent, {
        exit: () => events.push('exit'),
        actionStopTimeoutMs: 5,
    });

    await agent.cleanKill('bye', 0);
    assert.deepEqual(events, ['saved', 'exit']);
});
