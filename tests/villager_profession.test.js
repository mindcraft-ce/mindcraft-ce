// SPDX-License-Identifier: CC0-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { getVillagerProfession } from '../src/agent/library/world.js';

// mineflayer hands out an entity's metadata as an array indexed by entry. A villager's job and level are
// one entry, "villager_data": entry 18 up to Minecraft 1.21, and 19 from 26.1, which added an entry
// ("age_locked") before it.
const villager = metadata => ({ id: 1, name: 'villager', type: 'mob', metadata });
const data = (villagerProfession, level) => ({ villagerType: 2, villagerProfession, level });

test('a villager\'s job and level are read where 1.21 keeps them', () => {
    const metadata = [];
    metadata[18] = data(9, 2);
    assert.equal(getVillagerProfession(villager(metadata)), 'Librarian L2');
});

test('a villager\'s job and level are read where 26.1 and later keep them', () => {
    const metadata = [];
    metadata[16] = false;
    metadata[19] = data(10, 3);
    metadata[20] = true; // "villager_finalized"
    assert.equal(getVillagerProfession(villager(metadata)), 'Mason L3');
});
