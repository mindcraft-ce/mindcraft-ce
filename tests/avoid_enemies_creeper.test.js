// SPDX-License-Identifier: CC0-1.0
// avoidEnemies walks away from hostile mobs and swings at one that gets within 3 blocks. A creeper that
// close is about to explode: the bot keeps walking away from it instead of stopping to hit it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import * as skills from '../src/agent/library/skills.js';

// A bot with only what avoidEnemies touches, at the origin with one mob 2 blocks away that never leaves.
// It stops itself after the second time it is told where to walk, so the skill runs one full round.
function botNear(name) {
    const mob = { name, type: 'hostile', position: new Vec3(2, 64, 0) };
    const hits = [];
    let goals = 0;
    const bot = {
        username: 'Bot', output: '', interrupt_code: false, registry: minecraftData('1.21.6'),
        entity: { position: new Vec3(0, 64, 0) },
        entities: { 1: mob },
        modes: { pause: () => {}, isOn: () => false },
        inventory: { items: () => [] },
        attack: async target => { hits.push(target.name); },
        pathfinder: {
            setMovements: () => {}, stop: () => {},
            setGoal: () => { if (++goals >= 2) bot.interrupt_code = true; },
        },
        nearestEntity: match => (match(mob) ? mob : null),
    };
    return { bot, hits };
}

test('avoidEnemies keeps walking away from a creeper within 3 blocks instead of hitting it', async () => {
    const { bot, hits } = botNear('creeper');
    await skills.avoidEnemies(bot, 16);
    assert.deepEqual(hits, []);
});

test('avoidEnemies still hits a zombie within 3 blocks', async () => {
    const { bot, hits } = botNear('zombie');
    await skills.avoidEnemies(bot, 16);
    assert.deepEqual(hits, ['zombie']);
});
