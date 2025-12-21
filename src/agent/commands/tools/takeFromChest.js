import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class TakeFromChestTool extends BaseTool {
    constructor() {
        super(
            "takeFromChest",
            "Take the given items from the nearest chest.",
            [
                new CommandProperty("item_name", "The name of the item to take.", "string", true),
                new CommandProperty("num", "The number of items to take.", "integer", true)
            ]
        );
    }

    async execute(agent, item_name, num) {
        const actionFn = async () => {
            await skills.takeFromChest(agent.bot, item_name, num);
        };
        const code_return = await agent.actions.runAction('action:takeFromChest', actionFn);
        return code_return.message;
    }
}

export default TakeFromChestTool;
