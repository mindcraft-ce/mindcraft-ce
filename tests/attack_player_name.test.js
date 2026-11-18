// SPDX-License-Identifier: CC0-1.0
// After a fight, attackEntity says what it killed. For a player that read the entity's kind ("player",
// or nothing at all), not who it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Vec3 from 'vec3';
import { attackEntity } from '../src/agent/library/skills.js';
import settings from '../settings.js';

const require = createRequire(import.meta.url);

test('killing a player names the player', async () => {
    const target = { id: 1, type: 'player', name: 'player', username: 'Steve', position: new Vec3(1, 64, 0) };
    const bot = {
        // The real game data, for the walk the bot plans to pick up what the fight dropped (nothing here).
        registry: require('prismarine-registry')(settings.minecraft_version),
        username: 'andy', output: '', interrupt_code: false,
        entity: { position: new Vec3(0, 64, 0) },
        entities: { 1: target },
        inventory: { items: () => [] },
        pvp: { attack: entity => { delete bot.entities[entity.id]; }, stop() {} },
        pathfinder: { movements: null, setMovements() {} },
        nearestEntity: () => null,
    };
    assert.equal(await attackEntity(bot, target, true), true);
    assert.match(bot.output, /Successfully killed Steve\./);
});
