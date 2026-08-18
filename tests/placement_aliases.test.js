import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlacementItemName } from '../src/agent/commands/placement_aliases.js';

test('placeHere aliases normalize block registry names to inventory item names', () => {
    assert.equal(normalizePlacementItemName('tripwire'), 'string');
    assert.equal(normalizePlacementItemName('potatoes'), 'potato');
    assert.equal(normalizePlacementItemName('wheat'), 'wheat_seeds');
});

test('unknown placement names pass through unchanged', () => {
    assert.equal(normalizePlacementItemName('oak_planks'), 'oak_planks');
});
