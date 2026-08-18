import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMindServer, sanitizeDisplayText } from '../src/mindcraft/mindserver.js';

test('display text cannot become HTML markup', () => {
    const sanitized = sanitizeDisplayText('<img src=x onerror=alert(1)>hello');
    assert.equal(sanitized.includes('<'), false);
    assert.match(sanitized, /hello/);
});

test('public UI token bootstrap sets an HttpOnly SameSite cookie and redirects cleanly', async () => {
    const oldToken = process.env.MINDCRAFT_CONTROL_TOKEN;
    const oldBind = process.env.MINDCRAFT_BIND_HOST;
    process.env.MINDCRAFT_CONTROL_TOKEN = 'control-secret';
    process.env.MINDCRAFT_BIND_HOST = '127.0.0.1';

    const server = createMindServer(true, 0);
    if (!server.listening) await once(server, 'listening');
    const { port } = server.address();

    try {
        const bad = await fetch(`http://127.0.0.1:${port}/?token=wrong`, { redirect: 'manual' });
        assert.equal(bad.status, 401);

        const response = await fetch(`http://127.0.0.1:${port}/?token=control-secret`, { redirect: 'manual' });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/');
        const cookie = response.headers.get('set-cookie');
        assert.match(cookie, /mindcraft_control=control-secret/);
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=Strict/i);
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (oldToken === undefined) delete process.env.MINDCRAFT_CONTROL_TOKEN;
        else process.env.MINDCRAFT_CONTROL_TOKEN = oldToken;
        if (oldBind === undefined) delete process.env.MINDCRAFT_BIND_HOST;
        else process.env.MINDCRAFT_BIND_HOST = oldBind;
    }
});
