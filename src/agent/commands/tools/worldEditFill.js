import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class WorldEditFillTool extends BaseTool {
    constructor() {
        super(
            "worldEditFill",
            "Use FastAsyncWorldEdit to fill a cuboid region instantly with one block type. Massively faster than placing blocks one-by-one. Use for big building tasks: floors, walls, clearing chambers, filling foundations. Bot must be op'd.",
            [
                new CommandProperty("x1", "First corner x coordinate.", "integer", true),
                new CommandProperty("y1", "First corner y coordinate.", "integer", true),
                new CommandProperty("z1", "First corner z coordinate.", "integer", true),
                new CommandProperty("x2", "Second corner x coordinate.", "integer", true),
                new CommandProperty("y2", "Second corner y coordinate.", "integer", true),
                new CommandProperty("z2", "Second corner z coordinate.", "integer", true),
                new CommandProperty("blockType", "Block type to fill with (e.g. 'stone', 'air' to clear, 'oak_planks').", "string", true)
            ]
        );
    }

    async execute(agent, x1, y1, z1, x2, y2, z2, blockType) {
        const actionFn = async () => {
            await skills.worldEditFill(agent.bot, x1, y1, z1, x2, y2, z2, blockType);
        };
        const code_return = await agent.actions.runAction('action:worldEditFill', actionFn);
        return code_return.message;
    }
}

export default WorldEditFillTool;
