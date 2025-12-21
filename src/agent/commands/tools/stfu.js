import BaseTool from "../base_tool.js";

class StfuTool extends BaseTool {
    constructor() {
        super(
            "stfu",
            "Stop all chatting and self prompting, but continue current action.",
            []
        );
    }

    async execute(agent) {
        agent.openChat('Shutting up.');
        agent.shutUp();
        return;
    }
}

export default StfuTool;
