import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ToolNarrator,narrationConfig} from '../src/agent/narration.js';
import {setSettings} from '../src/agent/settings.js';

function setup(mode,extra={}) {
    setSettings({});let time=0;const said=[];
    const agent={bot:new EventEmitter(),prompter:{profile:{tool_narration:mode,...extra}},routeResponse:(source,text)=>{said.push([source,text]);return Promise.resolve();}};
    const narrator=new ToolNarrator(agent,'Player',{now:()=>time,interval:0});
    return {agent,narrator,said,advance:ms=>{time+=ms;}};
}
const call={name:'collectBlocks',arguments:{type:'oak_log'}};
const ok={status:'ok',text:'Collected logs.'};
test('all mode preserves content before tools and provides a fallback for additional or empty-content calls',async()=>{
    const {narrator,said}=setup('all');
    await narrator.assistant('I will gather some logs.',{hasCalls:true});await narrator.beforeTool(call);await narrator.afterTool(ok);
    await narrator.beforeTool({name:'inventory',arguments:{}});await narrator.afterTool(ok);
    assert.deepEqual(said.map(s=>s[1]),['I will gather some logs.',"I'm checking my supplies."]);narrator.close();
});
test('periodic counts completed calls, not responses, and resets after an actual update',async()=>{
    const {narrator,said}=setup('periodic',{tool_narration_every:3});
    for(let i=0;i<3;i++) {await narrator.assistant("I'm gathering wood from the nearby trees.",{hasCalls:true});await narrator.beforeTool(call);await narrator.afterTool(ok);}
    assert.deepEqual(said,[['Player',"I'm gathering wood from the nearby trees."]]);
    await narrator.beforeTool(call);await narrator.afterTool(ok);assert.equal(said.length,1);narrator.close();
});
test('periodic heartbeat covers one long operation using real progress and stops when closed',async()=>{
    const {narrator,agent,said,advance}=setup('periodic',{tool_narration_max_silence_seconds:2});
    await narrator.beforeTool(call);agent.bot.emit('action_progress',{user_message:"I've gathered two logs so far."});
    advance(2100);await narrator.tick();assert.equal(said[0][1],"I've gathered two logs so far.");
    narrator.close();advance(3000);await narrator.tick();assert.equal(said.length,1);assert.equal(agent.bot.listenerCount('action_progress'),0);
});
test('none mode suppresses routine narration while questions, blockers and completion remain visible',async()=>{
    const {narrator,said}=setup('none',{tool_narration_every:-1,tool_narration_max_silence_seconds:-1});
    await narrator.assistant('routine',{hasCalls:true});await narrator.beforeTool(call);await narrator.afterTool(ok);
    await narrator.assistant('Which tree?',{hasCalls:true,question:true});
    await narrator.afterTool({status:'blocked',code:'missing_tool',text:'Missing harvestTools for obsidian at (1, 64, 0).'});await narrator.assistant('Done.');
    assert.deepEqual(said.map(s=>s[1]),['Which tree?','I need a suitable tool before I can mine that.','Done.']);narrator.close();
});
test('periodic updates never copy raw pathfinding, placement or coordinate logs into chat',async()=>{
    const {narrator,said}=setup('periodic');
    const move={name:'goToCoordinates',arguments:{x:-33,y:108,z:14}};
    for(let i=0;i<3;i++) {
        await narrator.assistant('',{hasCalls:true});await narrator.beforeTool(move);
        await narrator.afterTool({status:'ok',text:'Found non-destructive path. You have reached at -33, 108, 14.'});
    }
    assert.deepEqual(said.map(s=>s[1]),["I've reached the next spot."]);narrator.close();
});
test('recoverable placement failures respect cadence and repeated failures are explained once in plain language',async()=>{
    const {narrator,said}=setup('periodic');
    const place={name:'placeHere',arguments:{type:'torch'}};
    for(let i=0;i<5;i++) {
        await narrator.beforeTool(place);
        await narrator.afterTool({status:'failed',text:'Failed to place torch at (-24, 105, 13).'});
        if(i===0) assert.equal(said.length,0);
    }
    assert.deepEqual(said.map(s=>s[1]),["I couldn't put a torch in that spot."]);narrator.close();
});
test('technical model narration falls back to natural progress rather than exposing mode names',async()=>{
    const {narrator,said}=setup('all');
    await narrator.assistant('torch_placing mode is on, so placeHere will spread torches at (-20, 106, 20).',{hasCalls:true});
    await narrator.beforeTool({name:'placeHere',arguments:{type:'torch'}});
    assert.deepEqual(said.map(s=>s[1]),["I'm lighting the area."]);narrator.close();
});
test('raw action progress is not chat text and slow model responses still get periodic updates',async()=>{
    const {narrator,agent,said,advance}=setup('periodic',{tool_narration_max_silence_seconds:2});
    await narrator.beforeTool({name:'collectBlocks',arguments:{type:'iron_ore'}});
    agent.bot.emit('action_progress',{message:'Mining iron_ore at (4, 64, 0); action:collectBlocks'});
    advance(2100);await narrator.tick();assert.equal(said[0][1],"I'm gathering iron ore.");
    await narrator.afterTool(ok);narrator.startThinking();advance(2100);await narrator.tick();
    assert.equal(said.at(-1)[1],"I'm working out the next step.");narrator.endThinking();narrator.close();
});
test('periodic cadence is ignored in all/none and an idle narrator never sends heartbeats',async()=>{
    assert.doesNotThrow(()=>narrationConfig({tool_narration:'all',tool_narration_every:0}));
    assert.throws(()=>narrationConfig({tool_narration:'periodic',tool_narration_every:0}));
    const {narrator,said,advance}=setup('periodic');advance(999999);await narrator.tick();assert.equal(said.length,0);narrator.close();
});
