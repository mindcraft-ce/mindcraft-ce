// SPDX-License-Identifier: CC0-1.0
// Asked to craft something with no crafting recipe, or a name that is no item at all, craftRecipe must say
// so. The recipe lookup answers "none" with null, not an empty list, and craftRecipe crashed reading it.
import test from 'node:test';
import assert from 'node:assert/strict';
import Vec3 from 'vec3';
import rootSettings from '../settings.js';
import { setSettings } from '../src/agent/settings.js';

// craftRecipe reads recipes from mcdata.js, which loads its game data when a bot logs in. A bot pointed at
// a closed port never connects; telling it that it logged in loads the data all the same.
async function loadGameData() {
    setSettings({ ...rootSettings, host: '127.0.0.1', port: 1, auth: 'offline' });
    const mc = await import('../src/utils/mcdata.js');
    const bot = mc.initBot('GameData');
    bot.on('error', () => {});
    bot.emit('login');
    bot.end();
}

test('craftRecipe says an item has no crafting recipe, instead of crashing', async () => {
    await loadGameData();
    const { craftRecipe } = await import('../src/agent/library/skills.js');
    for (const name of ['raw_porkchop', 'not_an_item']) {
        const bot = { output: '', entity: { position: new Vec3(0, 64, 0) } };
        assert.equal(await craftRecipe(bot, name, 1), false, name);
        assert.match(bot.output, new RegExp(`${name} is either not an item, or it does not have a crafting recipe!`));
    }
});
