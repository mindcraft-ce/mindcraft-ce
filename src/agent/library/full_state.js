import { 
    getPosition,
    getBiomeName,
    getNearbyPlayerNames,
    getInventoryCounts,
    getNearbyEntityTypes,
    getBlockAtPosition,
    getFirstBlockAboveHead
} from "./world.js";
import convoManager from '../conversation.js';
import { narrationConfig } from '../narration.js';

export function getFullState(agent) {
    const bot = agent.bot;

    const pos = getPosition(bot);
    const position = {
        x: Number(pos.x.toFixed(2)),
        y: Number(pos.y.toFixed(2)),
        z: Number(pos.z.toFixed(2))
    };

    let weather = 'Clear';
    if (bot.thunderState > 0) weather = 'Thunderstorm';
    else if (bot.rainState > 0) weather = 'Rain';

    let timeLabel = 'Night';
    if (bot.time.timeOfDay < 6000) timeLabel = 'Morning';
    else if (bot.time.timeOfDay < 12000) timeLabel = 'Afternoon';

    const below = getBlockAtPosition(bot, 0, -1, 0).name;
    const legs = getBlockAtPosition(bot, 0, 0, 0).name;
    const head = getBlockAtPosition(bot, 0, 1, 0).name;

    let players = getNearbyPlayerNames(bot);
    let bots = convoManager.getInGameAgents().filter(b => b !== agent.name);
    players = players.filter(p => !bots.includes(p));

    const helmet = bot.inventory.slots[5];
    const chestplate = bot.inventory.slots[6];
    const leggings = bot.inventory.slots[7];
    const boots = bot.inventory.slots[8];

    // A native loop stays busy between physical actions. Show thinking separately
    // so the dashboard agrees with the activity used by automatic behaviors.
    let activity;
    if (!agent.isIdle()) {
        activity = agent.actions.executing
            ? {current:agent.actions.currentActionLabel || 'Acting',kind:'acting'}
            : {current:'Thinking',kind:'thinking'};
    } else if (convoManager.inConversation()) {
        const who = convoManager.activeConversation?.name;
        activity = { current: who ? `Chatting with ${who}` : 'Chatting', kind: 'chatting' };
    } else if (agent.self_prompter.isStopped()) {
        activity = { current: 'Stopped', kind: 'stopped' };   // self-prompter OFF: won't act on its own
    } else if (agent.self_prompter.isPaused()) {
        activity = { current: 'Chatting', kind: 'chatting' };
    } else if (agent.self_prompter.isActive()) {
        activity = { current: 'Thinking', kind: 'thinking' }; // self-prompting between actions
    } else {
        activity = { current: 'Idle', kind: 'idle' };
    }

    const state = {
        name: agent.name,
        agentSystem: {
            nativeTools: agent.prompter.use_tools,
            brainEnabled: agent.prompter.use_brain,
            narration: narrationConfig(agent.prompter.profile).mode,
            models: {brain:agent.prompter.brain_model?.model_name,task:agent.agentSystem?.task.model?.model_name || agent.prompter.task_model?.model_name,
                rp:agent.prompter.rp_model?.model_name},
            directive: agent.agentSystem?.currentDirective || null,
            lastOutcome: agent.agentSystem?.lastDirective?.outcome || null,
            goals: agent.agentSystem?.brain.goals.listGoals() || [],
            decisions: agent.decisions?.snapshot(),
            usage: agent.prompter.usage?.snapshot(),
        },
        gameplay: {
            position,
            dimension: bot.game.dimension,
            gamemode: bot.game.gameMode,
            health: Math.round(bot.health),
            hunger: Math.round(bot.food),
            biome: getBiomeName(bot),
            weather,
            timeOfDay: bot.time.timeOfDay,
            timeLabel
        },
        action: {
            current: activity.current,
            kind: activity.kind,
            isIdle: agent.isIdle()
        },
        surroundings: {
            below,
            legs,
            head,
            firstBlockAboveHead: getFirstBlockAboveHead(bot, null, 32)
        },
        inventory: {
            counts: getInventoryCounts(bot),
            stacksUsed: bot.inventory.items().length,
            totalSlots: bot.inventory.slots.length,
            equipment: {
                helmet: helmet ? helmet.name : null,
                chestplate: chestplate ? chestplate.name : null,
                leggings: leggings ? leggings.name : null,
                boots: boots ? boots.name : null,
                mainHand: bot.heldItem ? bot.heldItem.name : null
            }
        },
        nearby: {
            humanPlayers: players,
            botPlayers: bots,
            entityTypes: getNearbyEntityTypes(bot).filter(t => t !== 'player' && t !== 'item'),
        },
        modes: {
            summary: bot.modes.getMiniDocs()
        }
    };

    return state;
}
