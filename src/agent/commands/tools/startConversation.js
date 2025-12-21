import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import convoManager from "../../conversation.js";

class StartConversationTool extends BaseTool {
    constructor() {
        super(
            "startConversation",
            "Start a conversation with a bot. (FOR OTHER BOTS ONLY)",
            [
                new CommandProperty("player_name", "The name of the player to send the message to.", "string", true),
                new CommandProperty("message", "The message to send.", "string", true)
            ]
        );
    }

    async execute(agent, player_name, message) {
        if (!convoManager.isOtherAgent(player_name))
            return player_name + ' is not a bot, cannot start conversation.';
        if (convoManager.inConversation() && !convoManager.inConversation(player_name)) 
            convoManager.forceEndCurrentConversation();
        else if (convoManager.inConversation(player_name))
            agent.history.add('system', 'You are already in conversation with ' + player_name + '. Don\'t use this command to talk to them.');
        convoManager.startConversation(player_name, message);
    }
}

export default StartConversationTool;
