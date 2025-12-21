import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import convoManager from "../../conversation.js";

class GoalTool extends BaseTool {
    constructor() {
        super(
            "goal",
            "Set a goal prompt to endlessly work towards with continuous self-prompting.",
            [
                new CommandProperty("selfPrompt", "The goal prompt.", "string", true)
            ]
        );
    }

    async execute(agent, selfPrompt) {
        if (convoManager.inConversation()) {
            agent.self_prompter.setPromptPaused(selfPrompt);
        }
        else {
            agent.self_prompter.start(selfPrompt);
        }
    }
}

export default GoalTool;
