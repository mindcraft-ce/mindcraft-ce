import BaseTool from "../base_tool.js";
import * as skills from "../../library/skills.js";

class GoToBedTool extends BaseTool {
    constructor() {
        super(
            "goToBed",
            "Go to the nearest bed and sleep.",
            []
        );
    }

    async execute(agent) {
        const actionFn = async () => {
            await skills.goToBed(agent.bot);
        };
        const code_return = await agent.actions.runAction('action:goToBed', actionFn);
        return code_return.message;
    }
}

export default GoToBedTool;
