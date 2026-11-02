# Agent system

This branch integrates the earlier agent-system work with current `develop`.
Native function calling defaults to **on**. Brain/Task/RP, decision endpoints and
per-task model selection remain optional. Existing text commands, profiles,
vision, embeddings, Docker and MindServer remain available. ACP is deferred;
the experimental retrieval-augmented memory code has been removed.

## Native tools and prompts

Global settings are in `settings.js`; individual profile values override them.
Set `use_function_calling: false` explicitly for the legacy text-command agent.
Player-entered `!commands(...)` work in either mode.

Native requests support OpenAI-compatible chat-completion clients, Claude,
Gemini, Ollama/Cloud, Andy and Hugging Face chat completion. The model must
support tools. Unsupported providers, empty/truncated replies and invalid
arguments fail explicitly. Model prose is never executed as a native call.
Signed Claude/Gemini content and tool-call IDs survive subsequent turns.

Tools use the existing command registry and implementations. Types, required
arguments, numeric ranges, block/item names, blocked actions and coding flags
are checked before execution. Outcomes distinguish success, partial progress,
failure, blockers and cancellation; readable results remain in bot history.
Text, summary, code, vision and embedding interfaces retain their contracts.

Native mode uses `profiles/defaults/tools/*.xml`. With legacy commands,
`prompt_format: "xml"` selects `profiles/defaults/commands/*.xml`; `"auto"`
retains JSON prompts. The old `use_xml_prompts` flag still works. Explicit
profile prompts win over templates. Fresh world state ends each native request
rather than being baked into static rules.

## Narration

```json
{
  "tool_narration": "periodic",
  "tool_narration_every": 3,
  "tool_narration_max_silence_seconds": 30
}
```

`all` narrates each tool, using accompanying assistant content when available and
a factual fallback otherwise. `periodic` updates after N completed calls **or**
T seconds of silence during an active call. Long actions can report actual
mining progress without waiting for another model response. Both cadence
settings apply **only** to `periodic`. `none` suppresses routine tool chatter.
Answers, questions, important blockers and completion remain visible. Recoverable
failures do not announce every retry; repeated failures are explained once in
plain language. Internal action output stays in logs/history. Periodic narration
prefers useful accompanying model text and otherwise describes the action in
ordinary language, without tool names, mode names, coordinates or pathfinding logs.
Cancellation removes timers and pending narration. RP/decision filters cannot
suppress required progress messages.

The single-agent native loop remains busy while waiting for responses and between
tool calls, so idle automatic behavior does not compete with the model's next
action. Once work finishes, automatic behavior resumes. Placing a matching block
that is already present succeeds without using another item or retrying it.

## Brain, Task and RP

```json
{
  "use_brain_agent": true,
  "use_rp_agent": true,
  "brain_check_in_seconds": 60
}
```

Brain requires native tools. It manages goals and calls `directTask`,
`injectNote`, `stopTask`, `say` and `wait`. Goal bookkeeping continues to a
handoff or reply. Task executes tools and returns with `taskDone`/`taskBlocked`.
Directives carry IDs, objectives, briefings, constraints, source players, tool
grants and model IDs. `requestTools` only expands grants within normal permissions.

Similar corrections become context for healthy work. Explicit replacement
cancels the old action/request before starting another. Plain `stop` (optionally
addressed to the bot by name) cancels without inference. Stale model replies and
cancelled action continuations cannot start work. Repeated unchanged tasks are
bounded. Completion wakes Brain once; timed checks run only with an active
directive. `brain_check_in_seconds: 0` disables timed checks.

Inventory goals are checked against actual held items. A failed check prevents
the rest of its completion announcement batch. RP can rewrite Brain replies but
is optional (`use_rp_agent: false`); narration bypasses it. This is supervisory
Brain plus a separate optional decision service. The Discord Instinct/Deepthink
description is design context, not an additional implemented layer.

`agent_max_steps` (50), `agent_max_tool_calls` (80) and
`max_tool_calls_per_response` (12) bound loops/batches.
`request_timeout_seconds` (120) bounds native requests. Stopping aborts supported
provider requests and ignores late replies; consumed usage is not refunded.

Versioned goals, checklists, RP notes, locations and directive snapshots are
saved atomically in `bots/<name>/memory.json`. Enable `load_memory` to restore.
Existing history files remain readable; corrupt files are preserved separately
and startup continues. Locations and active objectives require the same
server/world/dimension scope. Restored objectives are reassessed against fresh
state. Set `world_id` when a server hides its seed or you need explicit world
identity. Generated augment registrations remain session-local.

## Role models and task selection

`brain_model`, `task_model` and `rp_model` accept the same string/object model
configuration as `model`; each falls back to it. `code_model` and `vision_model`
still work. To let Brain choose a Task endpoint:

```json
{
  "brain_model": "ollama/planner",
  "task_model": "ollama/worker",
  "rp_model": "ollama/social",
  "model_selection": {
    "enabled": true,
    "default_task_model": "worker",
    "models": [
      {"id": "worker", "model": "ollama/worker", "notes": "Routine gathering", "scores": {"mining": 8}},
      {"id": "planner", "model": "ollama/planner", "notes": "Complex tasks"}
    ]
  }
}
```

These are placeholder names; configure installed/available models. Only enabled
roster IDs can be selected. Entries require unique IDs and configured models.
Notes/scores are user hints, not benchmark guarantees. One endpoint is retained
for each directive.

## Optional decisions and usage

`decisions.enabled` defaults to false and makes no calls when disabled.
Providers `typesafe`, `openrouter` and `openai` use typed predicate, choice and
score contracts. Applications are chat addressing/intent, done/blocked/continue
checks and evidence-based subjective goal checks, independent of Task routing.

```json
{
  "decisions": {
    "enabled": true,
    "provider": "openrouter",
    "timeout_ms": 4000,
    "min_confidence": 0.6,
    "min_probability": 0.85,
    "chat_triage": true,
    "task_status": true,
    "goal_check": true
  }
}
```

Keys come from `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` or `OPENAI_API_KEY` in
`keys.json`/environment. Optional `model`, `url`, `api_key: "env:MY_KEY"` and
`pricing` override defaults. Uncertainty, refusals, malformed answers, missing
keys, timeouts and outages fall back to ordinary Brain/Task behavior. Explicit
stops bypass decisions. Decisions cannot override inventory checks. Confirm
account/model endpoint access; adapter tests do not establish access. Wire
references: [TypeSafe OpenAPI](https://api.typesafe.ai/openapi.json) and
[OpenAI Decisions](https://developers.openai.com/api/reference/resources/decisions/methods/create).

`usage_budget` accepts optional `usd_per_session`, `usd_per_day` and
`tokens_per_hour`; `null` disables a limit. Instrumented Brain, Task, RP,
summaries, code/vision requests and decisions share the meter. Daily/hourly
windows persist in `bots/<name>/usage.json`; session totals reset. Calls, tokens,
cached input, latency and available costs are exposed through MindServer.
Provider errors may omit usage. Unknown prices stay unknown.

`model_pricing` supplies `input_per_million`, `output_per_million` and optional
`cached_input_per_million` in USD for default role models. Roster entries and
decisions accept their own `pricing`. Use accurate rates for configured models.
With a USD cap, an unpriced response blocks subsequent inference rather than
pretending it was free. Limits are checked before requests; a completed or
concurrently in-flight request can cross a cap. They are not a billing guarantee.
Prefer token limits when reliable cost data is unavailable.

Missing token counts also pause further requests when a token cap is enabled.
Unknown daily costs remain flagged across restarts; restarting does not turn
unpriced usage into zero-cost usage.

MindServer's **Agent status** panel shows effective modes, objective, role models,
goals, usage and decision diagnostics. Settings exposes the corresponding
controls; restart to apply changes.

## Mining and recovery

The prismarine-block patch corrects modern tool-speed material lookup, retaining
harvest restrictions and enchantment/environment effects. Mineflayer waits for
server updates instead of predicting air. Collection revalidates targets/tools,
retries coordinates boundedly, approaches buried ore and counts requested breaks
separately from drops. Failed coordinates expire after 30 seconds or a changed
block state.

Unstuck measures useful travel and expected dig time, allowing healthy stationary
obsidian mining. Recovery/cancellation settle actions without routine restarts.
Ownership prevents late work from controlling replacement actions. See
[dependency patches](../patches/README.md).

## Code and existing knowledge tools

`allow_insecure_coding` remains false. `newAction`, `executeCode`, `generateAugment`
and generated augments require it. Generated code has host access; names are
validated and registrations are bot-scoped. `searchSkills` retains the skill
library; `searchWiki` retains develop's wiki lookup. No LanceDB memory tables or
`searchMemory` tool are required.

## Verification

```sh
npm test
node tests/live/mining_scenarios.js
node tests/live/agent_scenarios.js
node tests/live/narration_scenarios.js
# Uses the model configured in andy.json and consumes its allowance:
node tests/live/agent_scenarios.js --live-model
```

Use Node 22.13+ (tested: 22.23.3). Default tests use local stubs and no paid
inference; discovery tests need loopback permission. Live tests need Java 21 and
a Minecraft Java 1.21.11 jar at `server_data/local-test/server.jar`, or set
`MC_TEST_SERVER_JAR`/`MC_TEST_JAVA`. Separate ignored worlds use 55918 and
MindServer 8083, preserving the existing local world. Keep test ports free.

The replay provider accepts JSON/JSONL `{role,text,calls}` records for controller
regressions; optional per-record `delay_ms` reproduces inference gaps and supports
cancellation. The narration scenario uses the default single-agent loop, automatic
torch behavior, real placements and chat output. Run fixtures sequentially when
they share test ports. Gameplay checks use real server state/inventory. See
[verification notes](agent-system-verification.md) and [design provenance](agent-system-roadmap.md).
