import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class SearchForBlockTool extends BaseTool {
    constructor() {
        super(
            "searchForBlock",
            "Find and go to the nearest block of a given type in a given range.",
            [
                new CommandProperty("type", "The block type to go to.", "string", true),
                new CommandProperty("search_range", "The range to search for the block. Minimum 32.", "number", true)
            ]
        );
    }

    async execute(agent, type, search_range) {
        const actionFn = async () => {
            if (search_range < 32) {
                skills.log(agent.bot, `Minimum search range is 32.`);
                search_range = 32;
            }
            await skills.goToNearestBlock(agent.bot, type, 4, search_range);
        };
        const code_return = await agent.actions.runAction('action:searchForBlock', actionFn);
        return code_return.message;
    }
}

export default SearchForBlockTool;
