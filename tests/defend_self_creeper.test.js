// SPDX-License-Identifier: CC0-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import * as skills from '../src/agent/library/skills.js';
import { initModes } from '../src/agent/modes.js';

// A bot with only what defendSelf and the reflex touch, standing at the origin with these mobs around.
function botWith(mobs) {
    const attacked = [];
    const bot = {
        username: 'Bot', output: '', interrupt_code: false, registry: minecraftData('1.21.6'),
        entity: { position: new Vec3(0, 64, 0) },
        entities: {},
        modes: { pause: () => {}, isOn: () => false },
        inventory: { items: () => [] },
        pvp: { attack: mob => { attacked.push(mob.name); mobs.splice(mobs.indexOf(mob), 1); }, stop: () => {} },
        pathfinder: { setMovements: () => {}, goto: async () => {}, getPathTo: async () => ({ status: 'success', path: [] }) },
        nearestEntity(match) {
            return mobs.filter(match).sort((a, b) => a.position.distanceTo(this.entity.position) - b.position.distanceTo(this.entity.position))[0] ?? null;
        },
    };
    for (const [id, mob] of mobs.entries()) bot.entities[id] = mob;
    return { bot, attacked };
}
const mob = (name, x) => ({ name, type: 'hostile', position: new Vec3(x, 64, 0) });

test('defendSelf leaves a creeper alone and fights the other hostiles', async () => {
    const { bot, attacked } = botWith([mob('creeper', 1.5), mob('zombie', 3)]);
    assert.equal(await skills.defendSelf(bot, 8), true);
    assert.deepEqual(attacked, ['zombie']);
});

test('defendSelf with only a creeper near finds nothing to fight', async () => {
    const { bot, attacked } = botWith([mob('creeper', 1.5)]);
    assert.equal(await skills.defendSelf(bot, 8), false);
    assert.deepEqual(attacked, []);
});

test('the self-defense reflex retreats from a creeper with cowardice off', async () => {
    const { bot, attacked } = botWith([mob('creeper', 2)]);
    const started = [];
    const goals = [];
    let execution;
    bot.pathfinder.setGoal = goal => {
        goals.push(goal);
        bot.interrupt_code = true;
    };
    bot.pathfinder.stop = () => {};
    const agent = {
        bot, task: null, shut_up: true, isIdle: () => true,
        prompter: { getInitModes: () => null },
        actions: { currentActionLabel: '', runAction(label, action) {
            started.push(label);
            return execution = action().then(() => ({ message: '' }));
        } },
        self_prompter: { isActive: () => false },
    };
    initModes(agent);
    for (const name of Object.keys(bot.modes.getJson())) bot.modes.setOn(name, name === 'self_defense');
    await bot.modes.update();
    await execution;
    assert.deepEqual(started, ['mode:self_defense']);
    assert.deepEqual(attacked, []);
    assert.equal(goals.length, 1);
    assert.equal(goals[0].constructor.name, 'GoalInvert');
    assert.match(bot.modes.behavior_log, /Backing away/);
});
