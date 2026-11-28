// SPDX-License-Identifier: CC0-1.0
// Collecting a block with no collision box (a crop, a flower) walks to stand near it. The goal used for solid
// blocks casts a ray at the block's box; a plant has none, so that goal was never met and the walk timed out.
import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import blockFactory from 'prismarine-block';
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';
import { collectBlocks } from '../src/agent/library/mining.js';

const VERSION = '1.21.6';
const registry = minecraftData(VERSION);
const Block = blockFactory(VERSION);

function at(name, position, state = 0) {
    const block = Block.fromStateId(registry.blocksByName[name].minStateId + state, 0);
    block.position = position;
    return block;
}

async function walkTo(target) {
    const walks = [];
    const usual = { usual: true };
    const pathfinder = {
        movements: usual,
        setMovements(movements) { this.movements = movements; },
        goto(goal) { walks.push({ goal, movements: this.movements }); return Promise.reject(Object.assign(new Error('stop here'), { name: 'Stop' })); },
        setGoal() {},
    };
    const bot = {
        registry, version: VERSION, game: { gameMode: 'survival' }, inventory: { items: () => [] }, world: {},
        on() {}, off() {}, emit() {},
        pathfinder,
        blockAt: () => target,
    };
    await collectBlocks(bot, target.name, 1, { find: predicate => [target].filter(predicate), pickup: async () => {} });
    return { ...walks[0], after: pathfinder.movements, usual };
}
const goalFor = async target => (await walkTo(target)).goal;

test('a plant is walked to with a goal that can be met; a solid block still needs a line of sight', async () => {
    const wheat = await goalFor(at('wheat', new Vec3(3, 64, 0), 7));
    assert.ok(wheat instanceof pf.goals.GoalNear, `got ${wheat?.constructor?.name}`);
    assert.ok(wheat.isEnd({ x: 2, y: 64, z: 0 }), 'standing beside it is enough');
    const poppy = await goalFor(at('poppy', new Vec3(3, 64, 0)));
    assert.ok(poppy instanceof pf.goals.GoalNear);
    const stone = await goalFor(at('stone', new Vec3(3, 64, 0)));
    assert.ok(stone instanceof pf.goals.GoalLookAtBlock, `got ${stone?.constructor?.name}`);
});

test('the walk to a plant neither digs, places nor leaps, and the usual movements come back after', async () => {
    const walk = await walkTo(at('wheat', new Vec3(3, 64, 0), 7));
    assert.equal(walk.movements.canDig, false, 'a dug cell in a field takes its crop with it');
    assert.equal(walk.movements.allowParkour, false, 'a leap onto farmland can trample it');
    assert.equal(walk.movements.allow1by1towers, false);
    assert.deepEqual(walk.movements.scafoldingBlocks, []);
    assert.equal(walk.after, walk.usual);
    const stone = await walkTo(at('stone', new Vec3(3, 64, 0)));
    assert.equal(stone.movements, stone.usual, 'a solid block is still reached the usual way');
});

test('the drops of a plant are picked up knowing it was a plant, so nothing is dug for them', async () => {
    const wheat = at('wheat', new Vec3(3, 64, 0), 7);
    let broken = false;
    const picked = [];
    const bot = {
        registry, version: VERSION, game: { gameMode: 'survival' }, inventory: { items: () => [] }, world: {},
        on() {}, off() {}, emit() {},
        pathfinder: { movements: null, setMovements() {}, goto: () => Promise.resolve(), setGoal() {} },
        tool: { equipForBlock: async () => {} },
        digTime: () => 0,
        blockAt: () => (broken ? at('air', wheat.position) : wheat),
        dig: () => { broken = true; return Promise.resolve(); },
    };
    await collectBlocks(bot, 'wheat', 1, { find: predicate => (broken ? [] : [wheat]).filter(predicate), pickup: target => { picked.push(target); return Promise.resolve(); } });
    assert.equal(picked.length, 1);
    assert.equal(picked[0].boundingBox, 'empty');
});
