import BaseTool from "../base_tool.js";

class GetBlueprintTool extends BaseTool {
    constructor() {
        super(
            "getBlueprint",
            "Get the blueprint for the building",
            [],
            false
        );
    }

    async execute(agent) {
        let res = agent.task.blueprint.explain();
        return '\n' + res + '\n';
    }
}

export default GetBlueprintTool;
