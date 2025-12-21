import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class AttackPlayerTool extends BaseTool {
    constructor() {
        super(
            "attackPlayer",
            "Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.",
            [
                new CommandProperty("player_name", "The name of the player to attack.", "string", true)
            ]
        );
    }

    async execute(agent, player_name) {
        const actionFn = async () => {
            let player = agent.bot.players[player_name]?.entity;
            if (!player) {
                skills.log(agent.bot, `Could not find player ${player_name}.`);
                return false;
            }
            await skills.attackEntity(agent.bot, player, true);
        };
        const code_return = await agent.actions.runAction('action:attackPlayer', actionFn);
        return code_return.message;
    }
}

export default AttackPlayerTool;
