import BaseTool from "../base_tool.js";
import * as world from "../../library/world.js";

class CraftableTool extends BaseTool {
    constructor() {
        super(
            "craftable",
            "Get the craftable items with the bot's inventory.",
            [],
            false
        );
    }

    async execute(agent) {
        let craftable = world.getCraftableItems(agent.bot);
        let res = 'CRAFTABLE_ITEMS';
        for (const item of craftable) {
            res += `\n- ${item}`;
        }
        if (res == 'CRAFTABLE_ITEMS') {
            res += ': none';
        }
        return '\n' + res + '\n';
    }
}

export default CraftableTool;
