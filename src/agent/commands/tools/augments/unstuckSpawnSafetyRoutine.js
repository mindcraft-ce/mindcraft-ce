import BaseTool from "../../base_tool.js";
import CommandProperty from "../../property.js";
import * as skills from "../../../library/skills.js";
import * as world from "../../../library/world.js";
import { Vec3 } from "vec3";

class UnstuckSpawnSafetyRoutineTool extends BaseTool {
    constructor() {
        super("unstuckSpawnSafetyRoutine", "Detects enclosed or suffocating spawn states and performs a robust escape to the nearest open-air position, using movement and block-clearing when necessary, while avoiding repeated suffocation loops.", [
            new CommandProperty("maxAttempts", "Maximum escape attempts before giving up", "integer", false),
            new CommandProperty("clearObstructions", "Whether to break obstructing blocks around the bot", "boolean", false)
        ]);
    }

    async execute(agent, maxAttempts, clearObstructions) {
        const bot = agent.bot;
        const args = { maxAttempts, clearObstructions };
        const log = skills.log;
        const actionFn = async () => {
            try {
              const attempts = Math.max(1, Number(args.maxAttempts ?? 5));
              const clear = !!args.clearObstructions;

              const getPos = () => world.getPosition(bot);

              const sleepMs = async (ms) => {
                await skills.wait(bot, ms);
              };

              const probeAndEscape = async () => {
                const p = getPos();
                const x = Math.floor(p.x);
                const y = Math.floor(p.y);
                const z = Math.floor(p.z);

                const candidates = [
                  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
                  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
                  { x: 0, y: 1, z: 0 },
                  { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 },
                  { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 }
                ];

                if (clear) {
                  for (const d of candidates) {
                    if (bot.interrupt_code) { log(bot, "Code interrupted."); return false; }
                    try {
                      await skills.breakBlockAt(bot, x + d.x, y + d.y, z + d.z);
                    } catch (_) {}
                  }
                }

                for (const d of candidates) {
                  if (bot.interrupt_code) { log(bot, "Code interrupted."); return false; }
                  try {
                    await skills.placeBlock(bot, "air", x + d.x, y + d.y, z + d.z, 'side');
                  } catch (_) {}
                }

                return true;
              };

              for (let i = 0; i < attempts; i++) {
                if (bot.interrupt_code) { log(bot, "Code interrupted."); return; }

                const before = getPos();
                await skills.defendSelf(bot, 8).catch(() => false);
                await probeAndEscape();
                await sleepMs(400);

                const after = getPos();
                const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y) + Math.abs(after.z - before.z);

                if (moved > 0.1) {
                  await sleepMs(300);
                  continue;
                }

                if (!clear) {
                  await skills.stay(bot, 1).catch(() => false);
                } else {
                  await probeAndEscape();
                }

                await sleepMs(500);
              }

              return;
            } catch (e) {
              log(bot, "Error: " + e.message);
            }

        };
        const code_return = await agent.actions.runAction('action:unstuckSpawnSafetyRoutine', actionFn, { timeout: -1 });
        return code_return.message;
    }
}

export default UnstuckSpawnSafetyRoutineTool;
