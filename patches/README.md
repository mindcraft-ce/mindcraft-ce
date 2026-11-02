# Minecraft movement patches

Movement dependencies are pinned in `package-lock.json`. `npm ci` applies these
patches automatically and fails if a patch no longer applies. After upgrading a
patched package, compare its upstream source before rebasing or removing the patch.

## Pathfinder 2.4.5

This is the latest published npm release checked on September 30, 2026. The patch
backports the following changes from PrismarineJS master:

- [Unreachable and partial path results, and idle stop handling](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/375)
  (`84c3bd29a7fb`). An empty failed search must reject; a partial search must keep
  waiting. Calling stop while idle must not cancel the next action.
- [Door and gate waypoint processing](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/372)
  (`e37bff8992dd`). Interaction nodes use the floor center, and opening a door
  does not prevent later waypoints from being processed.
- [Correct placement exclusion block](https://github.com/PrismarineJS/mineflayer-pathfinder/pull/351)
  (`874949196ac1`).
- [Pass the node to GoalBreakBlock.isEnd](https://github.com/PrismarineJS/mineflayer-pathfinder/commit/d69a02904bc8).

Local changes clear a rejected goal, enable wooden doors and fence gates, finish
door interaction state, release jump after placement, and allow escape from lava
while restoring lava avoidance after leaving it. Vine climbing is restricted to
the normal vines supported by the installed physics engine.

`GoalLookAtBlock` measures reach from the bot's eye rather than adding eye height
to the target block. The old expression could reject an otherwise visible log
three blocks overhead, even when the bot was standing directly underneath it.

The old fake block-state write before placement, tightened waypoint tolerance,
and two-block climbing shortcuts have been removed. Paths use confirmed world
state and upstream movement constraints.

## Collectblock 1.6.0

The plugin must preserve the supplied movement safety settings. It previously
disabled liquid and falling-block checks each time collection started.

For ore completely surrounded by stone, `GoalLookAtBlock` cannot find a visible
face in the current world. If its search returns `NoPath`, collection first
approaches an adjacent position with `GoalGetToBlock`, letting pathfinder tunnel
to the ore. It then checks visibility and reach again before harvesting.

## Mineflayer 4.39.0

The former 4.37.1 placement-timeout patch has been removed. The current upstream
implementation detects rejected placement and waits for server responses. A
500 ms timeout and speculative block state would undermine that confirmation.

The 4.39.0 crafting patch confirms modern crafting clicks with authoritative
window snapshots instead of waiting for a result-slot change that the server
may not send. Inventory-grid crafts also confirm the final put-away click,
just as crafting-table crafts do. Original errors retain their stack traces.

Fishing exposes a cancellation method that retracts the rod and settles the
pending fishing promise. Call `bot.stopFishing()` before another action takes
ownership of the bot.

Digging waits for the server's block update after sending finish-digging. It no
longer writes speculative air locally, which could resolve collection before the
server broke the block. A missing confirmation rejects after five seconds;
interruption removes the block listener and settles the pending dig.

## Prismarine-block 1.23.0

Modern block materials can describe tool-tier restrictions such as
`incorrect_for_wooden_tool` instead of mining-speed categories. When a block's
explicit harvest-tool list identifies a matching tool family, resolve its speed
through that family's `mineable/*` table. Keep harvest-tier checks and ineffective
tool speeds unchanged. With the installed 1.21.11 data this changes diamond-pick
obsidian from 75 seconds to 9.4 seconds and iron ore from 4.55 seconds to 0.6.
Enchantments, water and airborne penalties still apply.

## PVP 1.3.2

Combat follows the current `physicsTick` event. Its stop handler registers before
requesting a path stop, keeps other plugins' listeners, and only clears the goal
belonging to that attack. A delayed stop timeout cannot cancel a newer movement
command. Stopping or force-stopping also invalidates pending attack requests so
they cannot restart combat after interruption.

## Prismarine-item 1.18.0

Modern enchantment components contain registry IDs and levels inside an
`enchantments` field. The getter normalizes them to the name/level array expected
by Mineflayer and prismarine-block, including stored book enchantments. This
prevents enchanted mining tools from throwing during dig-time calculation and
allows callers to distinguish Silk Touch from Fortune.
