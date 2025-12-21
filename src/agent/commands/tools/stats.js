import BaseTool from "../base_tool.js";
import * as world from "../../library/world.js";
import convoManager from "../../conversation.js";

class StatsTool extends BaseTool {
    constructor() {
        super(
            "stats",
            "Get your bot's location, health, hunger, and time of day.",
            [],
            false
        );
    }

    async execute(agent) {
        let bot = agent.bot;
        let res = 'STATS';
        let pos = bot.entity.position;
        // display position to 2 decimal places
        res += `\n- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`;
        // Gameplay
        res += `\n- Gamemode: ${bot.game.gameMode}`;
        res += `\n- Health: ${Math.round(bot.health)} / 20`;
        res += `\n- Hunger: ${Math.round(bot.food)} / 20`;
        res += `\n- Biome: ${world.getBiomeName(bot)}`;
        let weather = "Clear";
        if (bot.rainState > 0)
            weather = "Rain";
        if (bot.thunderState > 0)
            weather = "Thunderstorm";
        res += `\n- Weather: ${weather}`;
        
        if (bot.time.timeOfDay < 6000) {
            res += '\n- Time: Morning';
        } else if (bot.time.timeOfDay < 12000) {
            res += '\n- Time: Afternoon';
        } else {
            res += '\n- Time: Night';
        }

        // get the bot's current action
        let action = agent.actions.currentActionLabel;
        if (agent.isIdle())
            action = 'Idle';
        res += `\n- Current Action: ${action}`; // Fixed escape char

        let players = world.getNearbyPlayerNames(bot);
        let bots = convoManager.getInGameAgents().filter(b => b !== agent.name);
        players = players.filter(p => !bots.includes(p));

        res += '\n- Nearby Human Players: ' + (players.length > 0 ? players.join(', ') : 'None.');
        res += '\n- Nearby Bot Players: ' + (bots.length > 0 ? bots.join(', ') : 'None.');

        res += '\n' + agent.bot.modes.getMiniDocs() + '\n';
        return '\n' + res + '\n';
    }
}

export default StatsTool;
