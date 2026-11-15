// SPDX-License-Identifier: CC0-1.0
// The pathfinder will plan a diagonal step past a solid corner when only one side of it is open. Its walker
// then cannot make the step (the bot is too wide to cut the corner), stands still, says "stuck", and plans
// the same step again. In a tunnel one block wide that happens at every turn. squareCorners keeps a
// Movements object from planning such a step, so the bot goes round the corner in two straight steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import blockFactory from 'prismarine-block';
import pf from 'mineflayer-pathfinder';
import { squareCorners } from '../src/agent/library/skills.js';
import { getSkillDocs } from '../src/agent/library/index.js';

const VERSION = '1.21.11';
const registry = minecraftData(VERSION);
const Block = blockFactory(VERSION);

// A pretend bot standing in a world of stone with the given cells (at feet and head height, y 64 and 65)
// dug out. Enough for pathfinder's Movements to read blocks and list the moves from a cell.
function botInWorld(openCells) {
    const open = new Set(openCells.map(([x, z]) => `${x},${z}`));
    const make = (name, pos) => {
        const block = Block.fromStateId(registry.blocksByName[name].defaultState, 0);
        block.position = pos;
        return block;
    };
    return {
        registry,
        version: VERSION,
        game: { minY: -64 },
        entity: { effects: {} },
        // Digging costs ask which tool is best; bare hands are fine for this.
        pathfinder: { bestHarvestTool: () => null },
        inventory: { items: () => [], slots: [] },
        entities: {},
        blockAt(pos) {
            const p = pos.floored();
            if ((p.y === 64 || p.y === 65) && open.has(`${p.x},${p.z}`)) return make('air', p);
            return make('stone', p);
        },
    };
}

// Every move the pathfinder would consider from (x, 64, z), as "x,z" of where it ends up.
function movesFrom(movements, x, z) {
    return movements.getNeighbors({ x, y: 64, z, remainingBlocks: 0 }).map(m => `${m.x},${m.z}`);
}

// An L-shaped tunnel one block wide: north along x = 0, then east along z = 3.
//   z=3  . . . .
//   z=2  .
//   z=1  .
//   z=0  .
//       x=0 1 2 3
const tunnel = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]];

test('stock movements plan a diagonal past the inside corner of a 1-wide tunnel', () => {
    // This is the step the walker can't make. If the pathfinder ever stops offering it, squareCorners can go.
    const movements = new pf.Movements(botInWorld(tunnel));
    movements.canDig = false;
    assert.ok(movesFrom(movements, 0, 2).includes('1,3'));
});

test('squareCorners leaves only the two straight steps round that corner', () => {
    const movements = squareCorners(new pf.Movements(botInWorld(tunnel)));
    movements.canDig = false;
    const moves = movesFrom(movements, 0, 2);
    assert.ok(!moves.includes('1,3'), 'no diagonal past the corner');
    assert.ok(moves.includes('0,3') && moves.includes('0,1'), 'still walks along the tunnel');
});

test('squareCorners also refuses to dig through a corner to make the diagonal', () => {
    // With digging allowed, stock movements may plan the diagonal and break the corner block on the way.
    // Going round costs no digging, so there is nothing to gain from it.
    const movements = squareCorners(new pf.Movements(botInWorld(tunnel)));
    assert.ok(!movesFrom(movements, 0, 2).includes('1,3'));
});

test('diagonals in open ground are untouched', () => {
    const open = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) open.push([x, z]);
    const movements = squareCorners(new pf.Movements(botInWorld(open)));
    const moves = movesFrom(movements, 0, 0);
    for (const corner of ['1,1', '1,-1', '-1,1', '-1,-1']) assert.ok(moves.includes(corner), corner);
});

test('squareCorners returns the same Movements, so it can wrap a constructor call', () => {
    const movements = new pf.Movements(botInWorld(tunnel));
    assert.equal(squareCorners(movements), movements);
});

test('the helper is not described to the model as a skill', () => {
    assert.ok(!getSkillDocs().some(doc => doc.startsWith('skills.squareCorners')));
});
