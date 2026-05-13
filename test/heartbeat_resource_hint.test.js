import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getHeartbeatResourcePivot } from '../src/agent/heartbeat_resource_hint.js';

describe('getHeartbeatResourcePivot', () => {
  it('suggests a different collect target after a No-X-nearby failure', () => {
    const hint = getHeartbeatResourcePivot({
      command: 'collectBlocks',
      succeeded: false,
      error: 'No oak_log nearby',
      streakKey: 'collectBlocks:oak_log',
    });

    assert.equal(hint?.resource, 'any_log');
    assert.match(hint?.hint, /No oak_log nearby/);
    assert.match(hint?.hint, /!collectBlocks\("any_log", 4\)/);
    assert.doesNotMatch(hint?.hint, /oak_log", 4/);
  });

  it('cycles beyond logs when the failing target is already any_log', () => {
    const hint = getHeartbeatResourcePivot({
      command: 'collectBlocks',
      succeeded: false,
      error: 'No any_log nearby',
      streakKey: 'collectBlocks:any_log',
    });

    assert.equal(hint?.resource, 'cobblestone');
    assert.match(hint?.hint, /!collectBlocks\("cobblestone", 4\)/);
  });

  it('also treats Collected 0 as a resource miss', () => {
    const hint = getHeartbeatResourcePivot({
      command: 'collectBlocks',
      succeeded: false,
      error: 'Collected 0 dirt',
      streakKey: 'collectBlocks:dirt',
    });

    assert.equal(hint?.resource, 'stone');
    assert.match(hint?.hint, /Collected 0 dirt/);
    assert.match(hint?.hint, /!collectBlocks\("stone", 4\)/);
  });

  it('does not override non-resource failures', () => {
    const hint = getHeartbeatResourcePivot({
      command: 'craftRecipe',
      succeeded: false,
      error: "Don't have enough oak_planks",
      streakKey: 'craftRecipe:stick',
    });

    assert.equal(hint, null);
  });
});
