import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class DiscardTool extends BaseTool {
    constructor() {
        super(
            "discard",
            "Discard the given item from the inventory.",
            [
                new CommandProperty("item_name", "The name of the item to discard.", "string", true),
                new CommandProperty("num", "The number of items to discard.", "integer", true)
            ]
        );
    }

    async execute(agent, item_name, num) {
        const actionFn = async () => {
            const start_loc = agent.bot.entity.position;
            await skills.moveAway(agent.bot, 5);
            await skills.discard(agent.bot, item_name, num);
            await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
        };
        const code_return = await agent.actions.runAction('action:discard', actionFn);
        return code_return.message;
    }
}

export default DiscardTool;
