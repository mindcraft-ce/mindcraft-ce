import BaseTool from "../base_tool.js";
import * as skills from "../../library/skills.js";

class GoToSurfaceTool extends BaseTool {
    constructor() {
        super(
            "goToSurface",
            "Moves the bot to the highest block above it (usually the surface).",
            []
        );
    }

    async execute(agent) {
        const actionFn = async () => {
            await skills.goToSurface(agent.bot);
        };
        const code_return = await agent.actions.runAction('action:goToSurface', actionFn);
        return code_return.message;
    }
}

export default GoToSurfaceTool;
