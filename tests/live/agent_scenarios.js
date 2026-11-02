// Full MindServer + Agent + vanilla-server scenarios. Defaults to recorded replies;
// --live-model explicitly uses the model configured in andy.json.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {vanillaFixture,delay,waitFor} from './vanilla_fixture.js';

const live=process.argv.includes('--live-model');
const fixture=await vanillaFixture(55918);
const name=live?'CELiveModel':'CEReplay';
const mindPort=8083;
const results=[];let child,socket,log='',state;
const messages=[];
const call=(name,args={})=>({id:`call-${Math.random().toString(16).slice(2)}`,name,arguments:args});
try {
    await fixture.command('forceload add -16 -16 16 16');
    await delay(1000);
    await fixture.command('fill -12 69 -12 12 69 12 stone');
    await fixture.command('fill -12 70 -12 12 77 12 air');
    await fixture.command('fill 2 70 0 2 73 0 oak_log');
    await fixture.command('setworldspawn 0 70 0');
    assert.ok(!fixture.log.includes('That position is not loaded'),'Fixture chunks must be loaded before construction');
    const transcript=path.join(fixture.dir,'replies.json');
    writeFileSync(transcript,JSON.stringify([
        {role:'brain',calls:[call('addGoal',{name:'crafting table',item:'crafting_table',count:1}),call('directTask',{objective:'Collect three oak logs and craft one crafting table; keep it in inventory.',model:'worker',tools:['collectBlocks','craftRecipe']})]},
        {role:'task',calls:[call('craftRecipe',{recipe_name:'crafting_table',num:1})]},
        {role:'task',text:'I am gathering the wood first.',calls:[call('collectBlocks',{type:'oak_log',num:3})]},
        {role:'task',calls:[call('craftRecipe',{recipe_name:'oak_planks',num:1})]},
        {role:'task',calls:[call('craftRecipe',{recipe_name:'crafting_table',num:1})]},
        {role:'task',calls:[call('taskDone',{summary:'Gathered logs and crafted a table.'})]},
        {role:'brain',calls:[call('completeGoal',{name:'crafting table'}),call('say',{message:'Got the logs and crafted your table.'}),call('wait')]},
        {role:'rp',text:'Got the logs and crafted your table.'},
        {role:'brain',calls:[call('directTask',{objective:'Mine the obsidian block.',tools:['collectBlocks']})]},
        {role:'task',calls:[call('collectBlocks',{type:'obsidian',num:1})]},
    ]));
    const replay={api:'replay',model:transcript};
    const profile=live?{...JSON.parse(readFileSync('andy.json','utf8')),name,embedding:false,use_brain_agent:true,use_rp_agent:true,tool_narration:'all'}:
        {name,model:replay,embedding:false,use_function_calling:true,use_brain_agent:true,use_rp_agent:true,tool_narration:'all',
            model_selection:{enabled:true,default_task_model:'worker',models:[{id:'worker',model:replay,notes:'Recorded Task endpoint'}]}};
    const profilePath=path.join(fixture.dir,'profile.json');writeFileSync(profilePath,JSON.stringify(profile));
    child=spawn(process.execPath,['main.js','--profiles',profilePath],{env:{...process.env,SETTINGS_JSON:JSON.stringify({
        host:'127.0.0.1',port:fixture.port,mindserver_port:mindPort,minecraft_version:'1.21.11',auth:'offline',init_message:'',
        num_examples:0,max_messages:100,load_memory:false,brain_check_in_seconds:60,agent_max_steps:20,agent_max_tool_calls:40,
    })},stdio:['pipe','pipe','pipe']});
    const capture=data=>{log+=data;appendFileSync(path.join(fixture.dir,'agent-log.txt'),data);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);
    await waitFor(()=>log.includes(`${name} spawned.`),30000,()=>log.slice(-2500));
    await fixture.command(`tp ${name} 0.5 70 0.5`);
    await fixture.command(`give ${name} iron_axe`);
    socket=io(`http://127.0.0.1:${mindPort}`,{reconnection:false,auth:{controlToken:process.env.MINDCRAFT_CONTROL_TOKEN}});
    socket.on('bot-output',(agent,message)=>{if(agent===name) messages.push(message);});
    socket.on('state-update',states=>{state=states[name];});
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
    socket.emit('listen-to-agents');
    const started=Date.now();
    socket.emit('send-message',name,{from:'ADMIN',message:'Collect three oak logs and craft one crafting table. Keep the table in your inventory; do not place it.'});
    await waitFor(()=>state?.inventory?.counts?.crafting_table>=1&&!state.agentSystem.directive,live?300000:90000,()=>log.slice(-3000));
    await waitFor(()=>messages.some(m=>/table/i.test(m)&&/done|complete|crafted|finished/i.test(m)),30000,()=>JSON.stringify(messages));
    results.push({name:'full Brain/Task/RP crafting goal',status:'passed',durationMs:Date.now()-started,inventory:state.inventory.counts});
    assert.ok(messages.length>=3,'Native content and per-tool narration must be visible');
    assert.equal(log.includes('full response to ADMIN: ""!'),false,'Legacy inline command path must not execute');
    if(!live) {
        const saved=JSON.parse(readFileSync(`bots/${name}/memory.json`,'utf8'));
        assert.ok(saved.turns.some(t=>t.content.includes('craftRecipe: [failed]')),'Missing crafting ingredients must return a typed failure');
        assert.equal(saved.agent_system.goals[0].status,'completed');assert.equal(saved.agent_system.lastDirective.model,'worker');
        assert.ok(messages.some(m=>m.includes('gathering the wood')),'Content accompanying a native call must reach chat');
        // State broadcasts can precede the RP reply's usage update. Observe the
        // completed reply before taking the idle baseline.
        await waitFor(()=>state.agentSystem.usage.roles.rp?.calls>=1,10000);
        const calls=state.agentSystem.usage.calls;
        await delay(65000);
        assert.equal(state.agentSystem.usage.calls,calls,'Completed work must not keep invoking the Brain');
        results.push({name:'65 seconds idle with no inference',status:'passed'});
        await fixture.command(`give ${name} diamond_pickaxe`);await fixture.command('setblock 2 70 1 obsidian');
        socket.emit('send-message',name,{from:'ADMIN',message:'Mine the obsidian block.'});
        await waitFor(()=>log.includes('Mining obsidian')||log.includes("Calling tool collectBlocks { type: 'obsidian'"),30000,()=>log.slice(-1800));
        await delay(1000);socket.emit('send-message',name,{from:'ADMIN',message:'stop'});
        await waitFor(()=>messages.some(m=>m.trim()==='Stopped.'),10000,()=>log.slice(-1800));
        assert.equal((fixture.log.match(new RegExp(`${name} joined the game`,'g'))||[]).length,1);
        results.push({name:'natural-language stop cancels live work without reconnect',status:'passed'});
    }
    console.log(JSON.stringify({status:'passed',liveModel:live,results,directory:fixture.dir,messages}));
} catch(error) {console.error(error);console.error(log.slice(-5000));results.push({status:'failed',error:error.stack});process.exitCode=1;}
finally {
    socket?.emit('shutdown');await delay(2500);socket?.disconnect();child?.kill('SIGTERM');
    await fixture.stop();writeFileSync(path.join(fixture.dir,'agent-log.txt'),log);writeFileSync(path.join(fixture.dir,'results.json'),JSON.stringify(results,null,2));
}
