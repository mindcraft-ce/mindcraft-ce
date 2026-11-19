// SPDX-License-Identifier: CC0-1.0
// In cheat mode placeBlock sends one /setblock for a block, and a second only for a door's top half or a
// bed's head. The second one was sent for every block: its `if` had no braces, so only the delay before it
// was conditional, and stone came with a "/setblock ... stone[half=upper]" above it and another beside it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBlock } from '../src/agent/library/skills.js';

function cheatingBot() {
    const said = [];
    return { said, bot: { output: '', modes: { isOn: name => name === 'cheat' }, chat: text => said.push(text) } };
}

test('a plain block is one /setblock', async () => {
    const { bot, said } = cheatingBot();
    assert.equal(await placeBlock(bot, 'stone', 1, 64, 2), true);
    assert.deepEqual(said, ['/setblock 1 64 2 stone']);
});

test('a door gets its top half, and a bed its head', async () => {
    const door = cheatingBot();
    await placeBlock(door.bot, 'oak_door', 1, 64, 2);
    assert.deepEqual(door.said, ['/setblock 1 64 2 oak_door', '/setblock 1 65 2 oak_door[half=upper]']);
    const bed = cheatingBot();
    await placeBlock(bed.bot, 'red_bed', 1, 64, 2);
    assert.deepEqual(bed.said, ['/setblock 1 64 2 red_bed', '/setblock 1 64 1 red_bed[part=head]']);
});

test('bedrock and trapdoors do not get a second block', async () => {
    const { bot, said } = cheatingBot();
    for (const block of ['bedrock', 'oak_trapdoor']) await placeBlock(bot, block, 1, 64, 2);
    assert.deepEqual(said, ['/setblock 1 64 2 bedrock', '/setblock 1 64 2 oak_trapdoor']);
});
