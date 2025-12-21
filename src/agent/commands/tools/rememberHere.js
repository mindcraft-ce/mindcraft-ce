import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class RememberHereTool extends BaseTool {
    constructor() {
        super(
            "rememberHere",
            "Save the current location with a given name.",
            [
                new CommandProperty("name", "The name to remember the location as.", "string", true)
            ]
        );
    }

    async execute(agent, name) {
        const pos = agent.bot.entity.position;
        agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
        return `Location saved as "${name}".`;
    }
}

export default RememberHereTool;
