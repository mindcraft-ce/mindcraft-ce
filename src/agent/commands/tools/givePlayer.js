import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class GivePlayerTool extends BaseTool {
    constructor() {
        super(
            "givePlayer",
            "Give the specified item to the given player.",
            [
                new CommandProperty("player_name", "The name of the player to give the item to.", "string", true),
                new CommandProperty("item_name", "The name of the item to give.", "string", true),
                new CommandProperty("num", "The number of items to give.", "integer", true)
            ]
        );
    }

    async execute(agent, player_name, item_name, num) {
        const actionFn = async () => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        };
        const code_return = await agent.actions.runAction('action:givePlayer', actionFn);
        return code_return.message;
    }
}

export default GivePlayerTool;
