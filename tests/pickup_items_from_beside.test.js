// SPDX-License-Identifier: CC0-1.0
// pickupNearbyItems must not dig or place blocks to stand in an item's own cell. A player picks an item up from
// about a block away (the pickup box is the player's own, one block wider on each side and half a block taller
// and deeper), so the bot only needs to get next to it. Digging or placing is a last resort, tried only when
// the caller allows it and walking alone can't get close.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { pickupNearbyItems } from '../src/agent/library/skills.js';

const registry = minecraftData('1.21.11');

// Whether a player whose feet are at `feet` picks up an item lying at `item`, as the server decides it: the
// player's box (0.6 wide, 1.8 tall) grown by one block sideways and half a block up and down, touching the
// item's own box (0.25 on a side).
function withinPickup(feet, item) {
    const reach = 0.3 + 1 + 0.125;
    return Math.abs(item.x - feet.x) < reach && Math.abs(item.z - feet.z) < reach &&
        item.y < feet.y + 1.8 + 0.5 && item.y + 0.25 > feet.y - 0.5;
}

/**
 * A pretend bot for the pickup loop, standing at (0, 64, 0) with one item nearby. Each walk the pickup asks
 * for is recorded with the movement settings it used. A walk whose goal is already met changes nothing; any
 * other walk ends in the item's own cell, which may take digging or placing to get into.
 */
function fakeBot({ itemAt, needsDiggingToReach, walkableToItem, botAt = { x: 0.5, y: 64, z: 0.5 } }) {
    const item = { id: 7, name: 'item', position: new Vec3(itemAt.x, itemAt.y, itemAt.z) };
    const walks = [];
    const bot = {
        registry,
        version: '1.21.11',
        game: { minY: -64 },
        output: '',
        inventory: { items: () => [], slots: [] },
        entity: { position: new Vec3(botAt.x, botAt.y, botAt.z), effects: {} },
        entities: { [item.id]: item },
        controls: [],
        looks: [],
        async lookAt(point) { this.looks.push(point.clone()); },
        // Walking forward moves the bot straight at the item until the item's cell wall stops it, as when the
        // item lies in a notch in a wall. Sneaking is recorded: it is what keeps a real bot from stepping off
        // an edge while it does this.
        setControlState(control, on) {
            this.controls.push([control, on]);
            if (control !== 'forward' || !on) return;
            const wallX = Math.floor(item.position.x) - 0.3;
            const p = this.entity.position;
            this.entity.position = new Vec3(Math.max(p.x, Math.min(item.position.x, wallX)), p.y, item.position.z);
            if (withinPickup(this.entity.position, item.position)) delete this.entities[item.id];
        },
        nearestEntity(predicate) {
            return Object.values(this.entities).filter(predicate)
                .sort((a, b) => a.position.distanceTo(this.entity.position) - b.position.distanceTo(this.entity.position))[0] ?? null;
        },
        pathfinder: {
            movements: null,
            bestHarvestTool: () => null,
            setMovements(movements) { this.movements = movements; },
            setGoal() {},
            async goto(goal) {
                const movements = this.movements;
                const placing = movements.scafoldingBlocks.length > 0;
                const here = bot.entity.position.floored();
                const walk = { canDig: movements.canDig, placing, changedWorld: false };
                walks.push(walk);
                if (!goal.isEnd(here)) {
                    // The walk ends in the item's own cell. In an open pit the bot just steps down into it;
                    // otherwise getting in takes digging (deep in a hole) or digging or placing (on a lip).
                    if (!walkableToItem) {
                        const possible = needsDiggingToReach ? movements.canDig : movements.canDig || placing;
                        if (!possible) throw new Error('No path to the goal!');
                        walk.changedWorld = true;
                    }
                    bot.entity.position = item.position.floored().offset(0.5, 0, 0.5);
                }
                // The server hands the item over as soon as the bot is close enough.
                if (withinPickup(bot.entity.position, item.position)) delete bot.entities[item.id];
            },
        },
    };
    return { bot, walks, item };
}

test('an item on the lip of a hole, one block up and over, is picked up from where the bot stands', async () => {
    // Seen live: after mining an ore the drop came to rest on the edge of the hole, and the bot placed a block
    // to climb into the item's own cell, though it was already close enough to pick it up.
    const { bot, walks, item } = fakeBot({ itemAt: { x: 1.5, y: 65, z: 0.5 } });
    await pickupNearbyItems(bot, true);
    assert.ok(!bot.entities[item.id], 'the item was picked up');
    assert.ok(walks.length >= 1);
    assert.ok(walks.every(walk => !walk.changedWorld), 'nothing was dug or placed');
    assert.equal(walks[0].canDig, false, 'the first try only walks');
    assert.equal(walks[0].placing, false, 'and places nothing');
    assert.match(bot.output, /Picked up 1 item/);
});

test('an item the bot can only reach by digging is fetched on the second try, when digging is allowed', async () => {
    const { bot, walks, item } = fakeBot({ itemAt: { x: 4.5, y: 62, z: 0.5 }, needsDiggingToReach: true });
    await pickupNearbyItems(bot, true);
    assert.equal(walks.length, 2, `two tries: ${JSON.stringify(walks)}`);
    assert.equal(walks[0].canDig, false, 'walking is tried first');
    assert.equal(walks[1].canDig, true, 'digging only after walking could not get close');
    assert.ok(!bot.entities[item.id], 'the item was picked up');
});

test('without permission to dig, the bot never digs or places for an item', async () => {
    const { bot, walks, item } = fakeBot({ itemAt: { x: 4.5, y: 62, z: 0.5 }, needsDiggingToReach: true });
    await pickupNearbyItems(bot, false);
    assert.ok(walks.length >= 1);
    assert.ok(walks.every(walk => !walk.canDig && !walk.placing), JSON.stringify(walks));
    assert.ok(bot.entities[item.id], 'the item is left where it is');
    assert.match(bot.output, /Picked up 0 item/);
});

test('an item one block down in a pit beside the bot is fetched, not given up on from above', async () => {
    // From the rim the item is one block over and one down: too low to pick up, since the pickup box reaches
    // only half a block below the feet. "Near enough" must not count that spot.
    const { bot, walks, item } = fakeBot({ itemAt: { x: 1.5, y: 63, z: 0.5 }, walkableToItem: true });
    await pickupNearbyItems(bot, false);
    assert.ok(!bot.entities[item.id], `the item was picked up: ${JSON.stringify(walks)}`);
    assert.ok(walks.every(walk => !walk.changedWorld), 'nothing was dug or placed');
});

test('an item at the far side of its cell, just out of reach, is fetched with a short sneak forward', async () => {
    // Seen live: a mined diamond slid to the back of its notch in a wall (x 5.875) while the pathfinder stopped
    // the bot at the near edge of the next cell (x 4.32), 1.55 blocks apart, just too far. A player walks the
    // last half step into the wall; the bot does the same, sneaking so it can't walk off an edge.
    const { bot, walks, item } = fakeBot({ itemAt: { x: 1.875, y: 65, z: 0.127 }, botAt: { x: 0.32, y: 64, z: 0.5 } });
    assert.ok(!withinPickup(bot.entity.position, item.position), 'out of reach where the bot stands');
    await pickupNearbyItems(bot, true);
    assert.ok(!bot.entities[item.id], 'the item was picked up');
    assert.ok(walks.every(walk => !walk.changedWorld), `nothing was dug or placed: ${JSON.stringify(walks)}`);
    assert.ok(bot.looks.length >= 1, 'it looked at the item first');
    const sneaking = bot.controls.findIndex(([c, on]) => c === 'sneak' && on);
    const forward = bot.controls.findIndex(([c, on]) => c === 'forward' && on);
    assert.ok(sneaking >= 0 && sneaking < forward, 'it was sneaking before it stepped');
    const last = new Map(bot.controls.map(([c, on]) => [c, on]));
    assert.equal(last.get('forward'), false, 'and let go of forward');
    assert.equal(last.get('sneak'), false, 'and of sneak');
});
