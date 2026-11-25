// SPDX-License-Identifier: CC0-1.0
// avoidEnemies runs until no hostile is within its distance, which can take a while. It used to pause
// self_preservation for all that time, so a bot fleeing into lava, fire or deep water had nothing to get
// it out. Running away is no reason to stop caring about those.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import * as skills from '../src/agent/library/skills.js';
import { initModes } from '../src/agent/modes.js';

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

test('an active retreat ignores generic low health and still lets fire or lava take priority', async () => {
    const mob = { name: 'creeper', type: 'hostile', position: new Vec3(5, 64, 0) };
    const bot = {
        output: '', interrupt_code: false, registry: minecraftData('1.21.6'),
        entity: { position: new Vec3(0, 64, 0) },
        entities: { 1: mob }, health: 3, lastDamageTime: Date.now(), lastDamageTaken: 1,
        inventory: { findInventoryItem: () => null },
        blockAt: position => ({ name: 'air', position }),
        pathfinder: { setMovements() {}, setGoal() {}, stop() {} },
        nearestEntity: match => match(mob) ? mob : null,
    };
    const started = [];
    const agent = {
        bot, shut_up: true, isIdle: () => false,
        prompter: { getInitModes: () => ({self_preservation:true}) },
        actions: { currentActionLabel: 'fixture', runAction: async label => {
            started.push(label);
            return { message: '', interrupted: true };
        } },
        self_prompter: { isActive: () => false },
    };
    initModes(agent);
    for (const mode of Object.keys(bot.modes.getJson())) bot.modes.setOn(mode, mode === 'self_preservation');
    const retreat = skills.avoidEnemies(bot, 8);
    try {
        assert.equal(skills.isFleeing(bot), true);
        await bot.modes.update();
        assert.deepEqual(started, []);
        for (const hazard of ['fire', 'lava']) {
            bot.blockAt = position => ({ name: hazard, position });
            await bot.modes.update();
        }
        assert.deepEqual(started, ['mode:self_preservation', 'mode:self_preservation']);
    } finally {
        bot.interrupt_code = true;
        await retreat;
    }
    assert.equal(skills.isFleeing(bot), false);
});
