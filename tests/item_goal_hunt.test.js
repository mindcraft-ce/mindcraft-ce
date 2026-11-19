// SPDX-License-Identifier: CC0-1.0
// An item goal that hunts (raw porkchop from a pig) must run its hunting loop without throwing. The loop
// once stored each attack's result in a variable it never declared, which a module (strict code) refuses,
// so every hunt failed with a ReferenceError before the bot swung once. Before that, the goal crashed
// working out how to get an item with no crafting recipe at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import Vec3 from 'vec3';
import rootSettings from '../settings.js';
import { setSettings } from '../src/agent/settings.js';

// The item goal reads recipes and drops from mcdata.js, which loads its game data when a bot logs in. A bot
// pointed at a closed port never connects; telling it that it logged in loads the data all the same.
async function loadGameData() {
    setSettings({ ...rootSettings, host: '127.0.0.1', port: 1, auth: 'offline' });
    const { initBot } = await import('../src/utils/mcdata.js');
    const bot = initBot('GameData');
    bot.on('error', () => {});
    bot.emit('login');
    bot.end();
}

test('a hunting item goal runs its loop, and stops when no animal is left to attack', async () => {
    await loadGameData();
    const { ItemGoal } = await import('../src/agent/npc/item_goal.js');
    const pig = { id: 2, name: 'pig', position: new Vec3(3, 64, 0) };
    // The pig is seen when the goal picks how to get porkchop, and has wandered off by the time the bot
    // looks for one to attack: the attack finds nothing and says so.
    let looks = 0;
    const bot = {
        entity: { position: new Vec3(0, 64, 0) },
        get entities() { return looks++ === 0 ? { 2: pig } : {}; },
        inventory: { slots: [], items: () => [] },
        modes: { pause: () => {} },
        output: '',
        interrupt_code: false,
        emit: () => {},
    };
    const agent = {
        bot,
        isIdle: () => true,
        actions: { runAction: async (_label, fn) => { await fn(); } },
    };
    const obtained = await new ItemGoal(agent).executeNext('raw_porkchop', 2);
    assert.equal(obtained, false, 'nothing was hunted');
    assert.match(bot.output, /Could not find any pig to attack\./, 'the attack ran and found nothing');
    assert.equal(bot.output.match(/Could not find any pig/g).length, 1, 'and the loop stopped after the first miss');
});
