import BaseTool from "../base_tool.js";
import * as world from "../../library/world.js";

class InventoryTool extends BaseTool {
    constructor() {
        super(
            "inventory",
            "Get your bot's inventory.",
            [],
            false
        );
    }

    async execute(agent) {
        let bot = agent.bot;
        let inventory = world.getInventoryCounts(bot);
        let res = 'INVENTORY';
        for (const item in inventory) {
            if (inventory[item] && inventory[item] > 0)
                res += `\n- ${item}: ${inventory[item]}`;
        }
        if (res === 'INVENTORY') {
            res += ': Nothing';
        }
        else if (agent.bot.game.gameMode === 'creative') {
            res += '\n(You have infinite items in creative mode. You do not need to gather resources!!)';
        }

        let helmet = bot.inventory.slots[5];
        let chestplate = bot.inventory.slots[6];
        let leggings = bot.inventory.slots[7];
        let boots = bot.inventory.slots[8];
        res += '\nWEARING: ';
        if (helmet)
            res += `\nHead: ${helmet.name}`;
        if (chestplate)
            res += `\nTorso: ${chestplate.name}`;
        if (leggings)
            res += `\nLegs: ${leggings.name}`;
        if (boots)
            res += `\nFeet: ${boots.name}`;
        if (!helmet && !chestplate && !leggings && !boots)
            res += 'Nothing';

        return '\n' + res + '\n';
    }
}

export default InventoryTool;
