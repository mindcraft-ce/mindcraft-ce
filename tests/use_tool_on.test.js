import test from 'node:test';
import assert from 'node:assert/strict';
import { useToolOn } from '../src/agent/library/skills.js';

test('survival use accepts a bare hand and rejects a missing inventory tool', async () => {
    const calls = [];
    const bot = {
        output: '',
        inventory: { slots: [] },
        game: { gameMode: 'survival' },
        async unequip(slot) { calls.push(slot); },
        async activateItem() { calls.push('activated'); },
    };
    assert.equal(await useToolOn(bot, 'hand', 'nothing'), true);
    assert.deepEqual(calls, ['hand', 'activated']);
    assert.equal(await useToolOn(bot, 'shears', 'nothing'), false);
    assert.deepEqual(calls, ['hand', 'activated']);
});
