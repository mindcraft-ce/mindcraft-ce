// SPDX-License-Identifier: CC0-1.0
// world.getNearestFreeSpace(size > 1) must only accept a spot where every cell of the square is empty.
import test from 'node:test';
import assert from 'node:assert/strict';
import Vec3 from 'vec3';
import * as world from '../src/agent/library/world.js';

// A flat dirt floor at y 63 with air above it, and one block of stone standing on the floor at (1, 64, 0).
function flatWorldBot() {
    const blockAt = (pos) => {
        const p = pos.floored();
        if (p.y === 63) return { name: 'dirt', position: p, drops: [1], diggable: true };
        if (p.y === 64 && p.x === 1 && p.z === 0) return { name: 'stone', position: p, drops: [1], diggable: true };
        return { name: 'air', position: p, drops: [], diggable: false };
    };
    // The search offers two air cells as candidates: (0, 64, 0), whose 2x2 square includes the stone, and (4, 64, 4).
    return { entity: { position: new Vec3(0, 64, 0) }, blockAt, findBlocks: () => [new Vec3(0, 64, 0), new Vec3(4, 64, 4)] };
}

test('a 2x2 free space is not reported where one of its cells is occupied', () => {
    const bot = flatWorldBot();
    assert.deepEqual(world.getNearestFreeSpace(bot, 2, 8), new Vec3(4, 64, 4));
    assert.deepEqual(world.getNearestFreeSpace(bot, 1, 8), new Vec3(0, 64, 0), 'a single cell is still found at once');
});
