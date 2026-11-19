// SPDX-License-Identifier: CC0-1.0
// attackNearest given no mob type (an empty string from the model) must say so and do nothing else. It
// used to pause the bot's cowardice first, as it does before a real fight, and then search for a mob
// named "".
import test from 'node:test';
import assert from 'node:assert/strict';
import Vec3 from 'vec3';
import { attackNearest } from '../src/agent/library/skills.js';

test('attackNearest with no mob type says so, and pauses no reflex', async () => {
    for (const mobType of ['', '   ']) {
        const paused = [];
        const bot = { output: '', entity: { position: new Vec3(0, 64, 0) }, entities: {}, modes: { pause: mode => paused.push(mode) } };
        assert.equal(await attackNearest(bot, mobType), false);
        assert.match(bot.output, /Please provide a mob type to attack\./);
        assert.deepEqual(paused, [], 'cowardice is left as it was');
    }
});
