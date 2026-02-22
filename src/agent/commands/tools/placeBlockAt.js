import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class PlaceBlockAtTool extends BaseTool {
    constructor() {
        super(
            "placeBlockAt",
            "Place a block at specific coordinates. Use this for building structures with precise placement.",
            [
                new CommandProperty("type", "The block type to place.", "string", true),
                new CommandProperty("x", "The x coordinate.", "integer", true),
                new CommandProperty("y", "The y coordinate.", "integer", true),
                new CommandProperty("z", "The z coordinate.", "integer", true),
                new CommandProperty("placeOn", "The preferred side to place on: top, bottom, north, south, east, west, or side. Defaults to bottom.", "string", false)
            ]
        );
    }

    async execute(agent, type, x, y, z, placeOn = 'bottom') {
        const actionFn = async () => {
            await skills.placeBlock(agent.bot, type, x, y, z, placeOn);
        };
        const code_return = await agent.actions.runAction('action:placeBlockAt', actionFn);
        return code_return.message;
    }
}

export default PlaceBlockAtTool;
