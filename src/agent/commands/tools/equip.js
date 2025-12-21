import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class EquipTool extends BaseTool {
    constructor() {
        super(
            "equip",
            "Equip the given item.",
            [
                new CommandProperty("item_name", "The name of the item to equip.", "string", true)
            ]
        );
    }

    async execute(agent, item_name) {
        const actionFn = async () => {
            await skills.equip(agent.bot, item_name);
        };
        const code_return = await agent.actions.runAction('action:equip', actionFn);
        return code_return.message;
    }
}

export default EquipTool;
