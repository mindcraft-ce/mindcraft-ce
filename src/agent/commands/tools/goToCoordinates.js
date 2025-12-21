import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class GoToCoordinatesTool extends BaseTool {
    constructor() {
        super(
            "goToCoordinates",
            "Go to the given x, y, z location.",
            [
                new CommandProperty("x", "The x coordinate.", "number", true),
                new CommandProperty("y", "The y coordinate.", "number", true),
                new CommandProperty("z", "The z coordinate.", "number", true),
                new CommandProperty("closeness", "How close to get to the location.", "number", true)
            ]
        );
    }

    async execute(agent, x, y, z, closeness) {
        const actionFn = async () => {
            await skills.goToPosition(agent.bot, x, y, z, closeness);
        };
        const code_return = await agent.actions.runAction('action:goToCoordinates', actionFn);
        return code_return.message;
    }
}

export default GoToCoordinatesTool;
