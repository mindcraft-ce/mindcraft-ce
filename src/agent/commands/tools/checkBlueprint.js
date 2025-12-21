import BaseTool from "../base_tool.js";
import { checkBlueprint } from "../../tasks/construction_tasks.js";

class CheckBlueprintTool extends BaseTool {
    constructor() {
        super(
            "checkBlueprint",
            "Check what blocks still need to be placed for the blueprint",
            [],
            false
        );
    }

    async execute(agent) {
        let res = checkBlueprint(agent);
        return '\n' + res + '\n';
    }
}

export default CheckBlueprintTool;
