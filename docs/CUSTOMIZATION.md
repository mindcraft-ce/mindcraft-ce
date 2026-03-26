# Server Customization System

Mindcraft CE supports server-specific customizations through a plugin-like system. Customizations can override chat handling, add commands, inject prompt variables, and more — without modifying core files.

## Quick Start

1. Create a directory for your server (e.g. `./my_server/`)
2. Create `index.js` that exports a class extending `ServerCustomization`
3. Set `"customization": "./my_server"` in `settings.js`
4. Restart the bot

Active customizations are listed in cyan at startup.

## Creating a Customization

```javascript
// my_server/index.js
import { ServerCustomization } from '../src/customization/base.js';

export default class MyServer extends ServerCustomization {
    constructor(settings) {
        super(settings);
        this.name = 'my_server';
    }

    // Add a custom chat pattern for your server's chat format
    onBotCreated(bot, settings) {
        bot.once('login', () => {
            bot.addChatPattern('chat',
                /^(?:\([^\)]{1,20}\)\s*)?(\w+):\s*(.+)$/,
                { deprecated: true }
            );
        });
    }

    // Initialize custom components
    onAgentInit(agent) {
        console.log(`[${this.name}] Agent initialized`);
    }

    // Add custom commands
    getExtraCommands(runAsAction) {
        return [
            {
                name: '!myCommand',
                description: 'Does something cool.',
                params: { 'arg': { type: 'string', description: 'An argument.' } },
                perform: async function(agent, arg) {
                    return `Did something with ${arg}`;
                }
            }
        ];
    }
}
```

## Available Hooks

| Hook | When Called | Purpose |
|------|-----------|---------|
| `getBotOptions()` | Before `createBot()` | Add options like `onMsaCode` for auth UX |
| `onBotCreated(bot, settings)` | After `createBot()` | Patch protocol handlers, chat patterns |
| `onAgentInit(agent)` | During `agent.start()` | Add custom components to the agent |
| `shouldIgnoreMessage(username, settings)` | On each chat message | Filter bot's own messages by nickname |
| `routeChat(bot, msg, settings, sendFn, name)` | Before sending chat | Custom chat routing (staff chat, etc.) |
| `isEchoBack(message, recentBotMessages)` | On each chat message | Detect echo-backs of bot's own whispers |
| `getExtraCommands(runAsAction)` | At startup | Register additional bot commands |
| `expandPromptVars(prompt, agent)` | During prompt building | Inject custom $VARIABLES into prompts |

## Default Behavior

If no customization is configured (`"customization": ""`), all hooks use no-op defaults:
- No custom chat patterns (uses mineflayer's built-in parsing)
- No nickname filtering
- No staff chat routing
- No extra commands
- No custom prompt variables

Everything works out of the box for vanilla and most modded servers.

## Example Use Cases

A customization can handle any server-specific behavior, such as:

- Custom chat patterns for servers with rank prefixes (e.g. `(Admin) Username: message`)
- Resource pack auto-accept at Configuration phase (MC 1.20.3+)
- Microsoft auth device code UX (auto-open browser + clipboard)
- Staff chat routing via custom server commands
- Persistent task/quest tracking with custom `$VARIABLES` in prompts
- NPC interaction commands for quest plugins (e.g. Citizens, BetonQuest)
- Bot nickname filtering to prevent self-reply loops
- Echo-back detection for whisper reflections

## File Structure

```
mindcraft-ce/
  src/customization/
    base.js         # ServerCustomization base class (all hooks defined here)
    loader.js       # Auto-loads customization from settings.js
  my_server/        # Your server customization (create this)
    index.js        # Main class extending ServerCustomization
    commands.js     # Custom commands
    skills.js       # Custom skills
  settings.js       # Set "customization": "./my_server" to activate
```
