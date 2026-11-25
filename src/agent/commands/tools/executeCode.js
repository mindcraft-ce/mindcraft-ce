import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import settings from "../../settings.js";
import { ExecutorCodeAgent } from "../../agents/executor.js";

class ExecuteCodeTool extends BaseTool {
    constructor() {
        super(
            "executeCode",
            "Write and execute custom code to accomplish a specific task using all available skills and augments. Use this for complex operations not covered by existing tools.",
            [
                new CommandProperty("task", "A detailed description of what the code should accomplish.", "string", true),
                new CommandProperty("context", "Additional context about the current situation (optional).", "string", false)
            ]
        );
    }

    async execute(agent, task, context) {
        if (!settings.allow_insecure_coding) {
            return "executeCode is disabled. Enable with allow_insecure_coding=true in settings.js";
        }

        const executor = new ExecutorCodeAgent(agent);
        return await executor.executeTask(task, context || '');
    }
}

export default ExecuteCodeTool;
