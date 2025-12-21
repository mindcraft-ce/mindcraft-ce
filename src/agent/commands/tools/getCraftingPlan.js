import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as world from "../../library/world.js";
import * as mc from "../../../utils/mcdata.js";

class GetCraftingPlanTool extends BaseTool {
    constructor() {
        super(
            "getCraftingPlan",
            "Provides a comprehensive crafting plan for a specified item. This includes a breakdown of required ingredients, the exact quantities needed, and an analysis of missing ingredients or extra items needed based on the bot's current inventory.",
            [
                new CommandProperty("targetItem", "The item that we are trying to craft", "string", true),
                new CommandProperty("quantity", "The quantity of the item that we are trying to craft", "integer", false)
            ],
            false
        );
    }

    async execute(agent, targetItem, quantity = 1) {
        let bot = agent.bot;

        // Fetch the bot's inventory
        const curr_inventory = world.getInventoryCounts(bot); 
        const target_item = targetItem;
        let existingCount = curr_inventory[target_item] || 0;
        let prefixMessage = '';
        if (existingCount > 0) {
            curr_inventory[target_item] -= existingCount;
            prefixMessage = `You already have ${existingCount} ${target_item} in your inventory. If you need to craft more,\n`;
        }

        // Generate crafting plan
        try {
            let craftingPlan = mc.getDetailedCraftingPlan(target_item, quantity, curr_inventory);
            craftingPlan = prefixMessage + craftingPlan;
            return '\n' + craftingPlan + '\n';
        } catch (error) {
            console.error("Error generating crafting plan:", error);
            return `An error occurred while generating the crafting plan: ${error.message}`;
        }
    }
}

export default GetCraftingPlanTool;
