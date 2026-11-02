// Opt-in integration check: a separate vanilla world and port, with no model API calls.
// node tests/live/mining_scenarios.js [--port=55918]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import rootSettings from '../../settings.js';
import { setSettings } from '../../src/agent/settings.js';

const port = Number(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || 55918);
const dir = path.resolve(`server_data/verification-${Date.now()}`);
const jar = path.resolve(process.env.MC_TEST_SERVER_JAR || 'server_data/local-test/server.jar');
if (!existsSync(jar)) throw new Error('Set MC_TEST_SERVER_JAR to a Minecraft Java 1.21.11 server jar.');
mkdirSync(dir, {recursive:true});
writeFileSync(path.join(dir,'eula.txt'),'eula=true\n');
writeFileSync(path.join(dir,'server.properties'), `server-ip=127.0.0.1\nserver-port=${port}\nonline-mode=false\nenforce-secure-profile=false\nlevel-type=minecraft:flat\ngamemode=survival\ndifficulty=peaceful\nspawn-protection=0\nview-distance=3\nsimulation-distance=3\nmax-tick-time=120000\npause-when-empty-seconds=0\n`);
const java=process.env.MC_TEST_JAVA || '/usr/lib/jvm/java-21-openjdk-amd64/bin/java';
const server=spawn(java,['-Djava.net.preferIPv4Stack=true','-Xms256M','-Xmx1G','-jar',jar,'nogui'],{cwd:dir,stdio:['pipe','pipe','pipe']});
let log='',bot;
const results=[];
server.stdout.on('data',data=>{log+=data;});
server.stderr.on('data',data=>{log+=data;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check, timeout=30000) {
    const start=Date.now();
    while(!check()) {
        if(Date.now()-start>timeout) throw new Error(`Timed out. Server log: ${log.slice(-1800)}`);
        await delay(50);
    }
}
async function command(text) {server.stdin.write(`${text}\n`);await delay(180);}
async function scenario(name, fn) {
    const started=Date.now();
    await fn();
    const result={name,status:'passed',durationMs:Date.now()-started};results.push(result);console.log(JSON.stringify(result));
}
try {
    await waitFor(()=>log.includes('Done ('),90000);
    setSettings({...rootSettings,host:'127.0.0.1',port,minecraft_version:'1.21.11',auth:'offline'});
    const {initBot}=await import('../../src/utils/mcdata.js');
    const {ActionManager}=await import('../../src/agent/action_manager.js');
    const {collectBlockResult,smeltItem}=await import('../../src/agent/library/skills.js');
    bot=initBot('CEVerification');
    bot.on('error',error=>console.error('Bot error:',error.message));
    await once(bot,'spawn');
    bot.modes={pause:()=>{},unpause:()=>{},isOn:()=>false};
    const agent={bot,clearBotLogs:()=>{bot.output='';bot.interrupt_code=false;},requestInterrupt:()=>{
        bot.interrupt_code=true;bot.stopDigging();bot.pathfinder.setGoal(null);bot.clearControlStates();
    }};
    agent.actions=new ActionManager(agent);
    bot.on('mining_progress',({message})=>agent.actions.reportProgress(message));
    await command('fill -12 69 -12 12 69 12 stone');
    await command('fill -12 70 -12 12 77 12 air');
    await command('tp CEVerification 0.5 70 0.5');
    await command('give CEVerification diamond_pickaxe');
    await command('give CEVerification iron_axe');
    await command('give CEVerification dirt 32');
    await delay(700);
    const mine=(type,n)=>agent.actions.runAction(`verify:${type}`,()=>collectBlockResult(bot,type,n),{timeout:1});
    await scenario('vertical logs: confirmed breaks and collected drops',async()=>{
        await command('fill 2 70 0 2 73 0 oak_log');
        const result=await mine('oak_log',4);
        assert.equal(result.status,'ok',result.text);assert.equal(result.broken,4);assert.ok(result.gains.oak_log>=4,result.text);
    });
    await scenario('a floating log directly above the player is reachable without scaffolding',async()=>{
        await command('tp CEVerification 2.5 70 0.5');await command('setblock 2 73 0 oak_log');
        const result=await mine('oak_log',1);
        assert.equal(result.status,'ok',result.text);assert.equal(result.broken,1);assert.equal(result.gains.oak_log,1);
    });
    await scenario('iron and deepslate iron: visible and buried targets',async()=>{
        await command('tp CEVerification 0.5 70 0.5');
        await command('setblock 3 70 0 iron_ore');
        await command('fill 5 70 -1 7 72 1 stone');
        await command('setblock 6 71 0 deepslate_iron_ore');
        const result=await mine('iron_ore',2);
        assert.equal(result.status,'ok',result.text);assert.equal(result.broken,2);assert.ok(result.gains.raw_iron>=2,result.text);
    });
    await scenario('obsidian with unenchanted diamond pick',async()=>{
        await command('tp CEVerification 0.5 70 0.5');
        await command('setblock 2 70 1 obsidian');
        const result=await mine('obsidian',1);
        assert.equal(result.status,'ok',result.text);assert.equal(result.gains.obsidian,1);
    });
    await scenario('interruption mid-obsidian stays connected and permits a new action',async()=>{
        await command('setblock 2 70 1 obsidian');
        const pending=mine('obsidian',1);
        await waitFor(()=>bot.targetDigBlock?.name==='obsidian');
        await agent.actions.stop();
        assert.equal((await pending).status,'cancelled');
        await delay(500);
        assert.equal(bot._client.state,'play');
        const result=await mine('obsidian',1);assert.equal(result.status,'ok',result.text);
    });
    await scenario('enchanted pick applies its actual mining speed',async()=>{
        await command('setblock 2 70 1 obsidian');
        const target=bot.findBlock({matching:bot.registry.blocksByName.obsidian.id,maxDistance:8});
        await bot.tool.equipForBlock(target);
        await command('enchant CEVerification efficiency 5');
        await delay(300);
        assert.ok(bot.digTime(target)<3000,`Unexpected enchanted dig time: ${bot.digTime(target)}`);
        const result=await mine('obsidian',1);assert.equal(result.status,'ok',result.text);
    });
    await scenario('smelting updates inventory without restarting the bot',async()=>{
        await command('tp CEVerification 0.5 70 0.5');
        await command('setblock 1 70 2 furnace');await command('give CEVerification coal 2');
        const before=bot.inventory.items().filter(i=>i.name==='iron_ingot').reduce((n,i)=>n+i.count,0);
        const result=await agent.actions.runAction('verify:smelt',()=>smeltItem(bot,'raw_iron',2),{timeout:1});
        assert.equal(result.status,'ok',result.text);
        const after=bot.inventory.items().filter(i=>i.name==='iron_ingot').reduce((n,i)=>n+i.count,0);
        assert.equal(after-before,2);assert.equal(bot._client.state,'play');
    });
    console.log(JSON.stringify({status:'passed',scenarios:results.length,resultsDirectory:dir}));
} catch(error) {
    results.push({status:'failed',error:error.stack});console.error(error);process.exitCode=1;
} finally {
    bot?.quit();
    if(server.exitCode===null) {
        server.stdin.write('stop\n');
        const forced=setTimeout(()=>server.kill('SIGTERM'),15000);
        await once(server,'exit');clearTimeout(forced);
    }
    writeFileSync(path.join(dir,'results.json'),JSON.stringify(results,null,2));
}
