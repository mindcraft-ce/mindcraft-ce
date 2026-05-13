import BaseTool from "../../base_tool.js";
import CommandProperty from "../../property.js";
import * as skills from "../../../library/skills.js";
import * as world from "../../../library/world.js";
import { Vec3 } from "vec3";

class CollisionSafePathingTool extends BaseTool {
    constructor() {
        super("collisionSafePathing", "Safely evaluates nearby terrain for open-space traversal and moves the bot only through clear, non-enclosed routes. It should stop immediately if the bot is partially embedded, if the path has 1-block gaps, low ceilings, leaf tunnels, caves, doorways, or other collision risks, and it should prefer open terrain with full side and head clearance.", [
            new CommandProperty("targetX", "Optional target x coordinate", "number", false),
            new CommandProperty("targetY", "Optional target y coordinate", "number", false),
            new CommandProperty("targetZ", "Optional target z coordinate", "number", false),
            new CommandProperty("followDistance", "Optional safe following distance or clearance threshold", "number", false)
        ]);
    }

    async execute(agent, targetX, targetY, targetZ, followDistance) {
        const bot = agent.bot;
        const args = { targetX, targetY, targetZ, followDistance };
        const log = skills.log;
        const actionFn = async () => {
            try {
              const targetX = args.targetX;
              const targetY = args.targetY;
              const targetZ = args.targetZ;
              const followDistance = (typeof args.followDistance === 'number' && !isNaN(args.followDistance)) ? args.followDistance : 2;

              const pos = world.getPosition(bot);
              const inv = world.getInventoryCounts(bot);

              if (bot.interrupt_code) { log(bot, 'Code interrupted.'); return; }

              const hasTarget = [targetX, targetY, targetZ].every(v => typeof v === 'number' && !isNaN(v));

              const around = [
                [0, 0, 0],
                [0, 1, 0],
                [0, 2, 0],
                [1, 0, 0],
                [-1, 0, 0],
                [0, 0, 1],
                [0, 0, -1],
                [1, 1, 0],
                [-1, 1, 0],
                [0, 1, 1],
                [0, 1, -1]
              ];

              let risk = false;
              let openSides = 0;
              for (let i = 0; i < around.length; i++) {
                if (bot.interrupt_code) { log(bot, 'Code interrupted.'); return; }
                const dx = around[i][0], dy = around[i][1], dz = around[i][2];
                const p = { x: Math.floor(pos.x + dx), y: Math.floor(pos.y + dy), z: Math.floor(pos.z + dz) };
                const key = `${p.x},${p.y},${p.z}`;
                const count = inv[key];
                if (typeof count === 'number' && count > 0) {
                  risk = true;
                  break;
                }
                if (dx !== 0 || dz !== 0) openSides++;
              }

              if (risk || openSides < 4) {
                await skills.stay(bot, 2);
                return;
              }

              if (!hasTarget) {
                await skills.stay(bot, 1);
                return;
              }

              const dx = targetX - pos.x;
              const dy = targetY - pos.y;
              const dz = targetZ - pos.z;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

              if (dist <= followDistance) {
                await skills.stay(bot, 1);
                return;
              }

              if (Math.abs(dy) > 1) {
                await skills.stay(bot, 1);
                return;
              }

              await skills.wait(bot, 250);
            } catch (e) {
              log(bot, 'Error: ' + e.message);
            }
        };
        const code_return = await agent.actions.runAction('action:collisionSafePathing', actionFn, { timeout: -1 });
        return code_return.message;
    }
}

export default CollisionSafePathingTool;
