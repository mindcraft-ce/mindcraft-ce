import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class ShowVillagerTradesTool extends BaseTool {
    constructor() {
        super(
            "showVillagerTrades",
            "Show trades of a specified villager.",
            [
                new CommandProperty("id", "The id number of the villager that you want to trade with.", "integer", true)
            ]
        );
    }

    async execute(agent, id) {
        const actionFn = async () => {
            await skills.showVillagerTrades(agent.bot, id);
        };
        const code_return = await agent.actions.runAction('action:showVillagerTrades', actionFn);
        return code_return.message;
    }
}

export default ShowVillagerTradesTool;
