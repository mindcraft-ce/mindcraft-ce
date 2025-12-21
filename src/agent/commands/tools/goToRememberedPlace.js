import BaseTool from "../base_tool.js";
import CommandProperty from "../property.js";
import * as skills from "../../library/skills.js";

class GoToRememberedPlaceTool extends BaseTool {
    constructor() {
        super(
            "goToRememberedPlace",
            "Go to a saved location.",
            [
                new CommandProperty("name", "The name of the location to go to.", "string", true)
            ]
        );
    }

    async execute(agent, name) {
        const actionFn = async () => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
                skills.log(agent.bot, `No location named "${name}" saved.`);
                return;
            }
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
        };
        const code_return = await agent.actions.runAction('action:goToRememberedPlace', actionFn);
        return code_return.message;
    }
}

export default GoToRememberedPlaceTool;
