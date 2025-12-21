import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class AttackTool extends BaseTool {
    constructor() {
        super(
            "attack",
            "Attack and kill the nearest entity of a given type.",
            [
                new CommandProperty("type", "The type of entity to attack.", "string", true)
            ]
        );
    }

    async execute(agent, type) {
        const actionFn = async () => {
            await skills.attackNearest(agent.bot, type, true);
        };
        const code_return = await agent.actions.runAction('action:attack', actionFn);
        return code_return.message;
    }
}

export default AttackTool;
