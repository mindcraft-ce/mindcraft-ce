import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class SearchSkillsTool extends BaseTool {
    constructor() {
        super(
            "searchSkills",
            "Search the skill library for available bot functions and their documentation. Use this to find the right API calls for a task.",
            [
                new CommandProperty("query", "The search query describing the skill or capability you need.", "string", true),
                new CommandProperty("num_results", "Number of results to return (default 5).", "integer", false)
            ],
            false
        );
    }

    async execute(agent, query, num_results) {
        const topK = num_results || 5;
        try {
            const docs = await agent.prompter.skill_libary.getRelevantSkillDocs(query, topK);
            if (!docs || docs.trim().length === 0) {
                return `No skill docs found for "${query}".`;
            }
            return `Skill library results for "${query}":\n${docs}`;
        } catch (error) {
            return `Skill search failed: ${error.message}`;
        }
    }
}

export default SearchSkillsTool;
