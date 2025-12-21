import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class LookAtPlayerTool extends BaseTool {
    constructor() {
        super(
            "lookAtPlayer",
            "Look at a player or look in the same direction as the player.",
            [
                new CommandProperty("player_name", "Name of the target player", "string", true),
                new CommandProperty("direction", "How to look ('at': look at the player, 'with': look in the same direction as the player)", "string", true)
            ]
        );
    }

    async execute(agent, player_name, direction) {
        if (direction !== 'at' && direction !== 'with') {
            return "Invalid direction. Use 'at' or 'with'.";
        }
        let result = "";
        const actionFn = async () => {
            result = await agent.vision_interpreter.lookAtPlayer(player_name, direction);
        };
        await agent.actions.runAction('action:lookAtPlayer', actionFn);
        return result;
    }
}

export default LookAtPlayerTool;
