// Collecting a crop takes only fully grown plants. Breaking a young one wastes it, so "collect wheat" used to
// flatten a field that was still growing.
import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import blockFactory from 'prismarine-block';
import Vec3 from 'vec3';
import { collectBlocks, isUnripeCrop } from '../src/agent/library/mining.js';

const VERSION = '1.21.6';
const registry = minecraftData(VERSION);
const Block = blockFactory(VERSION);

function crop(name, age, position = new Vec3(0, 0, 0)) {
    const type = registry.blocksByName[name];
    const block = Block.fromStateId(type.minStateId + age, 0);
    block.position = position;
    return block;
}

test('a crop is unripe until its last growth stage; other blocks are never crops', () => {
    assert.equal(isUnripeCrop(crop('wheat', 3)), true);
    assert.equal(isUnripeCrop(crop('wheat', 7)), false);
    assert.equal(isUnripeCrop(crop('beetroots', 3)), false, 'beetroot is grown at 3');
    assert.equal(isUnripeCrop(crop('carrots', 6)), true);
    assert.equal(isUnripeCrop({ name: 'wheat' }), false, 'a plant whose stage can\'t be read is checked again at it, not ruled out');
    assert.equal(isUnripeCrop({ name: 'beetroot', getProperties: () => ({ growth: 7 }) }), false, 'Bedrock calls the stage growth');
    assert.equal(isUnripeCrop({ name: 'beetroot', getProperties: () => ({ growth: 4 }) }), true);
    assert.equal(isUnripeCrop({ name: 'oak_log', getProperties: () => ({}) }), false);
    assert.equal(isUnripeCrop(null), false);
});

test('a plant whose stage could not be read is walked to, and left when it turns out young', async () => {
    const unread = Object.assign(crop('wheat', 3, new Vec3(1, 0, 0)), { getProperties: undefined });
    let digs = 0, walks = 0;
    const bot = {
        registry, game: { gameMode: 'survival' }, inventory: { items: () => [] }, world: {},
        entity: { position: new Vec3(0, 0, 0) },
        on() {}, off() {}, emit() {},
        pathfinder: { movements: null, setMovements(movements) { this.movements = movements; },
            goto: () => { walks++; return Promise.resolve(); }, setGoal() {} },
        blockAt: () => crop('wheat', 3, new Vec3(1, 0, 0)),
        dig: () => { digs++; return Promise.resolve(); },
    };
    const result = await collectBlocks(bot, 'wheat', 1, { find: predicate => [unread].filter(predicate), pickup: async () => {} });
    assert.ok(walks > 0, 'it went to look');
    assert.equal(digs, 0, 'and broke nothing');
    assert.notEqual(result.status, 'ok');
});

test('with only young wheat about, nothing is broken and the bot is told it is not grown yet', async () => {
    const young = [crop('wheat', 2, new Vec3(1, 0, 0)), crop('wheat', 5, new Vec3(2, 0, 0))];
    let digs = 0;
    const bot = {
        registry, game: { gameMode: 'survival' }, inventory: { items: () => [] },
        on() {}, off() {}, emit() {},
        dig: () => { digs++; return Promise.resolve(); },
    };
    const result = await collectBlocks(bot, 'wheat', 3, {
        find: predicate => young.filter(predicate),
        pickup: async () => {},
    });
    assert.equal(digs, 0);
    assert.equal(result.status, 'blocked');
    assert.match(result.text, /not fully grown yet/);
});
