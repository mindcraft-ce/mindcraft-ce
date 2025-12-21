import BaseTool from "../base_tool.js";

class ClearChatTool extends BaseTool {
    constructor() {
        super(
            "clearChat",
            "Clear the chat history.",
            []
        );
    }

    async execute(agent) {
        agent.history.clear();
        return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
    }
}

export default ClearChatTool;
