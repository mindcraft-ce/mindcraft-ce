import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class DigDownTool extends BaseTool {
    constructor() {
        super(
            "digDown",
            "Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.",
            [
                new CommandProperty("distance", "Distance to dig down", "integer", true)
            ]
        );
    }

    async execute(agent, distance) {
        const actionFn = async () => {
            await skills.digDown(agent.bot, distance);
        };
        const code_return = await agent.actions.runAction('action:digDown', actionFn);
        return code_return.message;
    }
}

export default DigDownTool;
