import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import settings from "../../../settings.js";

class NewActionTool extends BaseTool {
    constructor() {
        super(
            "newAction",
            "Perform new and unknown custom behaviors that are not available as a command.",
            [
                new CommandProperty("prompt", "A natural language prompt to guide code generation. Make a detailed step-by-step plan.", "string", true)
            ]
        );
    }

    async execute(agent, prompt)  {
        // just ignore prompt - it is now in context in chat history
        if (!settings.allow_insecure_coding) { 
            agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
            return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
        }
        let result = "";
        const actionFn = async () => {
            try {
                result = await agent.coder.generateCode(agent.history);
            } catch (e) {
                result = 'Error generating code: ' + e.toString();
            }
        };
        await agent.actions.runAction('action:newAction', actionFn, {timeout: settings.code_timeout_mins});
        return result;
    }
}

export default NewActionTool;