import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class SmeltItemTool extends BaseTool {
    constructor() {
        super(
            "smeltItem",
            "Smelt the given item the given number of times.",
            [
                new CommandProperty("item_name", "The name of the input item to smelt.", "string", true),
                new CommandProperty("num", "The number of times to smelt the item.", "integer", true)
            ]
        );
    }

    async execute(agent, item_name, num) {
        const actionFn = async () => {
            let success = await skills.smeltItem(agent.bot, item_name, num);
            if (success) {
                setTimeout(() => {
                    agent.cleanKill('Safely restarting to update inventory.');
                }, 500);
            }
        };
        const code_return = await agent.actions.runAction('action:smeltItem', actionFn);
        return code_return.message;
    }
}

export default SmeltItemTool;
