import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class PlaceHereTool extends BaseTool {
    constructor() {
        super(
            "placeHere",
            "Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.",
            [
                new CommandProperty("type", "The block type to place.", "string", true)
            ]
        );
    }

    async execute(agent, type) {
        const actionFn = async () => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        };
        const code_return = await agent.actions.runAction('action:placeHere', actionFn);
        return code_return.message;
    }
}

export default PlaceHereTool;
