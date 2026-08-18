import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForServerListening } from '../src/mindcraft/mindcraft.js';

test('waitForServerListening returns immediately for an already-listening server', async () => {
    const server = new EventEmitter();
    server.listening = true;
    await waitForServerListening(server);
    assert.equal(server.listenerCount('listening'), 0);
    assert.equal(server.listenerCount('error'), 0);
});

test('waitForServerListening resolves on listening and removes temporary listeners', async () => {
    const server = new EventEmitter();
    server.listening = false;

    const ready = waitForServerListening(server);
    server.emit('listening');
    await ready;

    assert.equal(server.listenerCount('listening'), 0);
    assert.equal(server.listenerCount('error'), 0);
});

test('waitForServerListening rejects startup errors and removes temporary listeners', async () => {
    const server = new EventEmitter();
    server.listening = false;
    const failure = new Error('listen failed');

    const ready = waitForServerListening(server);
    server.emit('error', failure);
    await assert.rejects(ready, /listen failed/);

    assert.equal(server.listenerCount('listening'), 0);
    assert.equal(server.listenerCount('error'), 0);
});
