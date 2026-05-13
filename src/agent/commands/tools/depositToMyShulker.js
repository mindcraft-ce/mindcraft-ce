import BaseTool from "../base_tool.js";
import * as skills from "../../library/skills.js";

class DepositToMyShulkerTool extends BaseTool {
    constructor() {
        super(
            "depositToMyShulker",
            "Walk to your bound shulker box and deposit gathered materials (logs, planks, stone, ores, food). Your shulker auto-binds the first time you sleep in your bed — call this when your inventory is filling up.",
            []
        );
    }

    async execute(agent) {
        const actionFn = async () => {
            await skills.depositToMyShulker(agent.bot, agent);
        };
        const code_return = await agent.actions.runAction('action:depositToMyShulker', actionFn);
        return code_return.message;
    }
}

export default DepositToMyShulkerTool;
