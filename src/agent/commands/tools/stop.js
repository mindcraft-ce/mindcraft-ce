import BaseTool from "../base_tool.js";

class StopTool extends BaseTool {
    constructor() {
        super(
            "stop",
            "Force stop all actions and commands that are currently executing.",
            []
        );
    }

    async execute(agent) {
        await agent.actions.stop();
        agent.clearBotLogs();
        agent.actions.cancelResume();
        agent.bot.emit('idle');
        let msg = 'Agent stopped.';
        if (agent.self_prompter.isActive())
            msg += ' Self-prompting still active.';
        return msg;
    }
}

export default StopTool;
