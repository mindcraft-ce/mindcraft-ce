import BaseTool from "../base_tool.js";
import * as skills from "../../library/skills.js";

class ViewChestTool extends BaseTool {
    constructor() {
        super(
            "viewChest",
            "View the items/counts of the nearest chest.",
            []
        );
    }

    async execute(agent) {
        const actionFn = async () => {
            await skills.viewChest(agent.bot);
        };
        const code_return = await agent.actions.runAction('action:viewChest', actionFn);
        return code_return.message;
    }
}

export default ViewChestTool;
