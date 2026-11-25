import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import settings from "../../settings.js";
import { CodeAgent } from "../../agents/code.js";

class GenerateAugmentTool extends BaseTool {
    constructor() {
        super(
            "generateAugment",
            "Generate a new reusable augment tool for future use. The augment will be saved and registered for immediate use in subsequent tasks.",
            [
                new CommandProperty("name", "The name for the new augment tool (camelCase, no spaces).", "string", true),
                new CommandProperty("description", "A clear description of what the augment does.", "string", true),
                new CommandProperty("parameters", "JSON string describing the parameters, e.g. [{\"name\":\"target\",\"type\":\"string\",\"required\":true,\"description\":\"The target\"}]", "string", true),
                new CommandProperty("context", "Context about why this augment is needed and how it should work.", "string", false)
            ]
        );
    }

    async execute(agent, name, description, parameters, context) {
        if (!settings.allow_insecure_coding) {
            return "generateAugment is disabled. Enable with allow_insecure_coding=true in settings.js";
        }

        let parsedParams;
        try {
            parsedParams = JSON.parse(parameters);
        } catch (e) {
            return `Invalid parameters JSON: ${e.message}. Expected format: [{"name":"param1","type":"string","required":true,"description":"..."}]`;
        }

        const codeAgent = new CodeAgent(agent);
        const spec = {
            augment_name: name,
            description,
            parameters: parsedParams,
            task_context: context || description
        };

        try {
            const tool = await codeAgent.generateAugment(spec);
            return tool
                ? `Augment "${name}" has been generated and registered. You can now use it as a tool.`
                : `Failed to generate augment "${name}".`;
        } catch (error) {
            return `Augment generation error: ${error.message}`;
        }
    }
}

export default GenerateAugmentTool;
