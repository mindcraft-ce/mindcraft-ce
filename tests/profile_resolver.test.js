import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile } from '../src/models/profile_resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultsDir = path.resolve(here, '../profiles/defaults');

test('profile precedence is individual > base > defaults without mutating input', () => {
    const profile = { name: 'TestBot', modes: { custom: true } };
    const snapshot = structuredClone(profile);
    const resolved = resolveProfile(profile, ' SURVIVAL ', defaultsDir);

    assert.notEqual(resolved, profile);
    assert.deepEqual(profile, snapshot);
    assert.deepEqual(resolved.modes, { custom: true });
    assert.equal(typeof resolved.conversing, 'string');
});

test('base profile matching is exact after normalization', () => {
    assert.throws(
        () => resolveProfile({ name: 'TestBot' }, 'survival-extra', defaultsDir),
        /Unknown base profile/
    );
});
