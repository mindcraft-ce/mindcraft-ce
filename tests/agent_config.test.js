import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentName, validateAgentSettings } from '../src/mindcraft/agent_config.js';

test('validateAgentSettings accepts root launcher keys but excludes them from agent config', () => {
    const config = validateAgentSettings({
        profile: { name: ' Andy ' },
        profiles: ['./andy.json'],
        mindserver_port: 8080,
        auto_open_ui: true,
        block_place_delay: 25,
    });

    assert.equal(config.profile.name, 'Andy');
    assert.equal(config.block_place_delay, 25);
    assert.equal(config.task, null);
    assert.equal('profiles' in config, false);
    assert.equal('mindserver_port' in config, false);
    assert.equal('auto_open_ui' in config, false);
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.isFrozen(config.profile), true);
});

test('agent names are normalized and reject path/control syntax before runtime use', () => {
    assert.equal(normalizeAgentName(' Test_Bot '), 'Test_Bot');
    assert.throws(() => normalizeAgentName('../bots'), /Invalid agent name/);
    assert.throws(() => normalizeAgentName('a/b'), /Invalid agent name/);
    assert.throws(() => normalizeAgentName('bad\nname'), /Invalid agent name/);
    assert.throws(() => normalizeAgentName('ab'), /Invalid agent name/);
    assert.throws(() => normalizeAgentName(123), /must be a string/);

    assert.throws(() => validateAgentSettings({
        profile: { name: '../escape' },
    }), /Invalid agent name/);
});

test('validateAgentSettings still rejects unknown per-agent settings', () => {
    assert.throws(() => validateAgentSettings({
        profile: { name: 'Andy' },
        typo_setting: true,
    }), /Unknown settings/);
});
