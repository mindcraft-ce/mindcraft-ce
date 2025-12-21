import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class GoToPlayerTool extends BaseTool {
    constructor() {
        super(
            "goToPlayer",
            "Go to the given player.",
            [
                new CommandProperty("player_name", "The name of the player to go to.", "string", true),
                new CommandProperty("closeness", "How close to get to the player.", "number", true)
            ]
        );
    }

    async execute(agent, player_name, closeness) {
        console.log(`Executing GoToPlayerTool: player_name=${player_name}, closeness=${closeness}`);
        const actionFn = async () => {
            await skills.goToPlayer(agent.bot, player_name, closeness);
        };
        const code_return = await agent.actions.runAction('action:goToPlayer', actionFn);
        return code_return.message;
    }
}

export default GoToPlayerTool;
