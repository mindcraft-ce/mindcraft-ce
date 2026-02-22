import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";

class SearchMemoryTool extends BaseTool {
    constructor() {
        super(
            "searchMemory",
            "Search the bot's long-term memory for past experiences, conversations, and learned information.",
            [
                new CommandProperty("query", "The search query for memory retrieval.", "string", true),
                new CommandProperty("num_results", "Number of results to return (default 5).", "integer", false)
            ],
            false
        );
    }

    async execute(agent, query, num_results) {
        const topK = num_results || 5;
        try {
            const context = await agent.rag.getMemoryContext(query, topK);
            if (!context || context.trim().length === 0) {
                return `No memory results found for "${query}". Memory RAG backend is not yet fully implemented.`;
            }
            return `Memory results for "${query}":\n${context}`;
        } catch (error) {
            return `Memory search failed: ${error.message}`;
        }
    }
}

export default SearchMemoryTool;
