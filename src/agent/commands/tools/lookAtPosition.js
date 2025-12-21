import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class LookAtPositionTool extends BaseTool {
    constructor() {
        super(
            "lookAtPosition",
            "Look at specified coordinates.",
            [
                new CommandProperty("x", "x coordinate", "integer", true),
                new CommandProperty("y", "y coordinate", "integer", true),
                new CommandProperty("z", "z coordinate", "integer", true)
            ]
        );
    }

    async execute(agent, x, y, z) {
        let result = "";
        const actionFn = async () => {
            result = await agent.vision_interpreter.lookAtPosition(x, y, z);
        };
        await agent.actions.runAction('action:lookAtPosition', actionFn);
        return result;
    }
}

export default LookAtPositionTool;
