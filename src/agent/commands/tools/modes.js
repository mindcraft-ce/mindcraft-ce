import BaseTool from "../base_tool.js";

class ModesTool extends BaseTool {
    constructor() {
        super(
            "modes",
            "Get all available modes and their docs and see which are on/off.",
            [],
            false
        );
    }

    async execute(agent) {
        return agent.bot.modes.getDocs();
    }
}

export default ModesTool;
