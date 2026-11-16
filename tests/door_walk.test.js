// SPDX-License-Identifier: CC0-1.0
// useDoor walks to a door, turns to it and walks straight ahead through it. It must turn to the middle of
// the doorway: a block's position is its corner, and a bot facing the corner walks into the edge of a door
// that is already open. (A shut door hid this: opening it turns the bot to face the door.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import { useDoor } from '../src/agent/library/skills.js';

test('useDoor walks toward the middle of the doorway, not the corner of the block', async () => {
    const door = { name: 'oak_door', position: new Vec3(3, 64, 0), _properties: { open: true, half: 'lower' } };
    let facing = null;
    let walkedFacing = null;
    const bot = {
        output: '',
        pathfinder: { setGoal() {}, isMoving: () => false },
        blockAt: () => door,
        lookAt: async point => { facing = point; },
        activateBlock: async () => {},
        setControlState(control, state) {
            if (control === 'forward' && state) walkedFacing = facing;
        },
    };
    assert.equal(await useDoor(bot, new Vec3(3, 64, 0)), true);
    assert.ok(walkedFacing, 'the bot turned before it walked');
    assert.equal(walkedFacing.x, 3.5);
    assert.equal(walkedFacing.z, 0.5);
});
