import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import mc from 'minecraft-protocol';
import { findServers, serverInfo } from '../src/mindcraft/mcserver.js';

async function silentListeners(t, count) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const servers = [];
        const sockets = new Set();
        let startPort;
        try {
            for (let index = 0; index < count; index++) {
                const server = net.createServer(socket => {
                    sockets.add(socket);
                    socket.on('data', () => {});
                    socket.on('close', () => sockets.delete(socket));
                });
                server.listen(index === 0 ? 0 : startPort + index, '127.0.0.1');
                await once(server, 'listening');
                servers.push(server);
                startPort ??= server.address().port;
            }
        } catch (error) {
            await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
            if (error.code === 'EADDRINUSE' || error.code === 'ERR_SOCKET_BAD_PORT') continue;
            throw error;
        }
        t.after(async () => {
            for (const socket of sockets) socket.destroy();
            await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
        });
        return { startPort, sockets };
    }
    throw new Error('Could not allocate consecutive loopback ports');
}

async function waitForSocketCleanup(sockets) {
    for (let attempt = 0; sockets.size && attempt < 50; attempt++)
        await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(sockets.size, 0, 'completed pings must not retain connections');
}

test('ping timeout closes a silent TCP connection', { timeout: 5000 }, async t => {
    const { startPort, sockets } = await silentListeners(t, 1);
    assert.equal(await serverInfo('127.0.0.1', startPort, 100), null);
    await waitForSocketCleanup(sockets);
});

test('bounded scan releases ping connections across worker batches', { timeout: 5000 }, async t => {
    const { startPort, sockets } = await silentListeners(t, 6);
    const result = await findServers('127.0.0.1', false, 100, {
        startPort, endPort: startPort + 5, concurrency: 2, pingTimeout: 100,
    });
    assert.deepEqual(result, []);
    await waitForSocketCleanup(sockets);
});

test('discovery and early exit preserve Minecraft server metadata', { timeout: 10000 }, async t => {
    const server = mc.createServer({
        host: '127.0.0.1', port: 0, version: '1.21.1',
        'online-mode': false, motd: 'Discovery regression test', hideErrors: true,
    });
    await once(server, 'listening');
    t.after(async () => {
        const closed = once(server, 'close');
        // Also close the raw TCP probes, which never send a handshake.
        const clients = Object.values(server.clients);
        server.close();
        for (const client of clients) {
            client.socket.destroy();
            clearTimeout(client.closeTimer);
        }
        await closed;
    });
    const port = server.socketServer.address().port;
    for (const earlyExit of [false, true]) {
        const found = await findServers('127.0.0.1', earlyExit, 100, {
            startPort: port, endPort: port, concurrency: 2, pingTimeout: 1000,
        });
        assert.equal(found.length, 1);
        assert.equal(found[0].port, port);
        assert.equal(found[0].name, 'Discovery regression test');
        assert.equal(found[0].version, '1.21.1');
    }
});
