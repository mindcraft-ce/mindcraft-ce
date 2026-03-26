/**
 * ServerCustomization — Base class for server-specific customizations.
 *
 * Extend this class to add custom behavior for your Minecraft server.
 * The core mindcraft code calls these hooks at specific points in the lifecycle.
 * Default implementations are no-ops so everything works out of the box.
 *
 * To create a customization:
 *   1. Create a directory (e.g. ./my_server/)
 *   2. Create index.js that exports a class extending ServerCustomization
 *   3. Set "customization": "./my_server" in settings.js
 *
 * Example:
 *   import { ServerCustomization } from '../src/customization/base.js';
 *   export default class MyServer extends ServerCustomization {
 *       onBotCreated(bot, settings) {
 *           // Add custom chat patterns, resource pack handlers, etc.
 *       }
 *   }
 */
export class ServerCustomization {
    constructor(settings) {
        this.settings = settings;
        this.name = 'default';
    }

    // ==================== BOT LIFECYCLE HOOKS ====================

    /**
     * Called after mineflayer createBot() but before login.
     * Use this to add custom protocol handlers, chat patterns, etc.
     * @param {Object} bot — mineflayer bot instance
     * @param {Object} settings — the full settings object
     */
    onBotCreated(bot, settings) {}

    /**
     * Called during agent.start() after core components are initialized.
     * Use this to add custom components to the agent (task list, extra memory, etc.)
     * @param {Object} agent — the mindcraft Agent instance
     */
    onAgentInit(agent) {}

    // ==================== CHAT HOOKS ====================

    /**
     * Returns options to pass to mineflayer's createBot for auth handling.
     * Override to customize the Microsoft auth device code flow (e.g. auto-open browser).
     * @returns {Object} — options to merge into createBot options (e.g. { onMsaCode: fn })
     */
    getBotOptions() {
        return {};
    }

    /**
     * Determine if a message should be ignored based on the sender's username.
     * Use this to filter out the bot's own messages when the server uses nicknames.
     * @param {string} username — the username extracted from chat
     * @param {Object} settings — the full settings object
     * @returns {boolean} — true to ignore the message, false to process it
     */
    shouldIgnoreMessage(username, settings) {
        const nicknames = (settings.bot_nicknames || []).map(n => n.toLowerCase());
        const uname = username.toLowerCase();
        return nicknames.some(nick =>
            uname === nick || uname.startsWith(nick) || nick.startsWith(uname)
        );
    }

    /**
     * Custom chat routing before the default whisper/public logic.
     * Return true if the message was handled (e.g. sent via staff chat), false to fall through.
     * @param {Object} bot — mineflayer bot instance
     * @param {string} message — the message to send
     * @param {Object} settings — the full settings object
     * @param {Function} sendOutputToServer — function to send output to the mindserver UI
     * @param {string} agentName — the agent's name
     * @returns {boolean} — true if handled, false to use default routing
     */
    routeChat(bot, message, settings, sendOutputToServer, agentName) {
        return false;
    }

    /**
     * Check if a received message is an echo of the bot's own output.
     * Some servers echo whispers back in a format that looks like another player sent it.
     * @param {string} message — the incoming message content
     * @param {string[]} recentBotMessages — array of recent messages the bot sent
     * @returns {boolean} — true to ignore as echo, false to process
     */
    isEchoBack(message, recentBotMessages) {
        // Default: check for whisper fragment indicators
        if (message.includes('me]') || message.includes('-> me')) {
            return true;
        }
        if (recentBotMessages && recentBotMessages.some(m =>
            message.includes(m) || m.includes(message)
        )) {
            return true;
        }
        return false;
    }

    // ==================== COMMAND HOOKS ====================

    /**
     * Return an array of additional command objects to register.
     * Each command follows the same format as entries in actionsList.
     * @param {Function} runAsAction — the runAsAction wrapper from actions.js
     * @returns {Array} — array of command objects to append to actionsList
     */
    getExtraCommands(runAsAction) {
        return [];
    }

    // ==================== PROMPT HOOKS ====================

    /**
     * Expand custom prompt variables (e.g. $TASKS, $PLACES).
     * Called during prompt building. Modify and return the prompt string.
     * @param {string} prompt — the current prompt string
     * @param {Object} agent — the mindcraft Agent instance
     * @returns {string} — the modified prompt string
     */
    expandPromptVars(prompt, agent) {
        return prompt;
    }
}
