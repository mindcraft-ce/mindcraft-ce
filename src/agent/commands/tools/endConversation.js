import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import convoManager from "../../conversation.js";

class EndConversationTool extends BaseTool {
    constructor() {
        super(
            "endConversation",
            "End the conversation with the given bot. (FOR OTHER BOTS ONLY)",
            [
                new CommandProperty("player_name", "The name of the player to end the conversation with.", "string", true)
            ]
        );
    }

    async execute(agent, player_name) {
        if (!convoManager.inConversation(player_name))
            return `Not in conversation with ${player_name}.`;
        convoManager.endConversation(player_name);
        return `Converstaion with ${player_name} ended.`;
    }
}

export default EndConversationTool;
