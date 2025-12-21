import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class PutInChestTool extends BaseTool {
    constructor() {
        super(
            "putInChest",
            "Put the given item in the nearest chest.",
            [
                new CommandProperty("item_name", "The name of the item to put in the chest.", "string", true),
                new CommandProperty("num", "The number of items to put in the chest.", "integer", true)
            ]
        );
    }

    async execute(agent, item_name, num) {
        const actionFn = async () => {
            await skills.putInChest(agent.bot, item_name, num);
        };
        const code_return = await agent.actions.runAction('action:putInChest', actionFn);
        return code_return.message;
    }
}

export default PutInChestTool;
