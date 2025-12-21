import BaseTool from "../base_tool.js";

class RestartTool extends BaseTool {
    constructor() {
        super(
            "restart",
            "Restart the agent process.",
            []
        );
    }

    async execute(agent) {
        agent.cleanKill();
    }
}

export default RestartTool;
