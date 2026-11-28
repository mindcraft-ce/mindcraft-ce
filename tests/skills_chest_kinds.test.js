// SPDX-License-Identifier: CC0-1.0
// The chest skills (putInChest, takeFromChest, viewChest) use the nearest chest, trapped chest or barrel. They
// searched for chests alone, so a bot standing by a barrel said there was no chest nearby.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import rootSettings from '../settings.js';
import { setSettings } from '../src/agent/settings.js';

// The skills name blocks through mcdata.js, which loads its game data when a bot logs in. A bot pointed at a
// closed port never connects; telling it that it logged in loads the data all the same.
let mc, skills;
async function loadGameData() {
    if (mc) return;
    setSettings({ ...rootSettings, host: '127.0.0.1', port: 1, auth: 'offline' });
    mc = await import('../src/utils/mcdata.js');
    const bot = mc.initBot('GameData');
    bot.on('error', () => {});
    bot.emit('login');
    bot.end();
    skills = await import('../src/agent/library/skills.js');
}

/**
 * A bot in cheat mode (so walking to a container is one /tp) beside some containers, each with what it holds.
 * @param {{name: string, position: Vec3, items: {name: string, type: number, count: number}[]}[]} containers
 */
function botBeside(containers) {
    const opened = [];
    const bot = {
        output: '',
        entity: { position: new Vec3(0.5, 64, 0.5) },
        modes: { isOn: mode => mode === 'cheat', pause() {} },
        chat() {},
        findBlocks: ({ matching, maxDistance, count }) => {
            const ids = [].concat(matching);
            return containers.filter(c => ids.includes(mc.getBlockId(c.name)) && c.position.distanceTo(bot.entity.position) <= maxDistance)
                .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
                .slice(0, count).map(c => c.position);
        },
        blockAt: pos => containers.find(c => c.position.equals(pos.floored())) ?? null,
        inventory: { items: () => [], findInventoryItem: () => null },
        openContainer: async block => {
            opened.push(block.name);
            return {
                containerItems: () => block.items,
                withdraw: async (type, metadata, count) => {
                    const item = block.items.find(i => i.type === type);
                    item.count -= count;
                },
                deposit: async () => {},
                close: async () => {},
            };
        },
    };
    return { bot, opened };
}

test('a barrel or a trapped chest is viewed and taken from as a chest is', async () => {
    await loadGameData();
    for (const name of ['barrel', 'trapped_chest']) {
        const container = { name, position: new Vec3(3, 64, 0), items: [{ name: 'iron_ingot', type: 1, count: 9 }] };
        const { bot, opened } = botBeside([container]);
        assert.equal(await skills.viewChest(bot), true, bot.output);
        assert.match(bot.output, /9 iron_ingot/);
        assert.equal(await skills.takeFromChest(bot, 'iron_ingot', 4), true, bot.output);
        assert.equal(container.items[0].count, 5);
        assert.deepEqual(opened, [name, name]);
    }
});

test('the nearest of them is used, whatever its kind', async () => {
    await loadGameData();
    const chest = { name: 'chest', position: new Vec3(10, 64, 0), items: [] };
    const barrel = { name: 'barrel', position: new Vec3(3, 64, 0), items: [] };
    const { bot, opened } = botBeside([chest, barrel]);
    assert.equal(await skills.viewChest(bot), true);
    assert.deepEqual(opened, ['barrel']);
});

test('with none nearby, it says there is no chest or barrel', async () => {
    await loadGameData();
    const { bot } = botBeside([{ name: 'furnace', position: new Vec3(2, 64, 0), items: [] }]);
    assert.equal(await skills.viewChest(bot), false);
    assert.match(bot.output, /Could not find a chest or barrel nearby/);
});
