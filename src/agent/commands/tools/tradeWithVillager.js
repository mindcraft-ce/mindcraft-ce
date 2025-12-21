import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class TradeWithVillagerTool extends BaseTool {
    constructor() {
        super(
            "tradeWithVillager",
            "Trade with a specified villager.",
            [
                new CommandProperty("id", "The id number of the villager that you want to trade with.", "integer", true),
                new CommandProperty("index", "The index of the trade you want executed (1-indexed).", "integer", true),
                new CommandProperty("count", "How many times that trade should be executed.", "integer", true)
            ]
        );
    }

    async execute(agent, id, index, count) {
        const actionFn = async () => {
            await skills.tradeWithVillager(agent.bot, id, index, count);
        };
        const code_return = await agent.actions.runAction('action:tradeWithVillager', actionFn);
        return code_return.message;
    }
}

export default TradeWithVillagerTool;
