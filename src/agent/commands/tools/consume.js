import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class ConsumeTool extends BaseTool {
    constructor() {
        super(
            "consume",
            "Eat/drink the given item.",
            [
                new CommandProperty("item_name", "The name of the item to consume.", "string", true)
            ]
        );
    }

    async execute(agent, item_name) {
        const actionFn = async () => {
            await skills.consume(agent.bot, item_name);
        };
        const code_return = await agent.actions.runAction('action:consume', actionFn);
        return code_return.message;
    }
}

export default ConsumeTool;
