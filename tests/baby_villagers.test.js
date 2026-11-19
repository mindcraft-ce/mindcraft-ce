// SPDX-License-Identifier: CC0-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { getCommand } from '../src/agent/commands/index.js';
import { getVillagerProfession } from '../src/agent/library/world.js';

// A villager as mineflayer gives it on Java: entry 16 of its metadata says whether it is a baby, and the
// protocol sends that as a boolean, not a number.
const villager = (id, metadata) => ({ id, name: 'villager', type: 'mob', position: new Vec3(id, 64, 0), metadata });

test('a baby villager is not described as an adult', () => {
    assert.equal(getVillagerProfession(villager(1, { 16: true })), 'Unknown');
    assert.equal(getVillagerProfession(villager(2, { 16: false })), 'Adult');
});

test('!entities lists a baby villager as a baby, which cannot trade', () => {
    const entities = {
        1: villager(1, { 16: false, 18: { villagerProfession: 9, level: 2 } }),
        2: villager(2, { 16: true, 18: { villagerProfession: 0, level: 1 } }),
    };
    const bot = { username: 'Bot', entity: { position: new Vec3(0, 64, 0) }, entities, players: {} };
    const text = getCommand('!entities').perform({ name: 'Bot', bot });
    assert.match(text, /Adults: \(1:Librarian L2\)/);
    assert.match(text, /Baby IDs: 2 \(babies cannot trade\)/);
});
