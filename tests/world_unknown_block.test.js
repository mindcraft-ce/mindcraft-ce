// SPDX-License-Identifier: CC0-1.0
// world.getBlockAtPosition with no block to report (a chunk that isn't loaded) must not call the spot air:
// "Block Below: air" in the bot's surroundings reads as standing over a drop.
import test from 'node:test';
import assert from 'node:assert/strict';
import Vec3 from 'vec3';
import * as world from '../src/agent/library/world.js';

const botWithNoBlocks = () => ({ entity: { position: new Vec3(0.5, 64, 0.5) }, blockAt: () => null });

test('a spot with no block loaded is unknown, not air', () => {
    assert.equal(world.getBlockAtPosition(botWithNoBlocks(), 0, -1, 0).name, 'unknown');
    assert.deepEqual(world.getSurroundingBlocks(botWithNoBlocks()),
        ['Block Below: unknown', 'Block at Legs: unknown', 'Block at Head: unknown']);
});

test('a loaded block is reported as it is', () => {
    const bot = { entity: { position: new Vec3(0.5, 64, 0.5) }, blockAt: pos => ({ name: pos.y < 64 ? 'stone' : 'air', position: pos }) };
    assert.equal(world.getBlockAtPosition(bot, 0, -1, 0).name, 'stone');
    assert.equal(world.getBlockAtPosition(bot, 0, 0, 0).name, 'air');
});

test('the first block above the head stops at a spot with no block, rather than looking past it', () => {
    // Air for two blocks above the head, then nothing loaded, then stone the bot could not know is there.
    const bot = { entity: { position: new Vec3(0.5, 64, 0.5) },
        blockAt: pos => (pos.y < 68 ? { name: 'air', position: pos } : pos.y < 70 ? null : { name: 'stone', position: pos }) };
    assert.equal(world.getFirstBlockAboveHead(bot, null, 32), 'unknown (incomplete scan)');
});
