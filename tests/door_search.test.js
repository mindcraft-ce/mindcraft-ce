// SPDX-License-Identifier: CC0-1.0
// useDoor with no position finds the nearest door with one search for every kind of door. It searched once
// per kind, so with no door nearby it scanned the area once for each kind, and with doors of two kinds
// nearby it took the first kind listed, not the nearest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import rootSettings from '../settings.js';
import { setSettings } from '../src/agent/settings.js';

// useDoor names doors through mcdata.js, which loads its game data when a bot logs in. A bot pointed at a
// closed port never connects; telling it that it logged in loads the data all the same.
let mc, useDoor;
async function loadGameData() {
    if (mc) return;
    setSettings({ ...rootSettings, host: '127.0.0.1', port: 1, auth: 'offline' });
    mc = await import('../src/utils/mcdata.js');
    const bot = mc.initBot('GameData');
    bot.on('error', () => {});
    bot.emit('login');
    bot.end();
    ({ useDoor } = await import('../src/agent/library/skills.js'));
}

function botWithDoors(doors) {
    const searches = [];
    const bot = {
        output: '',
        entity: { position: new Vec3(0.5, 64, 0.5) },
        pathfinder: { setGoal() {}, isMoving: () => false },
        findBlocks: ({ matching, maxDistance, count }) => {
            searches.push(matching);
            const ids = [].concat(matching);
            return doors.filter(d => ids.includes(mc.getBlockId(d.name)) && d.position.distanceTo(bot.entity.position) <= maxDistance)
                .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
                .slice(0, count).map(d => d.position);
        },
        blockAt: pos => doors.find(d => d.position.equals(pos.floored())) ?? null,
        lookAt: async () => {},
        activateBlock: async () => {},
        setControlState() {},
    };
    return { bot, searches };
}

test('with no door nearby, useDoor searches once and says so', async () => {
    await loadGameData();
    const { bot, searches } = botWithDoors([]);
    assert.equal(await useDoor(bot), false);
    assert.equal(searches.length, 1, 'one search for every kind of door');
    assert.match(bot.output, /Could not find a door/);
});

test('useDoor goes to the nearest door, whatever its kind', async () => {
    await loadGameData();
    const far = { name: 'oak_door', position: new Vec3(12, 64, 0), _properties: { open: true, half: 'lower' } };
    const near = { name: 'spruce_door', position: new Vec3(3, 64, 0), _properties: { open: true, half: 'lower' } };
    const { bot, searches } = botWithDoors([far, near]);
    assert.equal(await useDoor(bot), true);
    assert.equal(searches.length, 1);
    assert.match(bot.output, /Used door at \(3, 64, 0\)/);
});
