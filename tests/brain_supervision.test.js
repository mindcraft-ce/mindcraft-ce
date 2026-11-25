import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {AgentSystem} from '../src/agent/agents/system.js';
import {History} from '../src/agent/history.js';
import {Goals} from '../src/agent/goals/goals.js';
import {getCommand} from '../src/agent/commands/index.js';
import {setSettings} from '../src/agent/settings.js';
import {Replay} from '../src/models/replay.js';
import {writeFileSync} from 'node:fs';

const call=(name,args={})=>({id:`${name}-call`,name,arguments:args});
const turn=(...calls)=>['',calls];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t,brain=[],task=[]) {
    setSettings({agent_max_steps:8,agent_max_tool_calls:10,max_messages:100,host:'local',port:1,tool_narration:'none'});
    let brainCalls=0,taskCalls=0,stops=0;
    const said=[],saved=[],history=[];
    const agent={name:'TestBot',bot:Object.assign(new EventEmitter(),{worldIdentity:'world-a',game:{dimension:'overworld'},inventory:{items:()=>[]}}),
        blocked_actions:[],self_prompter:{handleUserPromptedCmd:()=>{}},
        actions:{stop:()=>{stops++;return Promise.resolve();},currentActionLabel:''},
        history:{getHistory:()=>structuredClone(history),add:(name,content)=>{history.push({role:name==='system'?'system':'assistant',content});return Promise.resolve();},save:()=>{saved.push(1);return Promise.resolve();}},
        routeResponse:(source,text)=>{said.push([source,text]);return Promise.resolve();},
        prompter:{use_brain:true,profile:{use_rp_agent:false,tool_narration:'none'},replaceStrings:prompt=>Promise.resolve(prompt),
            handleRequest:()=>{const value=brain[brainCalls++];if(!value) return Promise.reject(new Error('Unexpected Brain request'));return Promise.resolve(value);},
            requestTools:()=>{const value=task[taskCalls++];if(!value) return Promise.reject(new Error('Unexpected Task request'));return Promise.resolve(value);},
            selectTaskModel:()=>null},
    };
    const system=new AgentSystem(agent);agent.agentSystem=system;
    t.after(()=>system.cancelTask());
    return {system,agent,said,saved,history,counts:()=>({brainCalls,taskCalls,stops})};
}
test('native Brain assigns a concrete task and Task explicitly hands completion back',async t=>{
    const {system,counts}=setup(t,[turn(call('directTask',{objective:'Check status',briefing:'Use stats'}))],[turn(call('taskDone',{summary:'Status checked'}))]);
    await system.handleMessage('Player','Check status');await system.activeTask;
    assert.equal(system.lastDirective.outcome,'done');assert.equal(system.currentDirective,null);
    assert.deepEqual(counts(),{brainCalls:1,taskCalls:1,stops:0});
    assert.equal(system.brain.message_history.at(-1).role,'tool');
});
test('goal bookkeeping continues to a task handoff rather than silently leaving the bot idle',async t=>{
    const {system,counts}=setup(t,[turn(call('addGoal',{name:'logs',item:'oak_log',count:3})),turn(call('directTask',{objective:'Gather three logs'}))],
        [turn(call('taskDone',{summary:'Gathered logs'}))]);
    await system.handleMessage('Player','Gather wood');await system.activeTask;
    assert.equal(counts().brainCalls,2);assert.equal(system.lastDirective.objective,'Gather three logs');
});
test('taskDone does not imply an inventory goal is fulfilled without the required items',async t=>{
    const {system}=setup(t);
    const goal=system.brain.goals.addGoal('logs','get wood',1,[],{item:'oak_log',count:5});
    await assert.rejects(system.apply(call('completeGoal',{name:goal.id}),'Player'),/inventory has 0/);
    assert.equal(goal.status,'active');
});
test('unknown tool categories are rejected before starting a Task',async t=>{
    const {system}=setup(t);
    await assert.rejects(system.startDirective({objective:'Gather wood',tools:['mine','craft']},'Player'),/exact available names/);
    assert.equal(system.activeTask,null);
});
test('Brain corrects malformed supervision calls boundedly and reports a final blocker',async t=>{
    const {system,said,counts}=setup(t,[turn(call('directTask',{objective:42})),turn(call('directTask',{objective:42})),turn(call('directTask',{objective:42}))]);
    await system.handleMessage('Player','Get wood');
    assert.equal(counts().brainCalls,3);assert.equal(system.activeTask,null);assert.match(said.at(-1)[1],/couldn't work out/);
    assert.ok(!said.at(-1)[1].includes('directTask'));
});
test('a plain stop cancels immediately without invoking the Brain or an optional decision model',async t=>{
    const {system,agent,counts,said}=setup(t);
    agent.decisions={enabled:true,triage:()=>{throw new Error('Stop must bypass classification');}};
    await system.handleMessage('Player','stop');assert.equal(counts().brainCalls,0);assert.equal(counts().stops,1);assert.equal(said[0][1],'Stopped.');
});
test('decision triage ignores confident unrelated chat and uncertainty falls back to Brain',async t=>{
    const {system,agent,counts}=setup(t,[turn(call('wait'))]);
    agent.decisions={enabled:true,config:{min_probability:0.85},triage:()=>Promise.resolve({addressed:0.01})};
    await system.handleMessage('Player','Conversation with someone else');assert.equal(counts().brainCalls,0);
    agent.decisions.triage=()=>Promise.resolve(null);
    await system.handleMessage('Player','An uncertain request');assert.equal(counts().brainCalls,1);
});
test('confident continue checks skip three routine Brain calls then require supervision',async t=>{
    const {system,agent,counts}=setup(t,[turn(call('wait'))]);let decisionCalls=0;
    agent.decisions={enabled:true,taskStatus:()=>{decisionCalls++;return Promise.resolve('continue');}};
    system.onSpawn();system.currentDirective={objective:'Gather wood',source:'Player'};
    for(let i=0;i<4;i++) {
        system.wake('Player','Periodic status: mining');clearTimeout(system.wakeTimer);system.wakeTimer=null;
        await system.flushWake();if(i<3) assert.equal(counts().brainCalls,0);
    }
    assert.equal(decisionCalls,4);assert.equal(counts().brainCalls,1);
});
test('addressed stop uses the actual bot name and never needs inference',async t=>{
    const {system,counts,said}=setup(t);
    await system.handleMessage('Player','TestBot, stop!');
    assert.equal(counts().brainCalls,0);assert.equal(counts().stops,1);assert.equal(said[0][1],'Stopped.');
});
test('a failed goal check prevents the rest of a completion announcement batch',async t=>{
    const {system,said}=setup(t,[turn(call('completeGoal',{name:'logs'}),call('say',{message:'All done!'})),turn(call('say',{message:'I still need five logs.'}),call('wait'))]);
    system.brain.goals.addGoal('logs','',1,[],{item:'oak_log',count:5});
    await system.handleMessage('Player','Are you done?');
    assert.deepEqual(said.map(s=>s[1]),['I still need five logs.']);
    assert.ok(system.brain.message_history.some(m=>m.role==='tool'&&m.content.startsWith('NOT executed')));
});
test('a stale Brain response after cancellation cannot launch work',async t=>{
    const {system,agent}=setup(t);let release;
    agent.prompter.handleRequest=()=>new Promise(resolve=>{release=resolve;});
    const pending=system.handleMessage('Player','Mine');await settle();system.cancelTask();
    release(turn(call('directTask',{objective:'Mine'})));await pending;assert.equal(system.currentDirective,null);assert.equal(system.activeTask,null);
});
test('stop during replacement shutdown cannot launch the queued replacement task',async t=>{
    const {system}=setup(t,[turn(call('directTask',{objective:'Mine iron instead',replace:true}))]);
    let finish,starts=0;
    system.task.performTask=()=>{starts++;return new Promise(resolve=>{finish=resolve;});};
    await system.startDirective({objective:'Gather wood'},'Player');
    const replacement=system.handleMessage('Player','Mine iron instead');await settle();
    await system.handleMessage('Player','stop');finish({work_done:false});await replacement;
    assert.equal(starts,1);assert.equal(system.currentDirective,null);
});
test('stop invalidates an outstanding decision check before it can wake Brain',async t=>{
    const {system,agent,counts}=setup(t,[turn(call('wait'))]);let finish;
    agent.decisions={enabled:true,taskStatus:()=>new Promise(resolve=>{finish=resolve;})};
    system.onSpawn();system.currentDirective={objective:'Mine',source:'Player'};system.gatedChecks=3;
    system.pendingWake={source:'Player',message:'Periodic status: mining'};
    const pending=system.flushWake();system.cancelTask();finish('continue');await pending;
    assert.equal(counts().brainCalls,0);
});
test('an RP completion generated before stop is never delivered afterwards',async t=>{
    const {system,agent,said}=setup(t);let finish;agent.prompter.profile.use_rp_agent=true;
    system.rp.transform=()=>new Promise(resolve=>{finish=resolve;});
    const pending=system.say('Player','Done with the old task.',true);
    await system.handleMessage('Player','stop');finish('Old completion.');await pending;
    assert.deepEqual(said.map(s=>s[1]),['Stopped.']);
});
test('near-identical instructions become context while a task is running',async t=>{
    const {system,agent}=setup(t);let finish;
    system.task.performTask=()=>new Promise(resolve=>{finish=resolve;});
    await system.startDirective({objective:'collect oak logs'},'Player');
    const result=await system.startDirective({objective:'collect oak logs',briefing:'Use the tree beside me'},'Player');
    assert.match(result,/without restarting/);assert.equal(system.queue.hasItems(),true);
    finish({work_done:true});await system.activeTask;assert.equal(system.lastDirective.outcome,'done');
});
test('completion produces one supervision event and idle tick schedules no new requests',async t=>{
    const {system,counts}=setup(t,[turn(call('directTask',{objective:'Check'})),turn(call('say',{message:'Done.'}),call('wait'))],[turn(call('taskDone',{summary:'Checked'}))]);
    system.onSpawn();await system.handleMessage('Player','Check');await system.activeTask;
    clearTimeout(system.wakeTimer);system.wakeTimer=null;await system.flushWake();
    for(let i=0;i<100;i++) system.tick();
    assert.equal(counts().brainCalls,2);assert.equal(system.pendingWake,null);
});
test('repeated failed reassignments without observed progress are bounded',async t=>{
    const {system,said}=setup(t);
    system.task.performTask=()=>Promise.resolve({work_done:false,blocked:true});
    for(let i=0;i<5;i++) {await system.startDirective({objective:'mine unreachable iron'},'Player');await system.activeTask;}
    assert.match(said.map(s=>s[1]).join(' '),/paused repeated attempts/);assert.equal(system.currentDirective,null);
});
test('state saves atomically and restores durable goals, notes and same-world locations',async t=>{
    const {system,agent}=setup(t);const dir=mkdtempSync(path.join(tmpdir(),'ce-history-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    agent.memory_bank={getJson:()=>({home:[1,64,2]}),loadJson:value=>{agent.restored=value;}};
    agent.self_prompter={state:'stopped',isStopped:()=>true};agent.task={taskStartTime:1};
    const history=new History(agent);history.memory_fp=path.join(dir,'memory.json');agent.history=history;
    system.brain.goals.addGoal('iron tools');system.rp.playerNotes.Player='Likes brief replies.';
    await history.save();const data=JSON.parse(readFileSync(history.memory_fp));
    assert.equal(data.agent_system.version,1);system.brain.goals.goals=[];history.load();system.onSpawn();
    assert.equal(system.brain.goals.active()[0].name,'iron tools');assert.deepEqual(agent.restored,{home:[1,64,2]});
    agent.restored=null;agent.bot.worldIdentity='world-b';system.restore(data.agent_system);system.onSpawn();assert.equal(agent.restored,null);
});
test('restart reassesses a saved objective against fresh inventory instead of replaying work',async t=>{
    const {system,agent,said,counts}=setup(t,[turn(call('completeGoal',{name:'logs'}),call('say',{message:'The logs are already here.'}),call('wait'))]);
    agent.bot.inventory.items=()=>[{name:'oak_log',count:3}];
    system.brain.goals.addGoal('logs','',1,[],{item:'oak_log',count:3});
    const state={...system.snapshot(),directive:{id:'old',objective:'Collect three logs',source:'Player'}};
    system.restore(state);system.onSpawn();
    assert.equal(system.currentDirective,null);assert.equal(counts().taskCalls,0);
    clearTimeout(system.wakeTimer);system.wakeTimer=null;await system.flushWake();
    assert.equal(system.brain.goals.getGoal('logs').status,'completed');assert.equal(counts().taskCalls,0);
    assert.equal(said[0][1],'The logs are already here.');
    system.restore({...state,scope:'other-world'});system.onSpawn();assert.equal(system.pendingWake,null);
});
test('RP retains player notes and cannot discard a required reply when empty or unavailable',async t=>{
    const {system,agent}=setup(t);agent.prompter.profile.use_rp_agent=true;
    agent.prompter.handleRequest=()=>Promise.resolve(['{"chat_response":"","internal_notes":"Likes clear updates."}',[]]);
    assert.equal(await system.rp.transform('The table is ready.','Player'),'The table is ready.');
    assert.equal(system.snapshot().notes.Player,'Likes clear updates.');
    agent.prompter.handleRequest=()=>Promise.reject(new Error('offline'));
    assert.equal(await system.rp.transform('A tool is missing.','Player'),'A tool is missing.');
});
test('role-separated replay consumes deterministic records and fails clearly when exhausted',async t=>{
    const dir=mkdtempSync(path.join(tmpdir(),'ce-replay-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const file=path.join(dir,'turns.json');writeFileSync(file,JSON.stringify([{role:'brain',calls:[call('wait')]},{role:'task',text:'done'}]));
    const replay=new Replay(file);
    assert.equal((await replay.sendToolRequest([], '',[],null,{role:'task'}))[0],'done');
    assert.equal((await replay.sendToolRequest([], '',[],null,{role:'brain'}))[1][0].name,'wait');
    assert.throws(()=>replay.sendToolRequest([], '',[],null,{role:'task'}),/exhausted/);
});
test('a delayed replay turn aborts promptly instead of holding a cancelled task open',async t=>{
    const dir=mkdtempSync(path.join(tmpdir(),'ce-replay-abort-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const file=path.join(dir,'turns.json');writeFileSync(file,JSON.stringify([{role:'task',delay_ms:10000,text:'late'}]));
    const replay=new Replay(file),controller=new AbortController();
    const pending=replay.sendToolRequest([], '',[],null,{role:'task',signal:controller.signal});
    controller.abort(new Error('Cancelled test turn'));await assert.rejects(pending,/Cancelled test turn/);
});
test('unreadable saved memory is preserved and does not crash the bot',t=>{
    const {agent}=setup(t);const dir=mkdtempSync(path.join(tmpdir(),'ce-corrupt-history-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const history=new History(agent);history.memory_fp=path.join(dir,'memory.json');
    writeFileSync(history.memory_fp,'{broken');
    assert.equal(history.load(),null);assert.deepEqual(history.getHistory(),[]);
    const backup=readdirSync(dir).find(f=>f.startsWith('memory.json.corrupt-'));
    assert.ok(backup);assert.equal(readFileSync(path.join(dir,backup),'utf8'),'{broken');
});
