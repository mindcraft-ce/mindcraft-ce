import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class CollectBlocksTool extends BaseTool {
    constructor() {
        super(
            "collectBlocks",
            "Collect the nearest blocks of a given type.",
            [
                new CommandProperty("type", "The block type to collect.", "string", true),
                new CommandProperty("num", "The number of blocks to collect.", "integer", true)
            ]
        );
    }

    async execute(agent, type, num) {
        const actionFn = async () => {
            await skills.collectBlock(agent.bot, type, num);
        };
        // 10 minute timeout
        const code_return = await agent.actions.runAction('action:collectBlocks', actionFn, { timeout: 10 });
        return code_return.message;
    }
}

export default CollectBlocksTool;
