import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlayerCommandAuthorized } from '../src/agent/command_authorization.js';

test('player commands fail closed by default', () => {
    assert.equal(isPlayerCommandAuthorized('Steve', '!stop', {}), false);
});

test('global command users can execute commands', () => {
    assert.equal(isPlayerCommandAuthorized('Steve', '!stop', {
        command_users: ['Steve'],
    }), true);
});

test('command-specific ACLs authorize only configured users', () => {
    const settings = {
        command_acl: {
            '!restart': ['Admin'],
        },
    };
    assert.equal(isPlayerCommandAuthorized('Admin', '!restart', settings), true);
    assert.equal(isPlayerCommandAuthorized('Steve', '!restart', settings), false);
    assert.equal(isPlayerCommandAuthorized('Admin', '!newAction', settings), false);
});

test('public commands require an explicit opt-in', () => {
    assert.equal(isPlayerCommandAuthorized('Anyone', '!stats', { allow_public_commands: true }), true);
});
