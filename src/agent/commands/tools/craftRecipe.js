import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class CraftRecipeTool extends BaseTool {
    constructor() {
        super(
            "craftRecipe",
            "Craft the given recipe a given number of times.",
            [
                new CommandProperty("recipe_name", "The name of the output item to craft.", "string", true),
                new CommandProperty("num", "The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.", "integer", true)
            ]
        );
    }

    async execute(agent, recipe_name, num) {
        const actionFn = async () => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        };
        const code_return = await agent.actions.runAction('action:craftRecipe', actionFn);
        return code_return.message;
    }
}

export default CraftRecipeTool;
