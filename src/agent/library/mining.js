import pf from 'mineflayer-pathfinder';
import { actionContext, assertActionOwner, cancellable } from '../action_context.js';
import { toolResult } from '../tool_result.js';

const failures = new WeakMap();
const counts = bot => Object.fromEntries(bot.inventory.items().map(i => [i.name,
    bot.inventory.items().filter(x => x.name === i.name).reduce((sum, x) => sum + x.count, 0)]));

export function blockTypes(type) {
    const types = new Set([type]);
    if (['coal', 'diamond', 'emerald', 'iron', 'gold', 'lapis_lazuli', 'redstone'].includes(type)) types.add(`${type}_ore`);
    for (const name of [...types]) if (name.endsWith('_ore') && !name.startsWith('deepslate_')) types.add(`deepslate_${name}`);
    if (type === 'dirt') types.add('grass_block');
    if (type === 'cobblestone') types.add('stone');
    return types;
}

export async function collectBlocks(bot, type, requested, {find, pickup, liquid, afterBreak, exclude = [], now = Date.now} = {}) {
    if (!Number.isSafeInteger(requested) || requested < 1) return toolResult('failed', 'Block count must be a positive integer.', 'bad_args');
    const before = counts(bot);
    const types = blockTypes(type);
    const excluded = new Set((exclude || []).map(p => p.toString()));
    const failed = failures.get(bot) || new Map();
    failures.set(bot, failed);
    for (const [key, info] of failed) {
        const current=info.position&&bot.blockAt(info.position);
        if (now()-info.at>30000 || (current&&(current.stateId??current.type)!==info.state)) failed.delete(key);
    }
    let broken = 0, attempts = 0, blocker = '';
    const confirmed = new Set();
    const attemptedPositions = new Set();
    const perTarget = new Map();
    const interrupt = () => bot.interrupt_code || actionContext(bot)?.signal.aborted;
    const report = message => bot.emit('mining_progress', {message, broken, requested, type});
    const onBlockUpdate = (oldBlock, newBlock) => {
        if (!oldBlock?.position || !types.has(oldBlock.name) || oldBlock.type === newBlock?.type) return;
        const key = oldBlock.position.toString();
        if (!attemptedPositions.has(key)) return;
        if (!confirmed.has(key)) { confirmed.add(key); excluded.add(key); broken++; }
    };
    bot.on('blockUpdate', onBlockUpdate);
    const onDigTarget = block => {
        if (block?.position && types.has(block.name)) attemptedPositions.add(block.position.toString());
    };
    bot.on('action_dig_target', onDigTarget);
    try {
    while (broken < requested && attempts++ < Math.max(6, requested * 4)) {
        if (interrupt()) break;
        assertActionOwner(bot);
        const blocks = find(block => types.has(block.name) && (!block.position || (!excluded.has(block.position.toString()) &&
            !failed.has(block.position.toString()))) && (type !== 'water' && type !== 'lava' || block.metadata === 0))
            .filter(block => block.position && !excluded.has(block.position.toString()) && !failed.has(block.position.toString()));
        const target = blocks[0];
        if (!target) { blocker ||= `No reachable ${type} found nearby.`; break; }
        const key = target.position.toString();
        perTarget.set(key, (perTarget.get(key) || 0) + 1);
        try {
            report(`Approaching ${type}; collected ${broken} of ${requested}.`);
            if (type === 'water' || type === 'lava') {
                if (!await liquid(target)) throw new Error('A bucket and reachable source block are required.');
            } else {
                // Require a visible face in normal reach. Buried ore first needs a route
                // next to it; retry the visibility goal after tunnelling, never dig blind.
                const goal = new pf.goals.GoalLookAtBlock(target.position, bot.world, {reach: 4.0});
                try {
                    await cancellable(bot, () => bot.pathfinder.goto(goal), 20000, () => bot.pathfinder.setGoal(null));
                } catch (error) {
                    assertActionOwner(bot);
                    if (error.name !== 'NoPath') throw error;
                    await cancellable(bot, () => bot.pathfinder.goto(new pf.goals.GoalGetToBlock(target.position.x, target.position.y, target.position.z)),
                        20000, () => bot.pathfinder.setGoal(null));
                    await cancellable(bot, () => bot.pathfinder.goto(goal), 15000, () => bot.pathfinder.setGoal(null));
                }
                assertActionOwner(bot);
                const block = bot.blockAt(target.position);
                if (!block || !types.has(block.name)) { excluded.add(key); continue; }
                await bot.tool.equipForBlock(block);
                if (bot.game.gameMode !== 'creative' && !block.canHarvest(bot.heldItem?.type)) {
                    blocker = `Missing the required tool to harvest ${block.name}.`;
                    break;
                }
                report(`Mining ${block.name}; collected ${broken} of ${requested}.`);
                await cancellable(bot, () => bot.dig(block, true, 'raycast'), Math.min(bot.digTime(block), 300000) + 8000,
                    () => bot.stopDigging());
                assertActionOwner(bot);
                // The digging dependency waits for a server update, rather than predicting air.
                if (bot.blockAt(block.position)?.type === block.type) throw new Error('Server did not confirm the block break.');
                excluded.add(key);
            }
            if (!confirmed.has(key)) { confirmed.add(key); broken++; }
            report(`Broke ${broken} of ${requested} ${type}; collecting drops.`);
            await cancellable(bot, () => pickup(), 10000, () => bot.pathfinder.setGoal(null));
            if(afterBreak) await afterBreak();
            blocker = '';
        } catch (error) {
            if (interrupt()) break;
            blocker = `${type} at ${key}: ${error.message}`;
            if (perTarget.get(key) >= 2) {
                failed.set(key, {at: now(), reason: error.message,position:target.position,state:target.stateId??target.type});
                report(`Cannot reach ${type} at ${key}; trying another target.`);
            }
        }
    }
    } finally { bot.off('blockUpdate', onBlockUpdate); bot.off('action_dig_target', onDigTarget); }
    const after = counts(bot);
    const gains = Object.fromEntries(Object.entries(after).filter(([name, count]) => count > (before[name] || 0))
        .map(([name, count]) => [name, count - (before[name] || 0)]));
    const acquired = Object.entries(gains).map(([name, n]) => `${n} ${name}`).join(', ') || 'no items';
    const expected=new Set(types);
    const oreDrops={iron:'raw_iron',gold:'raw_gold',copper:'raw_copper',lapis:'lapis_lazuli',nether_quartz:'quartz',nether_gold:'gold_nugget'};
    for(const name of types) {
        const ore=name.replace(/^deepslate_/,'').replace(/_ore$/,'');
        if(name.endsWith('_ore')) expected.add(oreDrops[ore]||ore);
        for(const id of bot.registry?.blocksByName?.[name]?.drops||[]) {
            const item=bot.registry.items?.[id]?.name;if(item) expected.add(item);
        }
    }
    if(type==='cobblestone'||type==='stone') expected.add('cobblestone');
    if(type==='grass_block'||type==='dirt') expected.add('dirt');
    if(type==='water'||type==='lava') expected.add(`${type}_bucket`);
    if(broken&&bot.game.gameMode!=='creative'&&!Object.keys(gains).some(name=>expected.has(name)))
        blocker ||= 'Blocks broke, but their drops were not acquired.';
    const cancelled = interrupt();
    const status = cancelled ? 'cancelled' : broken >= requested && !blocker ? 'ok' : broken ? 'partial' : 'blocked';
    const text = `Broke ${broken}/${requested} ${type}; acquired ${acquired}.${blocker ? ` Blocker: ${blocker}` : ''}`;
    return toolResult(status, text, cancelled ? 'interrupted' : status === 'ok' ? null : 'incomplete', {broken, requested, gains, blocker});
}
