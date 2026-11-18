// SPDX-License-Identifier: CC0-1.0
// The pathfinder patch backports PrismarineJS/mineflayer-pathfinder#393: a slantwise step is planned only
// when the cells on both sides of it are open, and never as a jump up onto a raised block. Without it the
// pathfinder plans a step past a solid corner whenever one side is open; its walker can't take that step
// (the bot is too wide to cut the corner), so it stands still, says "stuck", and plans the same step again.
// In a tunnel one block wide that happens at every turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import blockFactory from 'prismarine-block';
import pf from 'mineflayer-pathfinder';

const VERSION = '1.21.11';
const registry = minecraftData(VERSION);
const Block = blockFactory(VERSION);

// A pretend bot in a world of stone. The open cells are dug out at feet and head height (y 64 and 65);
// the raised cells have one block of stone at y 64 with air above. Enough for the pathfinder's Movements
// to read blocks and list the moves from a cell.
function botInWorld(openCells, raisedCells = []) {
    const open = new Set(openCells.map(([x, z]) => `${x},${z}`));
    const raised = new Set(raisedCells.map(([x, z]) => `${x},${z}`));
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
            const key = `${p.x},${p.z}`;
            if (raised.has(key)) return make(p.y === 64 ? 'stone' : p.y >= 65 && p.y <= 66 ? 'air' : 'stone', p);
            if ((p.y === 64 || p.y === 65) && open.has(key)) return make('air', p);
            return make('stone', p);
        },
    };
}

// Every move the pathfinder would consider from (x, 64, z), as "x,y,z" of where it ends up.
function movesFrom(movements, x, z) {
    return movements.getNeighbors({ x, y: 64, z, remainingBlocks: 0 }).map(m => `${m.x},${m.y},${m.z}`);
}

// An L-shaped tunnel one block wide: north along x = 0, then east along z = 3.
//   z=3  . . . .
//   z=2  .
//   z=1  .
//   z=0  .
//       x=0 1 2 3
const tunnel = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]];

test('no slantwise step past the inside corner of a 1-wide tunnel', () => {
    const movements = new pf.Movements(botInWorld(tunnel));
    movements.canDig = false;
    const moves = movesFrom(movements, 0, 2);
    assert.ok(!moves.includes('1,64,3'), 'no step past the corner');
    assert.ok(moves.includes('0,64,3') && moves.includes('0,64,1'), 'still walks along the tunnel');
});

test('no digging through a corner to make the slantwise step either', () => {
    // Going round costs no digging, so there is nothing to gain from it.
    const movements = new pf.Movements(botInWorld(tunnel));
    assert.ok(!movesFrom(movements, 0, 2).includes('1,64,3'));
});

test('slantwise steps in open ground are untouched', () => {
    const open = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) open.push([x, z]);
    const moves = movesFrom(new pf.Movements(botInWorld(open)), 0, 0);
    for (const corner of ['1,64,1', '1,64,-1', '-1,64,1', '-1,64,-1']) assert.ok(moves.includes(corner), corner);
});

test('a raised block is climbed straight on, not slantwise', () => {
    // Open ground all round, with one raised block slantwise from the bot and one straight ahead.
    const open = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) open.push([x, z]);
    const moves = movesFrom(new pf.Movements(botInWorld(open, [[1, 1], [0, -1]])), 0, 0);
    assert.ok(!moves.includes('1,65,1'), 'no slantwise jump onto the raised block');
    assert.ok(moves.includes('0,65,-1'), 'the straight jump up is still there');
});
