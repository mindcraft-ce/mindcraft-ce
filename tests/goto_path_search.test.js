// SPDX-License-Identifier: CC0-1.0
// goToGoal asks the pathfinder whether a walkable route exists before choosing how to move. That search must
// be allowed its full time budget. The pathfinder thinks in slices (40 ms each by default) and reports
// "partial" after every slice but the last; a caller that reads only the first slice treats every route that
// takes longer than 40 ms to find as no route at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import settings from '../settings.js';
import { setSettings } from '../src/agent/settings.js';
import { initBot } from '../src/utils/mcdata.js';
import { goToGoal, searchPath } from '../src/agent/library/skills.js';
import { getSkillDocs } from '../src/agent/library/index.js';

// A stand-in for mineflayer-pathfinder's search: the same generator shape as bot.pathfinder.getPathFromTo,
// yielding one result per slice, and a getPathTo that, like the real one, returns only the first.
function fakeBot(statuses, { onSlice } = {}) {
    const calls = { slices: 0, lava: 0, options: null };
    const bot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        pathfinder: {
            getPathFromTo: function* (_movements, _start, _goal, options) {
                calls.options = options;
                for (const status of statuses) {
                    calls.slices++;
                    // A real slice spends up to 40 ms thinking before it yields. Spend a little time too, so
                    // timers fall due during a slice just as they would in the game.
                    const until = Date.now() + 3;
                    while (Date.now() < until) { /* thinking */ }
                    onSlice?.(bot, calls.slices);
                    yield { result: { status, path: [] } };
                    if (status !== 'partial') return;
                }
            },
            getPathTo(movements, goal, timeout) {
                return this.getPathFromTo(movements, bot.entity.position, goal, { timeout }).next().value.result;
            },
        },
    };
    const movements = { updateLavaAvoidance: () => { calls.lava++; } };
    return { bot, movements, calls };
}

test('the first slice alone says "partial", which is why reading only it found no route', () => {
    const { bot, movements } = fakeBot(['partial', 'partial', 'success']);
    assert.equal(bot.pathfinder.getPathTo(movements, {}, 1000).status, 'partial');
});

test('a route found in a later slice is reported as found', async () => {
    const { bot, movements, calls } = fakeBot(['partial', 'partial', 'success']);
    const result = await searchPath(bot, movements, {}, 1000);
    assert.equal(result.status, 'success');
    assert.equal(calls.slices, 3);
    assert.equal(calls.options.timeout, 1000, 'the whole budget is passed on to the search');
    assert.equal(calls.lava, 1, 'lava avoidance is refreshed first, as getPathTo does');
});

test('a search that runs out of time or finds nothing says so', async () => {
    for (const end of ['timeout', 'noPath']) {
        const { bot, movements } = fakeBot(['partial', end]);
        assert.equal((await searchPath(bot, movements, {}, 1000)).status, end);
    }
});

test('the game keeps running between slices', async () => {
    // A timer due now must get to run before the search finishes: the bot's physics and packets run on the
    // same thread, so a search that never yields freezes the bot for its whole budget.
    let timerRan = false;
    setTimeout(() => { timerRan = true; }, 0);
    const { bot, movements } = fakeBot(['partial', 'partial', 'partial', 'success']);
    await searchPath(bot, movements, {}, 1000);
    assert.ok(timerRan);
});

test('an interrupted action stops searching at the next slice', async () => {
    const { bot, movements, calls } = fakeBot(['partial', 'partial', 'partial', 'success'], {
        onSlice: (b, n) => { if (n === 2) b.interrupt_code = true; },
    });
    const result = await searchPath(bot, movements, {}, 1000);
    assert.equal(result.status, 'partial');
    assert.equal(calls.slices, 2);
});

test('the helper is not described to the model as a skill', () => {
    assert.ok(!getSkillDocs().some(doc => doc.startsWith('skills.searchPath')));
});

test('cancelling either search prevents navigation from starting', async () => {
    const version = '1.21.11';
    setSettings({ ...settings, minecraft_version: version, host: '127.0.0.1', port: 1, auth: 'offline' });
    const loader = initBot('GameData');
    loader.on('error', () => {});
    loader.emit('login');
    loader.end();
    for (const cancelOn of [1, 2]) {
        let searches = 0;
        const bot = {
            registry: minecraftData(version),
            version,
            game: { minY: -64 },
            entity: { position: new Vec3(0, 64, 0) },
            output: '',
            pathfinder: {
                *getPathFromTo() {
                    if (++searches === cancelOn) {
                        setImmediate(() => { bot.interrupt_code = true; });
                        yield { result: { status: 'partial' } };
                        assert.fail('search continued after cancellation');
                    }
                    yield { result: { status: 'noPath' } };
                },
                setMovements() { assert.fail('movement changed after cancellation'); },
                goto() { assert.fail('navigation started after cancellation'); },
            },
        };
        assert.equal(await goToGoal(bot, {}), false);
        assert.equal(searches, cancelOn);
    }
});
