// A profile without a skin must not make the bot send a /skin command at login.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skinCommand } from '../src/agent/agent.js';

test('a skin command is built only for a profile that sets a skin', () => {
    assert.equal(skinCommand({ skin: { model: 'slim', path: 'https://example.com/skin.png' } }), '/skin set URL slim https://example.com/skin.png');
    assert.equal(skinCommand({}), null, 'no skin configured: nothing to send, not "/skin clear"');
    assert.equal(skinCommand(undefined), null);
});
