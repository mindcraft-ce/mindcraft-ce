import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class GetBlueprintLevelTool extends BaseTool {
    constructor() {
        super(
            "getBlueprintLevel",
            "Get the blueprint for the building",
            [
                new CommandProperty("levelNum", "The level number to check.", "integer", true)
            ],
            false
        );
    }

    async execute(agent, levelNum) {
        let res = agent.task.blueprint.explainLevel(levelNum);
        console.log(res);
        return '\n' + res + '\n';
    }
}

export default GetBlueprintLevelTool;
