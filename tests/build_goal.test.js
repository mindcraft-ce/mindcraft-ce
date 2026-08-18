import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildGoal } from '../src/agent/npc/build_goal.js';

function makeGoal(result, idle = true) {
    const agent = {
        isIdle: () => idle,
        actions: {
            runAction: async (_label, func) => {
                await func();
                return result;
            },
        },
    };
    return new BuildGoal(agent);
}

test('wrapSkill accepts only successful non-interrupted non-timed-out actions', async () => {
    assert.equal(await makeGoal({ success: true, interrupted: false, timedout: false }).wrapSkill(async () => {}), true);
    assert.equal(await makeGoal({ success: false, interrupted: false, timedout: false }).wrapSkill(async () => {}), false);
    assert.equal(await makeGoal({ success: true, interrupted: true, timedout: false }).wrapSkill(async () => {}), false);
    assert.equal(await makeGoal({ success: true, interrupted: false, timedout: true }).wrapSkill(async () => {}), false);
});

test('wrapSkill refuses to start while the agent is busy', async () => {
    let called = false;
    const goal = new BuildGoal({
        isIdle: () => false,
        actions: {
            runAction: async () => {
                called = true;
                return { success: true, interrupted: false, timedout: false };
            },
        },
    });

    assert.equal(await goal.wrapSkill(async () => {}), false);
    assert.equal(called, false);
});
