# Core Improvements

These changes improve stability, usability, and extensibility for all servers.

## Stability

### Auto-Reconnect on Disconnect/Kick
**Files:** `src/agent/agent.js`

The bot no longer kills itself on disconnect or kick. Instead:
- Disconnect: waits 30 seconds, then restarts (up to 3 attempts)
- Kick: waits 60 seconds (longer to avoid anti-spam re-bans), then restarts
- After max attempts, exits cleanly (code 0) so the parent doesn't restart endlessly

### Graceful Code Timeout
**Files:** `src/agent/action_manager.js`

When AI-generated code runs too long (>10 seconds), the bot force-clears the execution state instead of killing the entire process. The bot recovers and continues.

### Safe Shutdown
**Files:** `src/agent/agent.js`

`cleanKill()` now guards `bot.chat()` with a try-catch, preventing crashes when the bot is already disconnected.

### Self-Prompter Resilient Retry
**Files:** `src/agent/self_prompter.js`

Instead of stopping permanently after 3 failed prompts, the self-prompter:
- Pauses for 30 seconds after every 3 failures
- Only fully stops after 10 consecutive failures
- Logs failure counts clearly

## Chat & Messages

### Message Dedup Guard
**Files:** `src/agent/agent.js`

Tracks the last message signature (username + text + timestamp). Skips duplicates received within 500ms. Prevents double-processing when multiple chat events fire for the same message.

### Chat Rate Limiter
**Files:** `src/agent/agent.js`

Hard limit of 2 messages per 10 seconds in `openChat()`. Messages exceeding the limit are logged but not sent. Prevents anti-spam plugin bans (e.g. GriefPrevention).

### Message Chunking
**Files:** `src/agent/agent.js`

Long messages are split at word boundaries into 240-character chunks (Minecraft's limit is 256). 500ms delay between chunks to avoid spam filters.

### Name-Mention Filter for Public Chat
**Files:** `src/agent/agent.js`

The bot only responds to public chat if its name is mentioned. Whispers always go through. Prevents the bot from reacting to every message in chat.

### Action Output to Log Only
**Files:** `src/agent/agent.js`

Command execution results (e.g. "Placed stone_bricks at x, y, z") are logged to console but not sent to in-game chat. Dramatically reduces chat spam.

## Code Generation

### Import/Export Sanitizer
**Files:** `src/agent/coder.js`

AI models sometimes generate ES module syntax (`import`/`export`) that can't run in the sandboxed eval compartment. `_sanitizeCode()` now strips these before execution.

## Location Memory

### Persistent Memory Bank
**Files:** `src/agent/memory_bank.js`

The `MemoryBank` class now:
- Saves to `bots/{name}/places.json` on disk
- Persists across restarts
- Supports type tags (chest, furnace, base, build, poi)
- Provides `getSummary()` for prompt injection
- Supports `forgetPlace()` for removal

### Auto-Save Notable Blocks
**Files:** `src/agent/agent.js`

When the bot places chests, furnaces, beds, crafting tables, or other notable blocks, their locations are automatically saved to the memory bank.

### $PLACES Prompt Variable
**Files:** `src/models/prompter.js`

All saved locations are injected into every prompt via `$PLACES`, so the bot always knows where its stuff is without having to ask.

### !forgetPlace Command
**Files:** `src/agent/commands/actions.js`

New command to remove a saved location by name.

### !rememberHere Type Tags
**Files:** `src/agent/commands/actions.js`

`!rememberHere` now accepts an optional type parameter: `!rememberHere("main chest", "chest")`

## AI Model

### Google Search Grounding for Gemini
**Files:** `src/models/gemini.js`

When `google_search: true` is set in the profile params, Gemini can search the web during conversations. Useful for looking up build designs, game mechanics, etc.

## Profiles

### Builder Profile
**Files:** `profiles/defaults/builder.json`, `src/models/prompter.js`

New base profile optimized for building:
- `cheat: true` (for creative mode)
- No item collecting, self-defense, or survival mechanics
- Added to the prompter's profile resolution chain with fallback support

### Dynamic Profile Resolution
**Files:** `src/models/prompter.js`

If `base_profile` doesn't match a known name, the prompter tries loading from `profiles/defaults/{name}.json` directly. Falls back to `assistant` with a warning if not found.

## Web UI

### Dropdown Selects
**Files:** `src/mindcraft/public/index.html`, `src/mindcraft/public/settings_spec.json`

Settings with predefined `options` in `settings_spec.json` now render as `<select>` dropdowns instead of text inputs.

## Logging

### Console Log to File
**Files:** `main.js`

All console output (log, warn, error) is mirrored to `logs/latest.log`. Previous logs are archived as `logs/session_{timestamp}.log` on startup. Uncaught exceptions are captured.

## Customization System

### Server Customization Framework
**Files:** `src/customization/base.js`, `src/customization/loader.js`

A plugin-like system for server-specific behavior. See `docs/CUSTOMIZATION.md` for full documentation.
