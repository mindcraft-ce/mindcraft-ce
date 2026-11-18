// SPDX-License-Identifier: CC0-1.0
// avoidEnemies runs until no hostile is within its distance, which can take a while. It used to pause
// self_preservation for all that time, so a bot fleeing into lava, fire or deep water had nothing to get
// it out. Running away is no reason to stop caring about those.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import * as skills from '../src/agent/library/skills.js';

test('avoidEnemies leaves self_preservation running', async () => {
    const paused = [];
    const mob = { name: 'zombie', type: 'hostile', position: new Vec3(10, 64, 0) };
    let goals = 0;
    const bot = {
        username: 'Bot', output: '', interrupt_code: false, registry: minecraftData('1.21.6'),
        entity: { position: new Vec3(0, 64, 0) },
        entities: { 1: mob },
        modes: { pause: name => paused.push(name), isOn: () => false },
        inventory: { items: () => [] },
        attack: async () => {},
        pathfinder: { setMovements: () => {}, stop: () => {}, setGoal: () => { if (++goals >= 1) bot.interrupt_code = true; } },
        nearestEntity: match => (match(mob) ? mob : null),
    };
    await skills.avoidEnemies(bot, 16);
    assert.equal(goals, 1, 'it did walk away');
    assert.equal(paused.includes('self_preservation'), false);
});
