import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class UseOnTool extends BaseTool {
    constructor() {
        super(
            "useOn",
            "Use (right click) the given tool on the nearest target of the given type.",
            [
                new CommandProperty("tool_name", "Name of the tool to use, or 'hand' for no tool.", "string", true),
                new CommandProperty("target", "The target as an entity type, block type, or 'nothing' for no target.", "string", true)
            ]
        );
    }

    async execute(agent, tool_name, target) {
        const actionFn = async () => {
            await skills.useToolOn(agent.bot, tool_name, target);
        };
        const code_return = await agent.actions.runAction('action:useOn', actionFn);
        return code_return.message;
    }
}

export default UseOnTool;
