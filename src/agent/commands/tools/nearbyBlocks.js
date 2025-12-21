import BaseTool from "../base_tool.js";
import * as world from "../../library/world.js";

class NearbyBlocksTool extends BaseTool {
    constructor() {
        super(
            "nearbyBlocks",
            "Get the blocks near the bot.",
            [],
            false
        );
    }

    async execute(agent) {
        let bot = agent.bot;
        let res = 'NEARBY_BLOCKS';
        let blocks = world.getNearestBlocks(bot);
        let block_details = new Set();
        
        for (let block of blocks) {
            let details = block.name;
            if (block.name === 'water' || block.name === 'lava') {
                details += block.metadata === 0 ? ' (source)' : ' (flowing)';
            }
            block_details.add(details);
        }
        for (let details of block_details) {
            res += `\n- ${details}`;
        }
        if (block_details.size === 0) {
            res += ': none';
        } 
        else {
            res += '\n- ' + world.getSurroundingBlocks(bot).join('\n- ');
            res += `\n- First Solid Block Above Head: ${world.getFirstBlockAboveHead(bot, null, 32)}`;
        }
        return '\n' + res + '\n';
    }
}

export default NearbyBlocksTool;
