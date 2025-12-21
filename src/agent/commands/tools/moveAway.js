import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class MoveAwayTool extends BaseTool {
    constructor() {
        super(
            "moveAway",
            "Move away from the current location in any direction by a given distance.",
            [
                new CommandProperty("distance", "The distance to move away.", "number", true)
            ]
        );
    }

    async execute(agent, distance) {
        const actionFn = async () => {
            await skills.moveAway(agent.bot, distance);
        };
        const code_return = await agent.actions.runAction('action:moveAway', actionFn);
        return code_return.message;
    }
}

export default MoveAwayTool;
