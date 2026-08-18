import test from 'node:test';
import assert from 'node:assert/strict';
import { NPCContoller } from '../src/agent/npc/controller.js';

function makeAgent(npc, promptGoalSetting = () => Promise.resolve(null)) {
    return {
        prompter: {
            profile: { npc },
            promptGoalSetting,
        },
        history: { getHistory: () => [] },
    };
}

test('setGoal reports configured goal names instead of array indexes', async () => {
    let observedPastGoals;
    const agent = makeAgent(
        {
            goals: [
                { name: 'oak_log', quantity: 2 },
                { name: 'coal', quantity: 1 },
            ],
            do_set_goal: true,
        },
        (_history, pastGoals) => {
            observedPastGoals = pastGoals;
            return Promise.resolve(null);
        }
    );

    const controller = new NPCContoller(agent);
    await controller.setGoal();

    assert.deepEqual(observedPastGoals, { oak_log: true, coal: true });
});

test('built-position queries ignore stale construction records safely', () => {
    const controller = new NPCContoller(makeAgent({
        built: {
            deleted_blueprint: {
                position: { x: 0, y: 64, z: 0 },
                orientation: 0,
            },
        },
    }));

    assert.deepEqual(controller.getBuiltPositions(), []);
    assert.equal(controller.getBuildingDoor('deleted_blueprint'), null);
});
