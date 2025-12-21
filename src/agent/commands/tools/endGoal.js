import BaseTool from "../base_tool.js";

class EndGoalTool extends BaseTool {
    constructor() {
        super(
            "endGoal",
            "Call when you have accomplished your goal. It will stop self-prompting and the current action.",
            []
        );
    }

    async execute(agent) {
        agent.self_prompter.stop();
        return 'Self-prompting stopped.';
    }
}

export default EndGoalTool;
