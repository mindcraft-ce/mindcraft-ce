import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';
import settings from '../../settings.js'
import convoManager from './conversation.js';

async function say(agent, message) {
    agent.bot.modes.behavior_log += message + '\n';
    if (agent.shut_up || !settings.narrate_behavior) return;
    agent.openChat(message);
}

// a mode is a function that is called every tick to respond immediately to the world
// it has the following fields:
// on: whether 'update' is called every tick
// active: whether an action has been triggered by the mode and hasn't yet finished
// paused: whether the mode is paused by another action that overrides the behavior (eg followplayer implements its own self defense)
// update: the function that is called every tick (if on is true)
// when a mode is active, it will trigger an action to be performed but won't wait for it to return output

// the order of this list matters! first modes will be prioritized
// while update functions are async, they should *not* be awaited longer than ~100ms as it will block the update loop
// to perform longer actions, use the execute function which won't block the update loop
const modes_list = [
    {
        name: 'self_preservation',
        description: 'Respond to drowning, burning, and damage at low health. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        fall_blocks: ['sand', 'gravel', 'concrete_powder'], // includes matching substrings like 'sandstone' and 'red_sand'
        update: async function (agent) {
            const bot = agent.bot;
            let block = bot.blockAt(bot.entity.position);
            let blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 0));
            if (!block) block = {name: 'air'}; // hacky fix when blocks are not loaded
            if (!blockAbove) blockAbove = {name: 'air'};
            
            // Enhanced jump control for pillaring and swimming
            const shouldJumpForSwimming = (blockAbove.name === 'water' || blockAbove.name === 'flowing_water') && !bot.pathfinder.goal;
            
            // Jump for pillaring ONLY when we need to go straight up (not during bridging)
            let shouldJumpForPillaring = false;
            if (bot.pathfinder.goal && bot.pathfinder.movements && bot.pathfinder.movements.allow1by1towers) {
                const currentGoal = bot.pathfinder.goal;
                const botPos = bot.entity.position;
                
                // Check if goal is significantly above us (pillaring scenario)
                let goalY = null;
                if (currentGoal.goalPosition) {
                    goalY = currentGoal.goalPosition.y;
                } else if (currentGoal.y !== undefined) {
                    goalY = currentGoal.y;
                } else if (currentGoal.entity && currentGoal.entity.position) {
                    goalY = currentGoal.entity.position.y;
                }
                
                if (goalY !== null && goalY > botPos.y + 2) {
                    // Check if we're roughly horizontally aligned (within 2 blocks)
                    let horizontalDistance = 999;
                    if (currentGoal.goalPosition) {
                        horizontalDistance = Math.sqrt(
                            Math.pow(currentGoal.goalPosition.x - botPos.x, 2) + 
                            Math.pow(currentGoal.goalPosition.z - botPos.z, 2)
                        );
                    } else if (currentGoal.x !== undefined && currentGoal.z !== undefined) {
                        horizontalDistance = Math.sqrt(
                            Math.pow(currentGoal.x - botPos.x, 2) + 
                            Math.pow(currentGoal.z - botPos.z, 2)
                        );
                    } else if (currentGoal.entity && currentGoal.entity.position) {
                        horizontalDistance = Math.sqrt(
                            Math.pow(currentGoal.entity.position.x - botPos.x, 2) + 
                            Math.pow(currentGoal.entity.position.z - botPos.z, 2)
                        );
                    }
                    
                    // Only pillar if we're close horizontally (within 3 blocks) - this means we need to go UP, not sideways
                    if (horizontalDistance <= 3) {
                        shouldJumpForPillaring = true;
                    }
                }
            }
            
            if (shouldJumpForSwimming || shouldJumpForPillaring) {
                bot.setControlState('jump', true);
                
                // If pillaring, also try to place blocks below feet
                // Use a non-blocking async call that doesn't interrupt other actions
                if (shouldJumpForPillaring) {
                    // Don't use execute() here since it would interrupt pathfinding
                    // Instead, run pillaring assistance in background without interrupting
                    if (!agent.bot._pillaringAssistanceRunning) {
                        agent.bot._pillaringAssistanceRunning = true;
                        skills.assistPillaring(bot).finally(() => {
                            agent.bot._pillaringAssistanceRunning = false;
                        });
                    }
                }
            }
            else if (this.fall_blocks.some(name => blockAbove.name.includes(name))) {
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            }
            else if (block.name === 'lava' || block.name === 'flowing_lava' || block.name === 'fire' ||
                blockAbove.name === 'lava' || blockAbove.name === 'flowing_lava' || blockAbove.name === 'fire') {
                say(agent, 'I\'m on fire!'); // TODO: gets stuck in lava
                execute(this, agent, async () => {
                    let nearestWater = world.getNearestBlock(bot, 'water', 20);
                    if (nearestWater) {
                        const pos = nearestWater.position;
                        await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                        say(agent, 'Ahhhh that\'s better!');
                    }
                    else {
                        await skills.moveAway(bot, 5);
                    }
                });
            }
            else if (Date.now() - bot.lastDamageTime < 3000 && (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                say(agent, 'I\'m dying!');
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 20);
                });
            }
            else if (agent.isIdle()) {
                bot.clearControlStates(); // clear jump if not in danger or doing anything else
            }
        }
    },
    {
        name: 'unstuck',
        description: 'Attempt to get unstuck when in the same place for a while. Interrupts some actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        prev_location: null,
        distance: 2,
        stuck_time: 0,
        last_time: Date.now(),
        max_stuck_time: 20,
        prev_dig_block: null,
        update: async function (agent) {
            if (agent.isIdle()) { 
                this.prev_location = null;
                this.stuck_time = 0;
                return; // don't get stuck when idle
            }
            const bot = agent.bot;
            const cur_dig_block = bot.targetDigBlock;
            if (cur_dig_block && !this.prev_dig_block) {
                this.prev_dig_block = cur_dig_block;
            }
            if (this.prev_location && this.prev_location.distanceTo(bot.entity.position) < this.distance && cur_dig_block == this.prev_dig_block) {
                this.stuck_time += (Date.now() - this.last_time) / 1000;
            }
            else {
                this.prev_location = bot.entity.position.clone();
                this.stuck_time = 0;
                this.prev_dig_block = null;
            }
            if (this.stuck_time > this.max_stuck_time) {
                say(agent, 'I\'m stuck!');
                this.stuck_time = 0;
                execute(this, agent, async () => {
                    const crashTimeout = setTimeout(() => { agent.cleanKill("Got stuck and couldn't get unstuck") }, 10000);
                    await skills.moveAway(bot, 5);
                    clearTimeout(crashTimeout);
                    say(agent, 'I\'m free.');
                });
            }
            this.last_time = Date.now();
        }
    },
    {
        name: 'cowardice',
        description: 'Run away from enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        update: async function (agent) {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 16);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                say(agent, `Aaa! A ${enemy.name.replace("_", " ")}!`);
                execute(this, agent, async () => {
                    await skills.avoidEnemies(agent.bot, 24);
                });
            }
        }
    },
    {
        name: 'self_defense',
        description: 'Attack nearby enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        update: async function (agent) {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 8);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                say(agent, `Fighting ${enemy.name}!`);
                execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, 8);
                });
            }
        }
    },
    {
        name: 'hunting',
        description: 'Hunt nearby animals when idle.',
        interrupts: [],
        on: true,
        active: false,
        update: async function (agent) {
            // Don't hunt during user-initiated actions
            if (agent.actions.currentActionLabel && agent.actions.currentActionLabel.startsWith('action:')) {
                return;
            }
            
            const huntable = world.getNearestEntityWhere(agent.bot, entity => mc.isHuntable(entity), 8);
            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                execute(this, agent, async () => {
                    say(agent, `Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },
    {
        name: 'item_collecting',
        description: 'Collect nearby items when idle.',
        interrupts: ['action:followPlayer'], // Pause/interupt followPlayer
        on: true,
        active: false,
        wait: 2, // number of seconds to wait after noticing an item to pick it up
        prev_item: null,
        noticed_at: -1,
        update: async function (agent) {
            // Only pick up items if the path length is <= 5
            let item = await world.getNearestEntityWherePath(agent.bot, entity => entity.name === 'item', 5, 8);
            let empty_inv_slots = agent.bot.inventory.emptySlotCount();
            if (item && item !== this.prev_item && empty_inv_slots > 1) {
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                if (Date.now() - this.noticed_at > this.wait * 1000) {
                    say(agent, `Picking up item!`);
                    this.prev_item = item;
                    execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.bot);
                        // After picking up item, resume followPlayer if needed
                        if (agent._resumeFollowPlayer && agent._resumeFollowPlayer.player) {
                            await skills.followPlayer(
                                agent.bot,
                                agent._resumeFollowPlayer.player,
                                agent._resumeFollowPlayer.distance
                            );
                            agent._resumeFollowPlayer = null;
                        }
                    });
                    this.noticed_at = -1;
                }
            }
            else {
                this.noticed_at = -1;
            }
        }
    },
    {
        name: 'torch_placing',
        description: 'Place torches when idle and there are no torches nearby.',
        interrupts: ['action:followPlayer'], // Pause/interupt followPlayer
        on: true,
        active: false,
        cooldown: 5,
        last_place: Date.now(),
        update: function (agent) {
            if (agent.actions.currentActionLabel === 'action:followPlayer' && world.shouldPlaceTorch(agent.bot)) {
                // Store follow parameters for resuming
                agent._resumeFollowPlayer = {
                    player: agent._lastFollowPlayer,
                    distance: agent._lastFollowDistance
                };
                agent.actions.cancelCurrentAction('Cancelled follow to place torch');
                return;
            }
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.last_place < this.cooldown * 1000) return;
                execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                    // Resume followPlayer if it was interrupted
                    if (agent._resumeFollowPlayer && agent._resumeFollowPlayer.player) {
                        await skills.followPlayer(
                            agent.bot,
                            agent._resumeFollowPlayer.player,
                            agent._resumeFollowPlayer.distance
                        );
                        agent._resumeFollowPlayer = null;
                    }
                });
                this.last_place = Date.now();
            }
        }
    },
    {
        name: 'elbow_room',
        description: 'Move away from nearby players when idle.',
        interrupts: ['action:followPlayer'], // Pause/interupt followPlayer
        on: true,
        active: false,
        distance: 0.5,
        update: async function (agent) {
            if (agent.actions.currentActionLabel === 'action:followPlayer') {
                const player = world.getNearestEntityWhere(agent.bot, entity => entity.type === 'player', this.distance);
                if (player) {
                    // Store follow parameters for resuming
                    agent._resumeFollowPlayer = {
                        player: agent._lastFollowPlayer,
                        distance: agent._lastFollowDistance
                    };
                    agent.actions.cancelCurrentAction('Cancelled follow to make elbow room');
                }
                return;
            }
            const player = world.getNearestEntityWhere(agent.bot, entity => entity.type === 'player', this.distance);
            if (player) {
                execute(this, agent, async () => {
                    // wait a random amount of time to avoid identical movements with other bots
                    const wait_time = Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, wait_time));
                    if (player.position.distanceTo(agent.bot.entity.position) < this.distance) {
                        await skills.moveAway(agent.bot, this.distance);
                        // After moving away, resume followPlayer if needed
                        if (agent._resumeFollowPlayer && agent._resumeFollowPlayer.player) {
                            await skills.followPlayer(
                                agent.bot,
                                agent._resumeFollowPlayer.player,
                                agent._resumeFollowPlayer.distance
                            );
                            agent._resumeFollowPlayer = null;
                        }
                    }
                });
            }
        }
    },
    {
        name: 'idle_staring',
        description: 'Animation to look around at entities when idle.',
        interrupts: [],
        on: true,
        active: false,

        staring: false,
        last_entity: null,
        next_change: 0,
        update: function (agent) {
            const entity = agent.bot.nearestEntity();
            let entity_in_view = entity && entity.position.distanceTo(agent.bot.entity.position) < 10 && entity.name !== 'enderman';
            if (entity_in_view && entity !== this.last_entity) {
                this.staring = true;
                this.last_entity = entity;
                this.next_change = Date.now() + Math.random() * 1000 + 4000;
            }
            if (entity_in_view && this.staring) {
                let isbaby = entity.type !== 'player' && entity.metadata[16];
                let height = isbaby ? entity.height/2 : entity.height;
                agent.bot.lookAt(entity.position.offset(0, height, 0));
            }
            if (!entity_in_view)
                this.last_entity = null;
            if (Date.now() > this.next_change) {
                // look in random direction
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    agent.bot.look(yaw, pitch, false);
                }
                this.next_change = Date.now() + Math.random() * 10000 + 2000;
            }
        }
    },
    {
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        active: false,
        update: function (agent) { /* do nothing */ }
    }
];

async function execute(mode, agent, func, timeout=-1) {
    if (agent.self_prompter.isActive())
        agent.self_prompter.stopLoop();
    let interrupted_action = agent.actions.currentActionLabel;
    mode.active = true;
    
    let code_return;
    try {
        code_return = await agent.actions.runAction(`mode:${mode.name}`, async () => {
            await func();
        }, { timeout });
    } catch (err) {
        // Handle mode execution errors gracefully
        console.error(`Error in mode ${mode.name}:`, err.message);
        mode.active = false;
        
        // Create a mock code_return for error cases
        code_return = {
            success: false,
            message: `Mode ${mode.name} failed: ${err.message}`,
            interrupted: true,
            timedout: false
        };
    }
    
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing, code_return: ${code_return.message}`);

    let should_reprompt = 
        interrupted_action && // it interrupted a previous action
        !agent.actions.resume_func && // there is no resume function
        !agent.self_prompter.isActive() && // self prompting is not on
        !code_return.interrupted; // this mode action was not interrupted by something else

    if (should_reprompt) {
        // auto prompt to respond to the interruption
        let role = convoManager.inConversation() ? agent.last_sender : 'system';
        let logs = agent.bot.modes.flushBehaviorLog();
        agent.handleMessage(role, `(AUTO MESSAGE)Your previous action '${interrupted_action}' was interrupted by ${mode.name}.
        Your behavior log: ${logs}\nRespond accordingly.`);
    }
}

let _agent = null;
const modes_map = {};
for (let mode of modes_list) {
    modes_map[mode.name] = mode;
}

class ModeController {
    /*
    SECURITY WARNING:
    ModesController must be reference isolated. Do not store references to external objects like `agent`.
    This object is accessible by LLM generated code, so any stored references are also accessible.
    This can be used to expose sensitive information by malicious prompters.
    */
    constructor() {
        this.behavior_log = '';
    }

    exists(mode_name) {
        return modes_map[mode_name] != null;
    }

    setOn(mode_name, on) {
        modes_map[mode_name].on = on;
    }

    isOn(mode_name) {
        return modes_map[mode_name].on;
    }

    pause(mode_name) {
        modes_map[mode_name].paused = true;
    }

    unpause(mode_name) {
        modes_map[mode_name].paused = false;
    }

    unPauseAll() {
        for (let mode of modes_list) {
            if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
            mode.paused = false;
        }
    }

    getMiniDocs() { // no descriptions
        let res = 'Agent Modes:';
        for (let mode of modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on})`;
        }
        return res;
    }

    getDocs() {
        let res = 'Agent Modes:';
        for (let mode of modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on}): ${mode.description}`;
        }
        return res;
    }

    async update() {
        if (_agent.isIdle()) {
            this.unPauseAll();
        }
        for (let mode of modes_list) {
            let interruptible = mode.interrupts.some(i => i === 'all') || mode.interrupts.some(i => i === _agent.actions.currentActionLabel);
            if (mode.on && !mode.paused && !mode.active && (_agent.isIdle() || interruptible)) {
                await mode.update(_agent);
            }
            if (mode.active) break;
        }
    }

    flushBehaviorLog() {
        const log = this.behavior_log;
        this.behavior_log = '';
        return log;
    }

    getJson() {
        let res = {};
        for (let mode of modes_list) {
            res[mode.name] = mode.on;
        }
        return res;
    }

    loadJson(json) {
        for (let mode of modes_list) {
            if (json[mode.name] != undefined) {
                mode.on = json[mode.name];
            }
        }
    }
}

export function initModes(agent) {
    _agent = agent;
    // the mode controller is added to the bot object so it is accessible from anywhere the bot is used
    agent.bot.modes = new ModeController();
    if (agent.task) {
        agent.bot.restrict_to_inventory = agent.task.restrict_to_inventory;
    }
    let modes_json = agent.prompter.getInitModes();
    if (modes_json) {
        agent.bot.modes.loadJson(modes_json);
    }
}
