import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class StayTool extends BaseTool {
    constructor() {
        super(
            "stay",
            "Stay in the current location no matter what. Pauses all modes.",
            [
                new CommandProperty("seconds", "The number of seconds to stay. -1 for forever.", "integer", true)
            ]
        );
    }

    async execute(agent, seconds) {
        const actionFn = async () => {
            await skills.stay(agent.bot, seconds);
        };
        const code_return = await agent.actions.runAction('action:stay', actionFn);
        return code_return.message;
    }
}

export default StayTool;
