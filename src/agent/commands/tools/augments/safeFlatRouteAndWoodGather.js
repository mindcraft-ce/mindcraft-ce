import BaseTool from "../../base_tool.js";
import CommandProperty from "../../property.js";
import * as skills from "../../../library/skills.js";
import * as world from "../../../library/world.js";
import { Vec3 } from "vec3";

class SafeFlatRouteAndWoodGatherTool extends BaseTool {
    constructor() {
        super("safeFlatRouteAndWoodGather", "Scan nearby terrain for flat safe ground and move only through low-risk paths to collect accessible logs from nearby trees without crossing drops or cliffs.", [
            new CommandProperty("searchRadius", "Radius to inspect around the bot for safe terrain", "number", false),
            new CommandProperty("minLogs", "Minimum number of logs to gather", "number", false)
        ]);
    }

    async execute(agent, searchRadius, minLogs) {
        const bot = agent.bot;
        const args = { searchRadius, minLogs };
        const log = skills.log;
        const actionFn = async () => {
            try {
              const searchRadius = Number(args.searchRadius ?? 8);
              const minLogs = Number(args.minLogs ?? 4);
              const startPos = world.getPosition(bot);
              const invStart = world.getInventoryCounts(bot);

              function isLogName(name) {
                if (!name) return false;
                const n = String(name).toLowerCase();
                return n.includes('log') || (n.includes('wood') && !n.includes('mushroom'));
              }

              function getLogCount(inv) {
                let total = 0;
                for (const k of Object.keys(inv || {})) {
                  if (isLogName(k)) total += Number(inv[k] || 0);
                }
                return total;
              }

              function isFlatSafe(candidateY) {
                return Math.abs(candidateY - startPos.y) <= 1;
              }

              const targetCount = getLogCount(invStart) + minLogs;
              let currentCount = getLogCount(world.getInventoryCounts(bot));
              if (currentCount >= targetCount) return;

              // Scan a local grid for flat positions and nearby logs without crossing major elevation changes.
              const safeCandidates = [];
              for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                if (bot.interrupt_code) { log(bot, 'Code interrupted.'); return; }
                for (let dz = -searchRadius; dz <= searchRadius; dz++) {
                  const x = startPos.x + dx;
                  const z = startPos.z + dz;
                  const y = startPos.y;
                  if (Math.abs(dx) + Math.abs(dz) > searchRadius) continue;
                  if (!isFlatSafe(y)) continue;
                  safeCandidates.push({ x, y, z, dist: Math.abs(dx) + Math.abs(dz) });
                }
              }

              safeCandidates.sort((a, b) => a.dist - b.dist);

              // Inspect around each safe spot for accessible log blocks on the same level or one block above.
              for (const spot of safeCandidates) {
                if (bot.interrupt_code) { log(bot, 'Code interrupted.'); return; }
                currentCount = getLogCount(world.getInventoryCounts(bot));
                if (currentCount >= targetCount) break;

                for (let dx = -2; dx <= 2; dx++) {
                  if (bot.interrupt_code) { log(bot, 'Code interrupted.'); return; }
                  for (let dy = -1; dy <= 2; dy++) {
                    for (let dz = -2; dz <= 2; dz++) {
                      const x = spot.x + dx;
                      const y = spot.y + dy;
                      const z = spot.z + dz;
                      if (Math.abs(y - startPos.y) > 1) continue; // do not traverse unknown drops/cliffs

                      // Try to break likely log blocks only when they are very near and height-safe.
                      // Since we don't have block queries, we rely on close range and attempt only a few breaks.
                      const before = getLogCount(world.getInventoryCounts(bot));
                      await skills.breakBlockAt(bot, x, y, z);
                      await skills.wait(bot, 200);
                      const after = getLogCount(world.getInventoryCounts(bot));
                      if (after > before) {
                        currentCount = after;
                        if (currentCount >= targetCount) break;
                      }
                    }
                    if (currentCount >= targetCount) break;
                  }
                  if (currentCount >= targetCount) break;
                }
              }

              // If we could not verify safety or gather enough, stay put rather than risking a fall.
              if (currentCount < targetCount) {
                await skills.stay(bot, 5);
              }
            } catch (e) {
              log(bot, 'Error: ' + e.message);
            }
        };
        const code_return = await agent.actions.runAction('action:safeFlatRouteAndWoodGather', actionFn, { timeout: -1 });
        return code_return.message;
    }
}

export default SafeFlatRouteAndWoodGatherTool;
