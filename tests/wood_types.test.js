// SPDX-License-Identifier: CC0-1.0
// Builders pick a wood by name: the one the bot carries most of. Woods with two-word names (dark oak, pale
// oak) contain another wood's name, and must not be counted as plain oak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { woodTypeOf, getTypeOfGeneric } from '../src/agent/npc/utils.js';

function botCarrying(items) {
    return { inventory: { slots: Object.entries(items).map(([name, count]) => ({ name, count })) } };
}

test('a block or item is matched to its own wood, not to a wood whose name it contains', () => {
    assert.equal(woodTypeOf('oak_log'), 'oak');
    assert.equal(woodTypeOf('dark_oak_planks'), 'dark_oak');
    assert.equal(woodTypeOf('stripped_dark_oak_log'), 'dark_oak');
    assert.equal(woodTypeOf('pale_oak_log'), 'pale_oak');
    assert.equal(woodTypeOf('poplar_planks'), 'poplar');
    assert.equal(woodTypeOf('cobblestone'), null);
});

test('a builder with only dark oak or pale oak builds in that wood', () => {
    assert.equal(getTypeOfGeneric(botCarrying({ dark_oak_planks: 8 }), 'door'), 'dark_oak_door');
    assert.equal(getTypeOfGeneric(botCarrying({ pale_oak_log: 3 }), 'planks'), 'pale_oak_planks');
});

test('the wood the builder carries most of wins', () => {
    const bot = botCarrying({ oak_planks: 2, pale_oak_planks: 4, pale_oak_log: 1 });
    assert.equal(getTypeOfGeneric(bot, 'fence'), 'pale_oak_fence');
});
