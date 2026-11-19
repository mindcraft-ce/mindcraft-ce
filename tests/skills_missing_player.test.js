// A player name that isn't on the server (a typo, or someone who just left) should get an honest
// "could not find", not a crash.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as skills from '../src/agent/library/skills.js';

// A bot alone on the server: its player list has no entry for anyone else.
function loneBot() {
    const me = { id: 1, type: 'player', username: 'Andy', position: { x: 0, y: 64, z: 0 } };
    return { username: 'Andy', players: {}, entities: { 1: me }, entity: me, output: '', modes: { isOn: () => false, pause: () => {} } };
}

test('giveToPlayer, goToPlayer and followPlayer report a missing player instead of throwing', async () => {
    const bot = loneBot();
    assert.equal(await skills.giveToPlayer(bot, 'oak_log', 'Nobody'), false);
    assert.match(bot.output, /Could not find Nobody/);
    assert.equal(await skills.goToPlayer(bot, 'Nobody'), false);
    assert.equal(await skills.followPlayer(bot, 'Nobody'), false);
});
