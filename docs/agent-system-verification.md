# Agent system verification — 2026-11-01

Environment: WSL2, Node 22.23.3, Java 21, Minecraft Java 1.21.11,
Mineflayer 4.39.0 and pinned dependency patches. All gameplay tests used separate
vanilla worlds and test accounts. The existing local server/world on 55917 was
preserved. No repository pushes or ACP changes were made.

## Automated regression coverage

The full `node --test tests/*.test.js` suite passes: **100 tests**. The default
suite uses local fixtures/stubs, with no model allowance consumption.

Coverage includes develop conversation/discovery/coding compatibility, native
provider round trips and signed content, strict tool validation, permissions,
action cancellation and late continuations, task replacement, no-progress bounds,
goal verification, saved-state recovery, narration modes/timers, decision wire
formats and uncertainty, optional decision gating, model selection, usage and
budget persistence. Stop races cover outstanding Brain generation, replacement
shutdown, decision checks, RP replies and request cooldowns.

Syntax checks pass for every changed JavaScript file and MindServer's inline
JavaScript. ESLint passes for the new action runtime, orchestration, decision,
narration, progress, usage and provider-helper code. `git diff --check` passes.
`patch-package --error-on-fail` applies all eight pinned patches. The changed
Mineflayer, pathfinder and prismarine-block patches also pass isolated reverse /
forward application checks with byte-identical results, without reinstalling or
disturbing the working dependencies.

## Real-server gameplay

`node tests/live/mining_scenarios.js --port=55919` passed all seven cases:

| Scenario | Observed result | End-to-end time |
| --- | --- | --- |
| Four vertical oak logs | Four confirmed breaks and four log drops | 12.8 s |
| Floating overhead log | Mined directly above the player without scaffolding | 4.9 s |
| Exposed iron and buried deepslate iron | Both requested blocks confirmed; at least two raw iron acquired | 8.3 s |
| Unenchanted diamond pick on obsidian | Block confirmed and one obsidian acquired | 11.7 s |
| Stop during obsidian, then mine again | Cancelled result, connection retained, subsequent collection succeeds | 12.4 s |
| Efficiency V obsidian | Enchantment recognized; confirmed break and collection | 4.5 s |
| Smelt two raw iron | Two ingots appear in inventory without reconnecting | 21.8 s |

Times include navigation, equipment, server acknowledgement and pickup; they
are not raw dig timers. The pure calculation test verifies 9.4 seconds for an
unenchanted diamond pick on obsidian, across 1.21.1, 1.21.4 and 1.21.11 data, plus
harvest restrictions and water/airborne/enchantment effects.

Local result artifact:
`server_data/verification-1793598751890/results.json`.

The tests reproduced three independent problems and verified their fixes:

1. Tool-tier material tags were used as mining-speed categories: obsidian was
   calculated as 75 seconds and iron ore as 4.55 seconds with a diamond pick.
2. Digging predicted local air before server confirmation, allowing false breaks.
3. Pathfinder added eye height to the target when testing reach, rejecting a
   visible overhead log while the bot stood beneath it.

The collection rewrite also accounts for pathfinder breaks, delayed drop entities,
buried drops, bounded retries, temporary coordinate avoidance and partial outcomes.
Stationary healthy digging no longer triggers the old fixed unstuck/reconnect loop.

## Full Agent + MindServer + Minecraft

`node tests/live/agent_scenarios.js` passed with recorded, role-separated responses:

- Real Brain/Task/RP handoff through MindServer, selected Task roster entry and
  actual log collection / crafting. Missing ingredients first produce a typed
  failure; the Task then recovers. The crafting goal is checked against inventory.
- Assistant content accompanying a native call and per-tool fallback narration
  reach chat. The table stays in inventory.
- 65 seconds idle after completion produce zero additional inference requests.
- Plain `stop` cancels obsidian work and sends `Stopped.` with exactly one join.

Local artifact: `server_data/agent-verification-1793599030522/results.json`.
Gathering/crafting took 23.6 seconds; the idle interval is additional.

`node tests/live/agent_scenarios.js --live-model` also passed using the existing
Andy profile's `ollama_cloud/deepseek-v4.1-flash`, with Brain, Task, RP and visible
narration enabled. It gathered three logs, made twelve planks, crafted a table
and retained the table plus eight planks. The latest passing run took 31.3 seconds.
An extra undocumented `taskDone` argument was rejected and corrected by the model;
the prompt was subsequently clarified to avoid teaching that argument.

Local artifact: `server_data/agent-verification-1793598755195/results.json`.
Earlier failed runs were retained. They exposed the goal-bookkeeping continuation
gap, invalid tool-category grants, overhead reach failure and an overly literal
test assertion for completion wording; the corresponding fixes have regressions.

## Verification limits

TypeSafe, OpenRouter Decisions, OpenAI Decisions, Claude and Gemini transports
have contract/fixture coverage, not live account-access verification. Only the
configured Ollama Cloud model was exercised with real inference. No performance
or cost savings are claimed for external decision services; a controller test
shows three confident routine checks can avoid Brain calls before a mandatory
supervision check.

State restoration uses atomic disk/controller tests with changed inventory and
world identity. Arbitrary modded servers, every hostile-combat/building scenario
and forced process crashes during gameplay were not exhaustively exercised.
The targeted Minecraft scenarios passed; this does not establish that every
Mineflayer edge case is solved. USD/token controls act on reported observations,
and a completed or concurrent request can cross a configured cap.

RAG was removed as requested. Normal skill documentation, examples, wiki lookup
and existing embeddings remain. Instinct/Deepthink was treated as design context;
the implemented structure is supervisory Brain plus optional typed decisions.

## Follow-up: player narration and automatic torch behavior

The player's live session exposed a gap in the initial Brain-oriented gameplay
checks: the default single-agent loop was not marked running during inference.
That allowed automatic idle torch placement to run before the model's explicit
placement. The existing block was then reported as failure. Separately, narration
copied technical tool results directly into chat and announced every failed call.

The fix keeps the native loop busy through generation, actions and history saves,
then releases it on completion, cancellation or error. An existing matching block
satisfies placement without an item/click. Placement exceptions are checked against
the current world before reporting failure; cancelled actions cannot append stale
placement output to a newer action's log.

Narration retains user-facing model text, uses plain-language fallbacks, and keeps
raw results for model context/logs. Recoverable retries respect cadence; recurring
problems are deduplicated. Internal handoffs do not become progress announcements.
Slow inference can receive periodic updates as well as long physical actions.

`node tests/live/narration_scenarios.js` passed against a separate vanilla world
with Brain disabled, delayed recorded model turns and automatic torches enabled:

- Three real torches placed at spaced targets, consuming exactly three items.
- Repeating an existing placement succeeded and consumed no extra torch.
- All 22 observed work snapshots reported busy between model/tool turns, and no
  automatic torch action competed with the active loop.
- Chat contained only: “I'm spreading torches along the path.”, “I'm lighting the
  next dark patch.”, and “The path is lit now.” No internal result text appeared.
- Teleporting to an unlit spot after completion triggered normal automatic torch
  placement with no additional inference, confirming that behavior still resumes.

Local artifact: `server_data/agent-verification-1793604528929/results.json`.
The existing Brain/Task/RP scenario also passed again after these fixes, including
crafting, 65 seconds without idle inference, and stopping a live dig without
reconnecting: `server_data/agent-verification-1793604704391/results.json`.
These follow-up checks did not restart or alter the player's running session.
