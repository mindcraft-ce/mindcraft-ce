import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMindServer } from '../src/mindcraft/mindserver.js';

test('MindServer starts on an ephemeral port and closes cleanly', async () => {
    const server = createMindServer(false, 0);
    if (!server.listening) await once(server, 'listening');

    const address = server.address();
    assert.ok(address);
    assert.equal(typeof address, 'object');
    assert.ok(address.port > 0);

    await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
});
