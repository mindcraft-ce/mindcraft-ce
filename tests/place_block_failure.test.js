// SPDX-License-Identifier: CC0-1.0
// When a placement fails, placeBlock says why. It caught the error and logged only "Failed to place", so
// the model couldn't tell a block in the way from a side it can't reach, and tried the same thing again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { placeBlock } from '../src/agent/library/skills.js';

test('a placement that fails says why', async () => {
    const dest = new Vec3(1, 64, 2);
    const bot = {
        output: '', modes: { isOn: () => false }, game: { gameMode: 'survival' },
        entity: { position: dest.offset(0.5, 0, 0.5) },
        blockAt: position => ({ name: position.equals(dest) ? 'air' : 'stone', position }),
        inventory: { findInventoryItem: () => ({ name: 'torch', type: 1 }) },
        equip: () => Promise.resolve(), lookAt: () => Promise.resolve(),
        placeBlock: () => Promise.reject(new Error('No block has been placed: the block is still air')),
    };
    assert.equal(await placeBlock(bot, 'torch', dest.x, dest.y, dest.z), false);
    assert.match(bot.output, /Failed to place torch at \(1, 64, 2\): No block has been placed: the block is still air/);
});
