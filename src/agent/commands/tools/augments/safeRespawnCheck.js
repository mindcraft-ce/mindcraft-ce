import BaseTool from "../../base_tool.js";
import CommandProperty from "../../property.js";
import * as skills from "../../../library/skills.js";
import * as world from "../../../library/world.js";
import { Vec3 } from "vec3";

class SafeRespawnCheckTool extends BaseTool {
    constructor() {
        super("safeRespawnCheck", "Safely assess whether the bot is inside or adjacent to a collision after respawn, then move only if a clearly open escape path exists.", [
            new CommandProperty("action", "One of: assess, escape, stay", "string", true),
            new CommandProperty("preferredDirection", "Optional escape direction such as up, down, surface, away", "string", false)
        ]);
    }

    async execute(agent, action, preferredDirection) {
        const bot = agent.bot;
        const args = { action, preferredDirection };
        const log = skills.log;
        const actionFn = async () => {
            try {
              const action = String(args.action || "assess").toLowerCase();
              const preferredDirection = String(args.preferredDirection || "").toLowerCase();

              if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }

              // Lightweight state snapshot using only available safe APIs.
              let craftables = [];
              let inventoryGuess = [];
              try {
                craftables = world.getCraftableItems(bot) || [];
              } catch (e) {
                craftables = [];
              }

              let nearbyCleared = false;
              try {
                nearbyCleared = await skills.pickupNearbyItems(bot);
              } catch (e) {
                nearbyCleared = false;
              }

              // Attempt to infer a safe posture from available signals without pathing to old locations.
              let embeddedRisk = false;
              let inventoryRisk = false;

              if (Array.isArray(craftables) && craftables.length > 0) {
                inventoryRisk = false;
              }

              // If we can inspect common bot stats directly, do so conservatively.
              try {
                const pos = bot.entity && bot.entity.position ? bot.entity.position : null;
                const headPos = bot.entity && bot.entity.position ? new Vec3(Math.floor(bot.entity.position.x), Math.floor(bot.entity.position.y + 1), Math.floor(bot.entity.position.z)) : null;
                const feetPos = bot.entity && bot.entity.position ? new Vec3(Math.floor(bot.entity.position.x), Math.floor(bot.entity.position.y), Math.floor(bot.entity.position.z)) : null;
                if (pos && headPos && feetPos) {
                  const headClear = await world.isClearPath(bot, headPos);
                  const feetClear = await world.isClearPath(bot, feetPos);
                  embeddedRisk = !(headClear && feetClear);
                }
              } catch (e) {
                embeddedRisk = true;
              }

              const risky = embeddedRisk || inventoryRisk;

              if (action === "stay" || action === "assess") {
                log(bot, risky ? "Respawn assessment: conservative hold position." : "Respawn assessment: no obvious collision risk.");
                return;
              }

              if (action !== "escape") {
                log(bot, "Respawn helper: invalid action, holding position.");
                return;
              }

              if (!risky) {
                log(bot, "Respawn escape skipped: no clear evidence of collision risk.");
                return;
              }

              // Conservative escape strategy: only move if a clear path exists.
              const tryDirections = [];
              if (preferredDirection) tryDirections.push(preferredDirection);
              if (!tryDirections.includes("up")) tryDirections.push("up");
              if (!tryDirections.includes("surface")) tryDirections.push("surface");
              if (!tryDirections.includes("away")) tryDirections.push("away");
              if (!tryDirections.includes("stay")) tryDirections.push("stay");

              let escaped = false;
              for (let i = 0; i < tryDirections.length; i++) {
                if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }
                const dir = tryDirections[i];

                if (dir === "stay") {
                  await skills.wait(bot, 250);
                  continue;
                }

                // Probe for open space around current location before any move attempt.
                let target = null;
                try {
                  const p = bot.entity && bot.entity.position ? bot.entity.position : null;
                  if (!p) continue;
                  const x = Math.floor(p.x);
                  const y = Math.floor(p.y);
                  const z = Math.floor(p.z);

                  if (dir === "up" || dir === "surface") {
                    target = new Vec3(x, y + 1, z);
                  } else if (dir === "away") {
                    target = new Vec3(x + 1, y, z);
                  } else if (dir === "down") {
                    target = new Vec3(x, y - 1, z);
                  } else {
                    target = new Vec3(x, y, z);
                  }
                } catch (e) {
                  target = null;
                }

                if (!target) continue;

                let clear = false;
                try {
                  clear = await world.isClearPath(bot, target);
                } catch (e) {
                  clear = false;
                }
                if (!clear) continue;

                if (dir === "up" || dir === "surface") {
                  // Very conservative: only approach the nearest high-up block if path is clear.
                  const moved = await skills.goToNearestBlock(bot, "air", 1, 6);
                  if (moved) {
                    escaped = true;
                    break;
                  }
                } else if (dir === "away") {
                  // Without a safe directional pathing primitive, just wait and reassess rather than guess.
                  await skills.wait(bot, 250);
                  escaped = true;
                  break;
                } else if (dir === "down") {
                  // Never force downward movement during suffocation recovery.
                  continue;
                }
              }

              if (!escaped) {
                log(bot, "Respawn escape: no clearly open escape path found; staying put.");
              }
            } catch (e) {
              log(bot, "Error: " + e.message);
            }
        };
        const code_return = await agent.actions.runAction('action:safeRespawnCheck', actionFn, { timeout: -1 });
        return code_return.message;
    }
}

export default SafeRespawnCheckTool;
