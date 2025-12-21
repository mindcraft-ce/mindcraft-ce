import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class SearchForEntityTool extends BaseTool {
    constructor() {
        super(
            "searchForEntity",
            "Find and go to the nearest entity of a given type in a given range.",
            [
                new CommandProperty("type", "The type of entity to go to.", "string", true),
                new CommandProperty("search_range", "The range to search for the entity.", "number", true)
            ]
        );
    }

    async execute(agent, type, search_range) {
        const actionFn = async () => {
            await skills.goToNearestEntity(agent.bot, type, 4, search_range);
        };
        const code_return = await agent.actions.runAction('action:searchForEntity', actionFn);
        return code_return.message;
    }
}

export default SearchForEntityTool;
