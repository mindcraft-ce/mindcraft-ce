import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class FollowPlayerTool extends BaseTool {
    constructor() {
        super(
            "followPlayer",
            "Endlessly follow the given player.",
            [
                new CommandProperty("player_name", "name of the player to follow.", "string", true),
                new CommandProperty("follow_dist", "The distance to follow from.", "number", true)
            ]
        );
    }

    async execute(agent, player_name, follow_dist) {
        const actionFn = async () => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        };
        // resume=true for followPlayer
        const code_return = await agent.actions.runAction('action:followPlayer', actionFn, { resume: true });
        return code_return.message;
    }
}

export default FollowPlayerTool;
