import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";
import settings from "../../settings.js";

class GoToCoordinatesTool extends BaseTool {
    constructor() {
        super(
            "goToCoordinates",
            "Go to the given x, y, z location.",
            [
                new CommandProperty("x", "The x coordinate.", "number", true),
                new CommandProperty("y", "The y coordinate.", "number", true),
                new CommandProperty("z", "The z coordinate.", "number", true),
                new CommandProperty("closeness", "How close to get to the location.", "number", true)
            ]
        );
    }

    async execute(agent, x, y, z, closeness) {
        // Travel leash. BrainAgent task plans have been observed routing bots
        // 2000+ blocks away to "find resources"; the long walk often ends in
        // a death and far-respawn cycle. Refuse anything beyond
        // settings.max_travel_distance from the protected_zones[0] center,
        // and tell the model the target is out of range so it picks a closer
        // strategy instead of looping the same coords every tick.
        const maxDist = settings.max_travel_distance;
        const zones = settings.protected_zones;
        if (maxDist != null && Array.isArray(zones) && zones[0]) {
            const z0 = zones[0];
            const cx = (z0[0] + z0[3]) / 2;
            const cz = (z0[2] + z0[5]) / 2;
            const dist = Math.hypot(x - cx, z - cz);
            if (dist > maxDist) {
                return `Refusing goToCoordinates(${x}, ${y}, ${z}) — target is ${Math.round(dist)} blocks from base, exceeds the ${maxDist}-block travel leash. Stay within range; gather resources closer to home.`;
            }
        }
        const actionFn = async () => {
            await skills.goToPosition(agent.bot, x, y, z, closeness);
        };
        const code_return = await agent.actions.runAction('action:goToCoordinates', actionFn);
        return code_return.message;
    }
}

export default GoToCoordinatesTool;
