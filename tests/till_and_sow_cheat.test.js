// SPDX-License-Identifier: CC0-1.0
// In cheat mode tillAndSow sets farmland and, when it was given a seed, the crop above it, and returns once
// both are placed. With no seed (only tilling, as the skill allows) it crashed reading the seed's name, and
// it didn't wait for either placement, so the action was over before they were made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import rootSettings from '../settings.js';

// placeBlock waits block_place_delay before each command it sends in cheat mode, and a delay shows whether
// tillAndSow waits for them. skills.js reads it once, when it loads, so it is set before the import.
rootSettings.block_place_delay = 20;
const { tillAndSow } = await import('../src/agent/library/skills.js');

function cheatingBot() {
    const said = [];
    const bot = {
        output: '', modes: { isOn: name => name === 'cheat' }, chat: text => said.push(text),
        entity: { position: new Vec3(0.5, 64, 0.5) },
        blockAt: position => ({ name: position.y < 64 ? 'grass_block' : 'air', position, boundingBox: position.y < 64 ? 'block' : 'empty' }),
    };
    return { bot, said };
}

// The commands that set the farmland and the crop. (placeBlock may send others besides; they aren't this.)
const planted = said => said.filter(text => /^\/setblock \S+ \S+ \S+ (farmland|wheat)$/.test(text));

test('with a seed, it waits for the farmland and the crop', async () => {
    const { bot, said } = cheatingBot();
    assert.equal(await tillAndSow(bot, 1, 63, 2, 'wheat_seeds'), true);
    assert.deepEqual(planted(said), ['/setblock 1 63 2 farmland', '/setblock 1 64 2 wheat']);
});

test('with no seed, it only tills', async () => {
    const { bot, said } = cheatingBot();
    assert.equal(await tillAndSow(bot, 1, 63, 2), true);
    assert.deepEqual(planted(said), ['/setblock 1 63 2 farmland']);
});
