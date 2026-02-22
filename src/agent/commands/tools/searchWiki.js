import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class SearchWikiTool extends BaseTool {
    constructor() {
        super(
            "searchWiki",
            "Search the Minecraft wiki for information about blocks, items, mobs, crafting recipes, game mechanics, and strategies.",
            [
                new CommandProperty("query", "The search query for Minecraft wiki knowledge.", "string", true),
                new CommandProperty("num_results", "Number of results to return (default 3).", "integer", false)
            ],
            false
        );
    }

    async execute(agent, query, num_results) {
        const topK = num_results || 3;
        try {
            const context = await agent.rag.getMinecraftContext(query, topK);
            if (!context || context.trim().length === 0) {
                return `No wiki results found for "${query}".`;
            }
            return `Minecraft Wiki results for "${query}":\n${context}`;
        } catch (error) {
            return `Wiki search failed: ${error.message}`;
        }
    }
}

export default SearchWikiTool;
