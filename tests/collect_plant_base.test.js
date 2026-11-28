// SPDX-License-Identifier: CC0-1.0
// Collecting sugar cane, bamboo or cactus leaves the bottom block of each plant, so it grows back. Breaking the
// bottom block used to take the whole plant, and a patch of cane collected once never came back.
import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import blockFactory from 'prismarine-block';
import Vec3 from 'vec3';
import { collectBlocks, isPlantBase, plantBases } from '../src/agent/library/mining.js';

const VERSION = '1.21.6';
const registry = minecraftData(VERSION);
const Block = blockFactory(VERSION);

function block(name, position) {
    const made = Block.fromStateId(registry.blocksByName[name].defaultState, 0);
    made.position = position;
    return made;
}

// A world of named cells, the rest air: breaking a stalk block brings down every block of its kind above it.
function world(cells) {
    const named = new Map(Object.entries(cells));
    const at = position => block(named.get(position.toString()) ?? 'air', position);
    const breakAt = position => {
        const name = named.get(position.toString());
        for (let up = position.clone(); named.get(up.toString()) === name; up = up.offset(0, 1, 0)) named.delete(up.toString());
    };
    const found = () => [...named].filter(([, name]) => name !== 'dirt' && name !== 'sand')
        .map(([key, name]) => block(name, new Vec3(...key.slice(1, -1).split(',').map(Number))));
    return { at, breakAt, found };
}

function botIn(place, digs) {
    return {
        registry, version: VERSION, game: { gameMode: 'survival' }, inventory: { items: () => [] }, world: {},
        entity: { position: new Vec3(0, 0, 0) }, heldItem: null,
        on() {}, off() {}, emit() {},
        pathfinder: { movements: null, setMovements(movements) { this.movements = movements; },
            goto: () => Promise.resolve(), setGoal() {} },
        tool: { equipForBlock: async () => {} },
        blockAt: position => place.at(position),
        digTime: () => 0,
        dig: target => { digs.push(target.position.toString()); place.breakAt(target.position); return Promise.resolve(); },
        stopDigging() {},
    };
}

test('the bottom block of a stalk is the one with none of its kind beneath it', () => {
    const cane = [0, 1, 2].map(y => block('sugar_cane', new Vec3(1, y, 0)));
    const lone = block('cactus', new Vec3(4, 0, 0));
    const bases = plantBases([...cane, lone, block('oak_log', new Vec3(6, 0, 0))]);
    assert.deepEqual([...bases].sort(), [new Vec3(1, 0, 0).toString(), new Vec3(4, 0, 0).toString()].sort());
    assert.equal(isPlantBase(cane[0], block('dirt', new Vec3(1, -1, 0))), true);
    assert.equal(isPlantBase(cane[1], cane[0]), false);
    assert.equal(isPlantBase({ name: 'reeds' }, { name: 'dirt' }), true, 'Bedrock calls sugar cane reeds');
    assert.equal(isPlantBase(block('oak_log', new Vec3(6, 0, 0)), null), false, 'other blocks are never stalks');
});

test('collecting sugar cane breaks the block above the bottom one, and the bottom stays', async () => {
    const place = world({ [new Vec3(1, -1, 0)]: 'dirt', [new Vec3(1, 0, 0)]: 'sugar_cane',
        [new Vec3(1, 1, 0)]: 'sugar_cane', [new Vec3(1, 2, 0)]: 'sugar_cane' });
    const digs = [];
    await collectBlocks(botIn(place, digs), 'sugar_cane', 1, { find: predicate => place.found().filter(predicate), pickup: async () => {} });
    assert.deepEqual(digs, [new Vec3(1, 1, 0).toString()]);
    assert.equal(place.at(new Vec3(1, 0, 0)).name, 'sugar_cane', 'the bottom block is left to regrow');
});

test('with only bottom blocks about, nothing is broken and the bot is told they are left to grow back', async () => {
    const place = world({ [new Vec3(1, -1, 0)]: 'sand', [new Vec3(1, 0, 0)]: 'cactus',
        [new Vec3(3, -1, 0)]: 'sand', [new Vec3(3, 0, 0)]: 'cactus' });
    const digs = [];
    const result = await collectBlocks(botIn(place, digs), 'cactus', 2, { find: predicate => place.found().filter(predicate), pickup: async () => {} });
    assert.deepEqual(digs, []);
    assert.equal(result.status, 'blocked');
    assert.match(result.text, /only the bottom block of each plant/);
});
