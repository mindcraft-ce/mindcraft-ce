// Exercise default single-agent mode with real automatic behaviors and delayed
// model turns, rather than testing only the optional Brain controller.
import {spawn} from 'node:child_process';
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {vanillaFixture,delay,waitFor} from './vanilla_fixture.js';

const fixture=await vanillaFixture(55918);
const name='CENarration',mindPort=8083;
let child,socket,log='',state,started=false,finished=false;
const messages=[],workStates=[],results=[];
const call=(name,args={})=>({id:`${name}-${Math.random().toString(16).slice(2)}`,name,arguments:args});
try {
    await fixture.command('forceload add -16 -16 32 16');await delay(1000);
    await fixture.command('fill -8 69 -8 28 69 8 stone');
    await fixture.command('fill -8 70 -8 28 77 8 air');
    await fixture.command('setworldspawn 0 70 0');await fixture.command('time set midnight');
    await fixture.command('gamerule minecraft:advance_time false');
    const transcript=path.join(fixture.dir,'replies.json');
    writeFileSync(transcript,JSON.stringify([
        {role:'task',delay_ms:2000,calls:[call('setMode',{mode_name:'torch_placing',on:true})]},
        {role:'task',delay_ms:2500,calls:[call('placeHere',{type:'torch'})]},
        {role:'task',delay_ms:2500,text:"I'm spreading torches along the path.",calls:[call('goToCoordinates',{x:8.5,y:70,z:0.5,closeness:0.2})]},
        {role:'task',delay_ms:2500,calls:[call('placeHere',{type:'torch'})]},
        {role:'task',delay_ms:2500,calls:[call('placeBlockAt',{type:'torch',x:8,y:70,z:0})]},
        {role:'task',delay_ms:2500,text:"I'm lighting the next dark patch.",calls:[call('goToCoordinates',{x:16.5,y:70,z:0.5,closeness:0.2})]},
        {role:'task',delay_ms:2500,calls:[call('placeHere',{type:'torch'})]},
        {role:'task',delay_ms:2500,text:'The path is lit now.'},
    ]));
    const profile=path.join(fixture.dir,'profile.json');
    writeFileSync(profile,JSON.stringify({name,model:{api:'replay',model:transcript},embedding:false,cooldown:0,
        use_function_calling:true,use_brain_agent:false,tool_narration:'periodic',tool_narration_every:3,
        tool_narration_max_silence_seconds:30,modes:{torch_placing:false,item_collecting:false,hunting:false,elbow_room:false,idle_staring:false}}));
    child=spawn(process.execPath,['main.js','--profiles',profile],{env:{...process.env,SETTINGS_JSON:JSON.stringify({
        host:'127.0.0.1',port:fixture.port,mindserver_port:mindPort,minecraft_version:'1.21.11',auth:'offline',
        init_message:'',num_examples:0,max_messages:200,load_memory:false,allow_insecure_coding:false,
    })},stdio:['pipe','pipe','pipe']});
    const capture=data=>{log+=data;appendFileSync(path.join(fixture.dir,'agent-log.txt'),data);};
    child.stdout.on('data',capture);child.stderr.on('data',capture);
    await waitFor(()=>log.includes(`${name} spawned.`),30000,()=>log.slice(-2000));
    await fixture.command(`tp ${name} 0.5 70 0.5`);await fixture.command(`give ${name} torch 20`);
    socket=io(`http://127.0.0.1:${mindPort}`,{reconnection:false,auth:{controlToken:process.env.MINDCRAFT_CONTROL_TOKEN}});
    socket.on('bot-output',(agent,message)=>{if(agent===name) messages.push(message.trim());});
    socket.on('state-update',states=>{
        state=states[name];
        if(started&&!finished&&state?.agentSystem.usage.calls>=1&&state.agentSystem.usage.calls<8) workStates.push(state.action.isIdle);
    });
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});socket.emit('listen-to-agents');
    started=true;
    socket.emit('send-message',name,{from:'ADMIN',message:'Light the path with three spaced torches.'});
    await waitFor(()=>messages.includes('The path is lit now.')&&state?.action.isIdle,90000,()=>log.slice(-2500));finished=true;
    assert.ok(workStates.length>0);assert.ok(workStates.every(idle=>idle===false),'A pending native loop must not look idle to background behaviors');
    assert.equal(state.inventory.counts.torch,17,'Three actual torches should be consumed; repeated placement must consume none');
    assert.ok(!log.includes('Mode torch_placing finished'),'Automatic lighting must not compete during model turns');
    const saved=JSON.parse(readFileSync(`bots/${name}/memory.json`,'utf8'));
    assert.ok(saved.turns.some(t=>t.content.includes('No placement needed.')),'Repeated placement must be an explicit successful no-op');
    assert.ok(!saved.turns.some(t=>t.role==='system'&&t.content.includes('[failed')),'The automatic/manual sequence must not produce false placement failures');
    assert.ok(messages.includes("I'm spreading torches along the path."),'Periodic narration should preserve useful model content');
    assert.ok(messages.every(m=>!/pathfind|non-destructive|torch_|placeHere|placeBlockAt|already at|\(-?\d+,/i.test(m)),'Chat must not contain internal placement or movement output');
    await fixture.command('execute if block 0 70 0 torch if block 8 70 0 torch if block 16 70 0 torch run setblock 0 76 0 diamond_block');
    await waitFor(()=>fixture.log.includes('Changed the block at 0, 76, 0'),5000,()=>fixture.log.slice(-800));
    results.push({name:'default-mode torch work and plain-language periodic narration',status:'passed',messages,workStates:workStates.length});
    const calls=state.agentSystem.usage.calls;
    await fixture.command(`tp ${name} 25.5 70 0.5`);
    await waitFor(()=>state.inventory.counts.torch===16&&log.includes('Mode torch_placing finished'),15000,()=>log.slice(-1200));
    assert.equal(state.agentSystem.usage.calls,calls,'Normal idle torch behavior must resume without inference');
    results.push({name:'automatic torch behavior resumes when the native loop is actually idle',status:'passed'});
    console.log(JSON.stringify({status:'passed',results,directory:fixture.dir}));
} catch(error) {console.error(error);results.push({status:'failed',error:error.stack});process.exitCode=1;}
finally {
    socket?.emit('shutdown');await delay(2500);socket?.disconnect();child?.kill('SIGTERM');
    await fixture.stop();writeFileSync(path.join(fixture.dir,'results.json'),JSON.stringify(results,null,2));
}
