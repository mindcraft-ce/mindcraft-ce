// SPDX-License-Identifier: CC0-1.0
// getInventoryCounts is what the bot carries: !inventory lists it, and crafting plans and skills count on
// it. Worn armor sits in slots 5 to 8, which !inventory lists apart, under WEARING. It was counted as
// carried too, so a worn helmet showed up twice and counted toward recipes as if it were in the bag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getInventoryCounts } from '../src/agent/library/world.js';

const item = (name, count = 1) => ({ name, count });

test('worn armor is not counted as carried; what is held in the other hand is', () => {
    const slots = [];
    slots[5] = item('iron_helmet');
    slots[6] = item('iron_chestplate');
    slots[7] = item('iron_leggings');
    slots[8] = item('iron_boots');
    slots[9] = item('oak_log', 2);         // the main inventory
    slots[36] = item('stone', 3);          // the hotbar
    slots[40] = item('iron_helmet');       // a spare helmet, carried
    slots[45] = item('torch', 5);          // the off hand
    const bot = { inventory: { slots } };
    assert.deepEqual(getInventoryCounts(bot), { oak_log: 2, stone: 3, iron_helmet: 1, torch: 5 });
});

test('an NPC goal for armor is met by armor the bot wears', async () => {
    const { itemSatisfied, ownedCounts } = await import('../src/agent/npc/utils.js');
    const slots = [];
    slots[6] = item('iron_chestplate');    // crafting puts armor on at once
    slots[9] = item('iron_ingot', 3);
    const bot = { inventory: { slots } };
    assert.equal(itemSatisfied(bot, 'iron_chestplate'), true);
    assert.deepEqual(ownedCounts(bot), { iron_ingot: 3, iron_chestplate: 1 });
});
