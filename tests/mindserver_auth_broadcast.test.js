import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io as connectSocket } from 'socket.io-client';
import { createMindServer, registerAgent } from '../src/mindcraft/mindserver.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('public MindServer does not broadcast control data to unauthorized sockets', async () => {
    const oldToken = process.env.MINDCRAFT_CONTROL_TOKEN;
    const oldBind = process.env.MINDCRAFT_BIND_HOST;
    process.env.MINDCRAFT_CONTROL_TOKEN = 'control-secret';
    process.env.MINDCRAFT_BIND_HOST = '127.0.0.1';

    registerAgent({ profile: { name: 'SecurityTest' } }, 3000, 'agent-secret');
    const server = createMindServer(true, 0);
    if (!server.listening) await once(server, 'listening');
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}`;

    const unauthorized = connectSocket(url, { auth: { controlToken: 'wrong' }, reconnection: false });
    const control = connectSocket(url, { auth: { controlToken: 'control-secret' }, reconnection: false });
    const agent = connectSocket(url, { auth: { agentToken: 'agent-secret' }, reconnection: false });

    let unauthorizedStatus = false;
    let unauthorizedOutput = false;
    unauthorized.on('agents-status', () => { unauthorizedStatus = true; });
    unauthorized.on('bot-output', () => { unauthorizedOutput = true; });

    try {
        await Promise.all([once(unauthorized, 'connect'), once(control, 'connect'), once(agent, 'connect')]);
        const statusPromise = once(control, 'agents-status');
        agent.emit('connect-agent-process', 'SecurityTest');
        await statusPromise;
        await delay(25);
        assert.equal(unauthorizedStatus, false);

        const outputPromise = once(control, 'bot-output');
        agent.emit('bot-output', 'SecurityTest', 'secret output');
        const [agentName, message] = await outputPromise;
        assert.equal(agentName, 'SecurityTest');
        assert.equal(message, 'secret output');
        await delay(25);
        assert.equal(unauthorizedOutput, false);
    } finally {
        unauthorized.disconnect();
        control.disconnect();
        agent.disconnect();
        await new Promise(resolve => server.close(resolve));
        if (oldToken === undefined) delete process.env.MINDCRAFT_CONTROL_TOKEN;
        else process.env.MINDCRAFT_CONTROL_TOKEN = oldToken;
        if (oldBind === undefined) delete process.env.MINDCRAFT_BIND_HOST;
        else process.env.MINDCRAFT_BIND_HOST = oldBind;
    }
});
