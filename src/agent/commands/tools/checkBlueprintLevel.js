import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import { checkLevelBlueprint } from "../../tasks/construction_tasks.js";

class CheckBlueprintLevelTool extends BaseTool {
    constructor() {
        super(
            "checkBlueprintLevel",
            "Check if the level is complete and what blocks still need to be placed for the blueprint",
            [
                new CommandProperty("levelNum", "The level number to check.", "integer", true)
            ],
            false
        );
    }

    async execute(agent, levelNum) {
        let res = checkLevelBlueprint(agent, levelNum);
        console.log(res);
        return '\n' + res + '\n';
    }
}

export default CheckBlueprintLevelTool;
