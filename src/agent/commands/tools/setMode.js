import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class SetModeTool extends BaseTool {
    constructor() {
        super(
            "setMode",
            "Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.",
            [
                new CommandProperty("mode_name", "The name of the mode to enable.", "string", true),
                new CommandProperty("on", "Whether to enable or disable the mode.", "boolean", true)
            ]
        );
    }

    async execute(agent, mode_name, on) {
        const modes = agent.bot.modes;
        if (!modes.exists(mode_name))
            return `Mode ${mode_name} does not exist.` + modes.getDocs();
        if (modes.isOn(mode_name) === on)
            return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
        modes.setOn(mode_name, on);
        return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
    }
}

export default SetModeTool;
