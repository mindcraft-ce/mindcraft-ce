// SPDX-License-Identifier: CC0-1.0
// useDoor looks for the doors in HAND_OPENED_DOORS. A door the list leaves out is one the bot walks past,
// so the list is checked against the newest game data installed: a game update that adds a door fails
// here until the door is listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import { HAND_OPENED_DOORS } from '../src/utils/mcdata.js';

function newestGameData() {
    for (const version of [...minecraftData.supportedVersions.pc].reverse()) {
        const data = minecraftData(version);
        if (data?.blocksByName) return data;
    }
    throw new Error('no Java Edition game data installed');
}

test('every door a hand can open in the newest game data is listed', () => {
    const data = newestGameData();
    const doors = Object.keys(data.blocksByName).filter(name => name.endsWith('_door') && name !== 'iron_door');
    const missing = doors.filter(name => !HAND_OPENED_DOORS.includes(name));
    assert.deepEqual(missing, [], `doors missing for ${data.version.minecraftVersion}`);
});

test('the list has no iron door and no duplicates', () => {
    assert.ok(!HAND_OPENED_DOORS.includes('iron_door'));
    assert.equal(new Set(HAND_OPENED_DOORS).size, HAND_OPENED_DOORS.length);
});
