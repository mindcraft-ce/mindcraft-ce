import BaseTool from "../base_tool.js";
import { getToolDocs } from "../index.js";

class HelpTool extends BaseTool {
    constructor() {
        super(
            "help",
            "Lists all available commands and their descriptions.",
            [],
            false
        );
    }

    async execute(agent) {
        return getToolDocs(agent);
    }
}

export default HelpTool;
