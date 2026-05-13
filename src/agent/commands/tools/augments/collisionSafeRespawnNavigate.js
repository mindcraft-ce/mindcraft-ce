import BaseTool from "../../base_tool.js";
import CommandProperty from "../../property.js";
import * as skills from "../../../library/skills.js";
import * as world from "../../../library/world.js";
import { Vec3 } from "vec3";

class CollisionSafeRespawnNavigateTool extends BaseTool {
    constructor() {
        super("collisionSafeRespawnNavigate", "Safely move the bot away from collision-prone blocks after respawn by checking for cramped surroundings and relocating to a more open surface with headroom, avoiding leaves, ceilings, walls, ledges, holes, and tight passages.", [
            new CommandProperty("searchRadius", "How far to search for open ground if current area is unsafe", "number", false)
        ]);
    }

    async execute(agent, searchRadius) {
        const bot = agent.bot;
        const args = { searchRadius };
        const log = skills.log;
        const actionFn = async () => {
            try {
              const searchRadius = Number(args.searchRadius ?? 16);

              if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }

              await skills.pickupNearbyItems(bot);

              const safeSupportBlocks = [
                "grass_block", "dirt", "stone", "cobblestone", "sand", "gravel",
                "oak_planks", "spruce_planks", "birch_planks", "jungle_planks",
                "acacia_planks", "dark_oak_planks", "mangrove_planks", "cherry_planks",
                "oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log",
                "dark_oak_log", "mangrove_log", "cherry_log"
              ];

              const currentSupportCandidates = safeSupportBlocks;
              let moved = false;

              for (const blockType of currentSupportCandidates) {
                if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }
                const reached = await skills.goToNearestBlock(bot, blockType, 2, Math.max(8, searchRadius));
                if (reached) {
                  moved = true;
                  break;
                }
              }

              if (!moved) {
                await skills.wait(bot, 250);
              }

              let settled = false;
              for (let i = 0; i < 3; i++) {
                if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }
                const clear = await world.isClearPath(bot, new Vec3(0, 0, 0));
                if (clear) {
                  settled = true;
                  break;
                }
                await skills.wait(bot, 200);
              }

              if (!settled) {
                for (const blockType of safeSupportBlocks) {
                  if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }
                  const reached = await skills.goToNearestBlock(bot, blockType, 3, searchRadius);
                  if (reached) {
                    await skills.wait(bot, 200);
                    const clear = await world.isClearPath(bot, new Vec3(0, 0, 0));
                    if (clear) {
                      settled = true;
                      break;
                    }
                  }
                }
              }

              if (!settled) {
                await skills.wait(bot, 500);
              }
            } catch (e) { log(bot, "Error: " + e.message); }
        };
        const code_return = await agent.actions.runAction('action:collisionSafeRespawnNavigate', actionFn, { timeout: -1 });
        return code_return.message;
    }
}

export default CollisionSafeRespawnNavigateTool;
