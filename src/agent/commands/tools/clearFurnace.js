import BaseTool from "../base_tool.js";
import * as skills from "../../library/skills.js";

class ClearFurnaceTool extends BaseTool {
    constructor() {
        super(
            "clearFurnace",
            "Take all items out of the nearest furnace.",
            []
        );
    }

    async execute(agent) {
        const actionFn = async () => {
            await skills.clearNearestFurnace(agent.bot);
        };
        const code_return = await agent.actions.runAction('action:clearFurnace', actionFn);
        return code_return.message;
    }
}

export default ClearFurnaceTool;
