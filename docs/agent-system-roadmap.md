# Agent system implementation roadmap

Updated 2026-11-01 after reviewing MrElmida's newly supplied Mindcraft Unleashed source.
This document preserves the agreed implementation scope and source provenance. Runtime
configuration is documented in [agent-system.md](agent-system.md); actual results and
remaining verification limits are recorded in [agent-system-verification.md](agent-system-verification.md).

## Source and scope

- Reference source: `/home/riqvip/projects/mindcraft-unleashed`.
- Supplied archive: `mindcraft-unleashed-mc26.tar.gz`; extracted and all 553 regular files
  compared byte-for-byte through SHA-256 checks before the archive was deleted.
- Archive SHA-256: `d917c8e76fa99aad7a7275b977de48ce4ce94723a8ce88283e69a6abfe6eca86`.
- The archive contains no Git checkout, so its exact upstream commit is unknown. Its build
  targets Minecraft 26.1.1–26.3 and Java 25. CE remains a Node/Mineflayer application;
  its current local test server is Java Edition 1.21.11.
- Preserve current develop behavior and integrations while adapting the useful architecture.
  Keep existing provider SDKs, command implementations, profiles, Minecraft connections,
  Docker support, and MindServer controls working.
- Native function calling ON by default is the agreed destination. Keep a documented explicit
  legacy opt-out. Brain orchestration and decision services remain independently
  configurable and must each become complete within the scope below. RAG has been removed
  from this branch and is deferred to separate future work.
- ACP is deferred. The new source's ACP, voice, launcher, mod research world, and mod-loader
  integrations are reference material for possible later work, outside this implementation.
- Work stays on the local `agent-system` branch; no pushes. Preserve the user's existing
  profile/model choices, `.nvmrc`, and local settings, especially the uncommittable port override.

## What the new source changes

The main reference directory below is
`common/src/main/kotlin/org/mindcraftce/mindcraftUnleashed/client/` in Unleashed.

| Area | Source reviewed | Consequence for CE |
| --- | --- | --- |
| Brain lifecycle | `agent/Brain.kt`, `BrainHost.kt`, `Agent.kt` | Use event-driven supervision, explicit active/ended directives, stale-response rejection, wake coalescing, idle backoff, and protection against repeated reassignment. |
| Task handoffs | `agent/TaskDirective.kt`, `TaskLoop.kt`, `tools/impl/query/TaskHandoffTools.kt` | Add explicit done/blocked handoffs and structured briefings instead of relying solely on a free-form JSON completion flag. |
| Tool results | `tools/ToolResult.kt`, `tools/impl/action/MiningOutcome.kt` | Represent OK, partial, failed, blocked, and cancelled outcomes separately, with actual target gains and stable error codes. |
| Action recovery | `agent/ActionManager.kt`, `skills/Navigation.kt` | Measure useful progress, bound retries, remember failed coordinates temporarily, and cancel actions without routine bot-process restarts. |
| Optional decisions | `decision/Decision.kt`, `DecisionClient.kt`, `DecisionService.kt`, `config/DecisionConfig.kt` | Add a typed yes/no, choice, and score interface with confidence thresholds, timeouts, budget accounting, and a normal execution path when disabled or uncertain. The source explicitly names TypeSafe System One. |
| Model routing | `agent/ModelRouter.kt`, `config/ModelSelectionConfig.kt` | Separate per-role endpoints from optional per-directive model selection; they solve different configuration needs. |
| Prompt construction | `agent/Prompter.kt`, `BrainPrompter.kt`, `PromptFiles.kt` | Keep static instructions stable, put current world state at the end, preserve user overrides, and refresh untouched defaults safely. |
| Narration | `agent/TaskLoop.kt`, `Agent.deliverLine`, `RpAgent.kt`, `DecisionService.worthSaying` | Adapt rather than copy: native-call content is not forwarded to chat by that Task loop, and its social filters intentionally suppress routine narration. CE must follow the user's narration policy. |
| Durable state | `persistence/BotStorage.kt`, `agent/MemoryBank.kt`, `GoalManager.kt` | Persist versioned useful state. Extend the reference with atomic writes and server/world/dimension scoping; it does not serialize every in-flight directive. |
| Verification | `BrainTest.kt`, `TaskLoopTest.kt`, `DecisionServiceTest.kt`, `NetProgressGuardTest.kt`, `bench/`, `MANUAL_VERIFICATION.md` | Separate model/controller tests, recorded replay, and server-observed gameplay. Use the detailed verification entries over broad README or TODO claims. |

Unleashed uses the real Minecraft client and Baritone. Its navigation calls, tool-speed data,
integrated-server access, coroutine cancellation, and game-thread operations cannot be copied
directly into Mineflayer. Port the contracts and policies, then implement them against CE's APIs.
In particular, abandoning an unresolved coroutine after a grace period is not a safe substitute
for revoking an old JavaScript action's control of the bot.

## Implementation order

### 0. Establish repeatable observations

Before changing gameplay code, capture focused failure cases and outcomes using the local
server and a reproducible fixture or isolated test world. Preserve the user's current world.
Record tool call IDs, selected role/model, action ownership, target coordinates, durations,
dig estimates, interruption reasons, and server-observed block/inventory changes.

Adapt the small host interfaces used by Unleashed's Brain/Task tests so CE's controller can be
tested without Minecraft or paid inference. Add a replayable provider seam for reproducing
conversation and tool sequences. Keep integration tests separate from gameplay verification.

Done when the wood, iron, obsidian, cancellation, and narration scenarios below have a clear
reproduction procedure and measurable pass conditions. Existing failures are recorded as failures.

### 1. Fix mining and action ownership first

CE targets: `src/agent/library/skills.js`, `src/agent/modes.js`,
`src/agent/action_manager.js`, `src/agent/agent.js`, and dependency patches in `patches/`.

- Fix the reproduced material/tool-speed lookup defect. In the installed 1.21.11 data, an
  unenchanted diamond pickaxe calculates obsidian as 75 seconds; the corrected mining
  material calculates 9.4 seconds. CE's obsidian unstuck threshold is currently 40 seconds.
  Iron ore and deepslate iron ore also receive incorrect speeds. Preserve tool-tier harvest
  restrictions, enchantment effects, and penalties for water or being airborne.
- Replace displacement-only stuck decisions with action-aware progress. Healthy stationary
  digging is progress; circling or repeatedly revisiting the same failed approach is not.
  Use dig duration plus slack, path progress, confirmed target changes, and actual acquisition.
- Revalidate the target, visible face, reach, held tool, and stable position before a dig.
  Reposition on a geometry failure rather than blindly retrying identical coordinates.
- Bound attempts per target and remember failures with expiry and invalidation when world
  state changes. Distinguish a temporary avoidance from permanently abandoning a resource.
- Track target blocks broken separately from target drops acquired. Collateral stone, a
  resolved plugin promise, or a speculative local air update does not prove requested success.
  Report partial progress and remaining requirements accurately, including Fortune/Silk Touch.
- Give actions ownership tokens and cancellation paths. Stop/reset/replacement invalidates
  old work, cancels dig/path/collection operations, and settles pending promises. Cleanup from
  a previous action must not stop or resume a newer one. Bound recovery and report blockers;
  reconnect only when the connection or runtime genuinely cannot be recovered.
- Introduce typed internal outcomes while retaining readable tool results and existing text
  command compatibility. Keep action progress available to narration and supervision.

Done when repeated wood, exposed/overhead iron, and obsidian collections complete or return a
specific blocker without the current stuck/reconnect loop, and stopping mining leaves the bot
connected with no old action resuming. Verify actual server state and requested drops in game.

### 2. Make native tools the normal interface and finish narration/prompts

CE targets: `settings.js`, profile inheritance in `src/models/prompter.js`,
`src/models/_tool_request.js`, `src/agent/agents/task.js`, prompt templates,
`src/mindcraft/public/settings_spec.json`, and the existing UI/configuration documentation.

- Set the global native-tool default ON once the relevant compatibility checks pass. Retain
  explicit per-profile/global legacy opt-outs and direct player-entered commands.
  Detect unsupported native providers clearly; never silently execute model prose as tools.
- Preserve assistant content accompanying native calls. Extract user-facing structured text
  where necessary, keep provider-specific signed content and call IDs intact, and avoid
  silently losing text because a response also contains tools.
- Add a per-profile narration policy with global defaults: `all`, `periodic`, or `none`.
  Proposed periodic controls are `tool_narration_every` and
  `tool_narration_max_silence_seconds`. Both apply only to `periodic`.
- Count completed tool calls, not ticks or HTTP requests. Periodic updates trigger after N
  calls OR T seconds of silence during active work. Reset cadence on visible task updates.
  Long operations publish real progress rather than waiting for another model turn.
- Reuse model narration when available; provide a concise factual fallback when required.
  Normal replies, questions, failures, and completion reports remain visible in all modes.
  Prevent duplicate updates for responses containing several tools, and remove timers on stop.
- Align instructions with the policy. RP or optional decision filters cannot veto required
  updates. Preserve factual meaning and never claim completion before verifying outcomes.
- Consolidate template composition and custom overrides. XML can remain an internal format;
  replace or deprecate the confusing boolean with an explicit format choice only if the
  compatibility requirements justify exposing one. Separate static rules, task briefing,
  and refreshed state; omit documentation for unavailable tools.

Done when the effective mode is visible, the normal sample profile uses native calls, mixed
content/tool responses remain visible, and all narration modes pass timing and gameplay checks.

### 3. Complete Brain/Task/RP orchestration and durable state

CE targets: `src/agent/agents/{system,brain,task,rp}.js`, role prompts,
`src/agent/goals/goals.js`, `src/agent/history.js`, and state persistence.

- Define directives with IDs/generations, objective, briefing, constraints, tool grants,
  source player, and selected task model. Keep active and ended states distinct.
- Give the Brain native supervision tools for directing work, injecting context, stopping,
  speaking, and managing goals. Give the Task explicit `taskDone`/`taskBlocked` handoffs.
  Validate structured replies and retain compatibility with existing profiles during migration.
- Wake supervision for player input, relevant world events, task handoffs, errors, and genuine
  stalls. Coalesce bursts, reject stale responses, back off when nothing changes, and make no
  routine model calls when idle without active work. Prevent repeated no-progress re-tasking.
- Turn near-identical corrections during healthy work into context updates. Explicit user
  replacement/stop still takes effect promptly. Death recovery owns one coherent directive.
- Verify countable goals against world/inventory evidence. Keep completion reports singular
  and route uncertainty or blockers back to planning rather than claiming success.
- Allow optional Brain/Task/RP endpoint overrides with the current model as fallback; code and
  vision models retain their existing contracts. RP is optional and cannot gate action progress.
- Persist goals, checklists, useful outcomes, memory/locations, and player notes in a versioned
  format with atomic writes and migration. Scope spatial facts to server/world/dimension.
  On restart, reassess saved objectives against fresh state instead of replaying stale actions.
- Share one policy layer for tool availability, coding flags, and blocked actions. If a
  `requestTools` mechanism is added, it must never bypass those underlying restrictions.

Done when a multi-stage resource goal continues after subtasks, tolerates corrections and
provider failures, survives a restart without duplicate work, and stays quiet and idle after
completion. Keep the single-agent native mode as a supported, tested configuration.

### 4. Add optional typed decisions, model selection, and usage controls

- Add an independent decision service for chat addressing/intent and done/blocked/continue
  checks. Use a provider-neutral yes/no, choice, and score contract with validated ranges,
  timeouts, confidence thresholds, diagnostics, and ordinary Brain/Task behavior on uncertainty.
- Treat source endpoint adapters as reference implementations, not proof that every provider
  or model currently supports them. Verify each enabled provider's contract during implementation.
  A decision service must never become a prerequisite for running the bot.
- Apply deterministic explicit-stop and objective checks before optional classification.
  Subjective goal checks use evidence, retain uncertainty, and cannot override contradictory
  world state or user instructions. Decisions never run once per game tick.
- Add optional task-model selection per directive using an explicitly configured roster and
  capabilities. Validate unknown model IDs and retain selected endpoints for consistent turns.
- Measure calls, tokens, latency, available cache usage, and cost when the provider supplies
  it or pricing is configured. Count Brain, Task, RP, summaries, and decisions in one budget.
  Do not guess unknown prices or substitute arbitrary confidence for a typed decision endpoint.
- Pace repeated checks, cap no-progress planning, and surface effective role/model/budget state
  through existing MindServer diagnostics and controls.

Done when decisions improve a repeatable scenario or reduce unnecessary calls, every failure
falls back correctly, configured progress remains visible, and model/usage controls work without
requiring a particular external service. No performance claims based solely on Unleashed's runs.

## Verification throughout the work

Focused controller/provider tests cover native tool round trips, mixed content, call ordering,
strict provider contracts, cancellation races, stale responses, handoffs, idle/backoff rules,
decision uncertainty, periodic timers, and state migration. Use fake time
and recorded replies where appropriate; make no paid calls in the default test suite.

Game-facing changes also require repeatable server-observed checks. The initial scenario set:

1. Gather a requested number of logs, including overhead targets; account for real drops.
2. Mine exposed and awkward iron veins; recover or explain why a target is skipped.
3. Mine several obsidian blocks with the correct pick, then repeat with enchantments and
   relevant environmental penalties; distinguish client prediction from server confirmation.
4. Stop, correct, and replace a task during pathing/digging; remain connected and responsive.
5. Acquire iron tools from basic materials, with progress reports and verified final inventory.
6. Finish a Brain-directed task and remain idle without periodic inference or duplicate reports.
7. Exercise every narration mode, including mixed text/tool responses, batched tools, and one
   long action; ensure cancellation leaves no delayed narration.
8. Restart with saved goals and memory; resume only work still required by the current world.
9. Disable decisions, simulate outages, and use the legacy profile opt-out; core
   gameplay and existing develop integrations continue functioning.

Record setup, observations, outcomes, and unresolved cases. A passing mocked loop does not
establish mining reliability, and a successful Unleashed benchmark is not a CE gameplay result.

## Deferred source features

ACP/subscription integration remains a later project. Voice mods, HeadlessMc packaging,
Baritone/client-mod migration, arbitrary mod research, and GraalJS hosting are also deferred.
Their presence in the supplied source does not expand the current CE work automatically.
RAG and indexed knowledge retrieval are explicitly excluded by the user (2026-11-01).
The Discord description of Instinct/Deepthink is design context; implement the verified
optional decision-service and supervisory-Brain behavior, without inventing another layer.
