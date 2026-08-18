import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlayerCommandAuthorized } from '../src/agent/command_authorization.js';

test('player commands fail closed by default', () => {
    assert.equal(isPlayerCommandAuthorized('Steve', '!stop', {}), false);
});

test('global command users can execute commands when identity is trusted', () => {
    assert.equal(isPlayerCommandAuthorized('Steve', '!stop', {
        auth: 'microsoft',
        command_users: ['Steve'],
    }), true);
});

test('command-specific ACLs authorize only configured trusted users', () => {
    const settings = {
        auth: 'microsoft',
        command_acl: {
            '!restart': ['Admin'],
        },
    };
    assert.equal(isPlayerCommandAuthorized('Admin', '!restart', settings), true);
    assert.equal(isPlayerCommandAuthorized('Steve', '!restart', settings), false);
    assert.equal(isPlayerCommandAuthorized('Admin', '!newAction', settings), false);
});

test('offline usernames do not satisfy ACLs unless explicitly trusted', () => {
    const settings = {
        auth: 'offline',
        command_users: ['Steve'],
        command_acl: { '!restart': ['Admin'] },
    };
    assert.equal(isPlayerCommandAuthorized('Steve', '!stop', settings), false);
    assert.equal(isPlayerCommandAuthorized('Admin', '!restart', settings), false);

    settings.allow_offline_command_acl = true;
    assert.equal(isPlayerCommandAuthorized('Steve', '!stop', settings), true);
    assert.equal(isPlayerCommandAuthorized('Admin', '!restart', settings), true);
});

test('public commands require an explicit opt-in and are independent of auth mode', () => {
    assert.equal(isPlayerCommandAuthorized('Anyone', '!stats', {
        auth: 'offline',
        allow_public_commands: true,
    }), true);
});
