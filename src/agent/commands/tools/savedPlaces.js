import BaseTool from "../base_tool.js";

class SavedPlacesTool extends BaseTool {
    constructor() {
        super(
            "savedPlaces",
            "List all saved locations.",
            [],
            false
        );
    }

    async execute(agent) {
        return "Saved place names: " + agent.memory_bank.getKeys();
    }
}

export default SavedPlacesTool;
