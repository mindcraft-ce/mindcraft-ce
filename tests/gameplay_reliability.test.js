import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import blockFactory from 'prismarine-block';
import { ActionManager } from '../src/agent/action_manager.js';
import { guardBotActions } from '../src/agent/action_context.js';
import { ProgressTracker } from '../src/agent/progress.js';
import { collectBlocks } from '../src/agent/library/mining.js';
import {getCommand} from '../src/agent/commands/index.js';
import {placeBlock,log} from '../src/agent/library/skills.js';

const require = createRequire(import.meta.url);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('overhead visibility goals measure reach from the bot eye rather than raising the target',()=>{
    const {GoalLookAtBlock}=require('mineflayer-pathfinder').goals;
    const position=new Vec3(2,73,0),world={raycast:()=>({position})};
    const goal=new GoalLookAtBlock(position,world,{reach:4});
    assert.equal(goal.isEnd(new Vec3(2,70,0)),true);
    assert.equal(goal.isEnd(new Vec3(2,66,0)),false);
});

test('modern ore speed uses effective tools while preserving harvest restrictions and ineffective tools', () => {
    for (const version of ['1.21.1', '1.21.4', '1.21.11']) {
        const mc = minecraftData(version), Block = blockFactory(version);
        const make = name => Block.fromStateId(mc.blocksByName[name].minStateId, 0);
        const diamond = mc.itemsByName.diamond_pickaxe.id;
        assert.equal(make('obsidian').digTime(diamond, false, false, false), 9400, version);
        assert.equal(make('iron_ore').digTime(diamond, false, false, false), 600, version);
        assert.ok(!make('obsidian').canHarvest(mc.itemsByName.wooden_pickaxe.id));
        assert.equal(make('oak_log').digTime(diamond, false, false, false), 3000);
        assert.ok(make('obsidian').digTime(diamond, false, true, true) > 40000);
        assert.ok(make('obsidian').digTime(diamond, false, false, false, [{name:'efficiency',lvl:5}]) < 9400);
    }
});

test('dig resolves only after an authoritative block update and abort removes listeners', async () => {
    const bot = new EventEmitter(), block = {position: new Vec3(1, 64, 1)};
    const packets = [];
    bot._client = {write: (name, packet) => packets.push(packet)};
    bot.digTime = () => 5;
    bot.swingArm = () => {};
    bot.lookAt = () => Promise.resolve();
    bot._updateBlockState = () => assert.fail('speculative air is forbidden');
    require('mineflayer/lib/plugins/digging.js')(bot);
    bot.digTime = () => 5;
    let done = false;
    const dig = bot.dig(block, 'ignore').then(() => {done = true;});
    await delay(20);
    assert.equal(done, false);
    assert.deepEqual(packets.map(p => p.status), [0,2]);
    bot.emit(`blockUpdate:${block.position}`, block, {type:0});
    await dig;
    assert.equal(bot.targetDigBlock, null);
    const next = bot.dig(block, 'ignore');
    bot.stopDigging();
    await assert.rejects(next, /aborted/);
    assert.equal(bot.listenerCount(`blockUpdate:${block.position}`), 0);
});

test('cancelled hanging actions settle without reconnect and cannot mutate a newer action', async () => {
    const bot = new EventEmitter();
    bot.output = '';
    let mutations = 0, release, rejected = false;
    bot.dig = () => {mutations++; return Promise.resolve();};
    bot.setControlState = () => {mutations++;};
    guardBotActions(bot);
    const agent = {bot, clearBotLogs: () => {bot.output='';bot.interrupt_code=false;}, requestInterrupt: () => {bot.interrupt_code=true;}};
    const manager = new ActionManager(agent);
    const first = manager.runAction('old', async () => {
        await new Promise(resolve => {release = resolve;});
        try { await bot.dig(); } catch { rejected = true; }
        bot.setControlState('forward', true);
        log(bot,'Old action says placement failed.');
    });
    while (!release) await delay(1);
    await manager.stop();
    assert.equal((await first).status, 'cancelled');
    const next = await manager.runAction('new', async () => {await bot.dig();});
    assert.equal(next.status, 'ok');
    release();
    await delay(5);
    assert.equal(rejected, true);
    assert.equal(mutations, 1);
    assert.equal(manager.executing, false);
    assert.equal(bot.output,'');
});
test('an already placed block satisfies placement without items or another click',async()=>{
    for(const [target,type] of [['torch','torch'],['wall_torch','torch'],['oak_planks','oak_planks']]) {
        const bot={output:'',modes:{isOn:()=>false},game:{gameMode:'survival'},
            blockAt:position=>({name:target,position}),inventory:{findInventoryItem:()=>assert.fail('A satisfied placement needs no item')},
            placeBlock:()=>assert.fail('An existing block must not be placed again')};
        assert.equal(await placeBlock(bot,type,1,64,2),true);
        assert.match(bot.output,/No placement needed/);
    }
});
test('a server-confirmed placement remains success even if the SDK reports an acknowledgement error',async()=>{
    let placed=false;
    const dest=new Vec3(1,64,2);
    const bot={output:'',modes:{isOn:()=>false},game:{gameMode:'survival'},entity:{position:dest.offset(0.5,0,0.5)},
        blockAt:position=>({name:position.equals(dest)?placed?'torch':'air':'stone',position}),
        inventory:{findInventoryItem:()=>({name:'torch',type:1})},equip:()=>Promise.resolve(),lookAt:()=>Promise.resolve(),
        placeBlock:()=>{placed=true;return Promise.reject(new Error('acknowledgement timed out'));}};
    assert.equal(await placeBlock(bot,'torch',dest.x,dest.y,dest.z),true);
    assert.match(bot.output,/Confirmed torch/);assert.ok(!bot.output.includes('Failed to place'));
});

test('action timeout is a failed typed result and leaves the bot connected', async () => {
    const bot = Object.assign(new EventEmitter(), {output:''});
    const manager = new ActionManager({bot,clearBotLogs:()=>{},requestInterrupt:()=>{}});
    const result = await manager.runAction('hang', () => new Promise(()=>{}), {timeout:0.0001});
    assert.equal(result.code, 'timeout');
    assert.equal(result.timedout, true);
    assert.equal(manager.executing, false);
});
test('registered actions propagate missing-resource failures to native callers',async()=>{
    const bot=Object.assign(new EventEmitter(),{output:''});
    const agent={bot,clearBotLogs:()=>{bot.output='';},requestInterrupt:()=>{}};
    // Exercise the registered action wrapper's boolean contract independently
    // from Minecraft's global data initialization (covered by the live craft).
    agent.actions={runAction:async(_name,fn)=>({status:(await fn())===false?'failed':'ok'})};
    agent.memory_bank={recallPlace:()=>null};
    const missing=await getCommand('!goToRememberedPlace').perform.structured(agent,'missing');
    assert.equal(missing.status,'failed');
});
test('action runtime carries a false skill result as a failed outcome',async()=>{
    const bot=Object.assign(new EventEmitter(),{output:''});
    const agent={bot,clearBotLogs:()=>{bot.output='';},requestInterrupt:()=>{}};
    agent.actions=new ActionManager(agent);
    const result=await agent.actions.runAction('missing',()=>Promise.resolve(false));
    assert.equal(result.status,'failed');assert.equal(result.success,false);
});

test('stationary slow digging is healthy; circling does not extend progress forever', () => {
    let now = 0;
    const progress = new ProgressTracker(() => now);
    const bot = {entity:{position:new Vec3(0,64,0)}, targetDigBlock:{name:'obsidian',position:new Vec3(0,63,0)},digTime:()=>75000};
    progress.observe(bot);
    now=45000; progress.observe(bot);
    assert.equal(progress.healthy(), true);
    now=81000; progress.observe(bot);
    assert.equal(progress.healthy(), false);
    bot.targetDigBlock=null;
    progress.reset();
    for (now=82000;now<112000;now+=1000) {bot.entity.position.x = now%2000 ? 0 : 1; progress.observe(bot);}
    assert.equal(progress.healthy(), false);
});

function mineFixture(failFirst = false) {
    const bot = Object.assign(new EventEmitter(), {interrupt_code:false,game:{gameMode:'survival'},world:{},heldItem:{type:1}});
    const blocks = [0,1,2].map(x=>({name:'oak_log',type:1,metadata:0,position:new Vec3(x,64,0),canHarvest:()=>true}));
    const remaining=new Set(blocks), items=[];
    let calls=0,fail=failFirst;
    bot.inventory={items:()=>items};
    bot.blockAt=pos=>blocks.find(b=>remaining.has(b)&&b.position.equals(pos))||{type:0,name:'air'};
    bot.pathfinder={goto:()=>Promise.resolve(),setGoal:()=>{}};
    bot.tool={equipForBlock:()=>Promise.resolve()};
    bot.digTime=()=>10;bot.stopDigging=()=>{};
    bot.dig=block=>{
        calls++;
        if(fail&&block===blocks[0]) return Promise.reject(new Error('out of reach'));
        remaining.delete(block);items.push({name:'oak_log',count:1});return Promise.resolve();
    };
    return {bot,blocks,setFailure:value=>{fail=value;},options:{find:predicate=>blocks.filter(b=>remaining.has(b)&&predicate(b)),pickup:()=>Promise.resolve()},calls:()=>calls};
}

test('mining accounts for requested blocks and actual drops', async () => {
    const {bot,options}=mineFixture();
    const result=await collectBlocks(bot,'oak_log',2,options);
    assert.equal(result.status,'ok');assert.equal(result.broken,2);assert.equal(result.gains.oak_log,2);
});

test('repeated unreachable target is skipped boundedly while other blocks can be collected', async () => {
    const {bot,options,calls}=mineFixture(true);
    const result=await collectBlocks(bot,'oak_log',2,options);
    assert.equal(result.status,'ok');assert.equal(result.broken,2);assert.equal(calls(),4);
});

test('a resolved dig with no world change is not reported as a successful block break', async () => {
    const {bot,options}=mineFixture();bot.dig=()=>Promise.resolve();
    const result=await collectBlocks(bot,'oak_log',1,options);
    assert.equal(result.broken,0);assert.equal(result.status,'blocked');
});
test('temporarily skipped coordinates become available after cooldown or a changed block',async()=>{
    for(const changed of [false,true]) {
        let now=100;
        const {bot,blocks,setFailure,options}=mineFixture(true);options.now=()=>now;
        const partial=await collectBlocks(bot,'oak_log',3,options);assert.equal(partial.status,'partial');
        setFailure(false);
        assert.equal((await collectBlocks(bot,'oak_log',1,options)).status,'blocked');
        if(changed) blocks[0].stateId=8;else now+=30001;
        assert.equal((await collectBlocks(bot,'oak_log',1,options)).status,'ok');
    }
});
test('confirmed breaks with missing target drops report partial progress',async()=>{
    const {bot,options}=mineFixture();const dig=bot.dig;
    bot.dig=async block=>{await dig(block);bot.inventory.items=()=>[];};
    const result=await collectBlocks(bot,'oak_log',1,options);
    assert.equal(result.status,'partial');assert.equal(result.broken,1);assert.match(result.blocker,/drops were not acquired/);
});
test('liquid collection recognizes filled buckets as the acquired resource',async()=>{
    const {bot}=mineFixture();let filled=false;
    bot.inventory.items=()=>filled?[{name:'water_bucket',count:1}]:[];
    const result=await collectBlocks(bot,'water',1,{find:()=>[{name:'water',type:8,metadata:0,position:new Vec3(1,64,0)}],
        liquid:()=>{filled=true;return Promise.resolve(true);},pickup:()=>Promise.resolve()});
    assert.equal(result.status,'ok');assert.equal(result.gains.water_bucket,1);
});
