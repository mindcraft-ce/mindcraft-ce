import test from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent/agent.js';
import { AgentSystem } from '../src/agent/agents/system.js';
import { setSettings } from '../src/agent/settings.js';
import { getCommand } from '../src/agent/commands/index.js';

function setup() {
    setSettings({language: 'en', max_commands: 3, agent_max_steps: 3});
    const agent = new Agent();
    agent.name = 'TestBot';
    agent.task = {data: null};
    agent.actions = {executing: false};
    agent.blocked_actions = [];
    agent.self_prompter = {isActive: () => false, shouldInterrupt: () => false, handleUserPromptedCmd: () => {}};
    agent.bot = {modes: {flushBehaviorLog: () => ''}};
    const messages = [], responses = [];
    agent.history = {
        add: (source, content) => { messages.push({role: source === agent.name ? 'assistant' : 'user', content}); return Promise.resolve(); },
        save: () => Promise.resolve(), getHistory: () => structuredClone(messages),
    };
    agent.routeResponse = (source, content) => {responses.push(content); return Promise.resolve();};
    return {agent, messages, responses};
}

test('Agent.handleMessage retains the explicit legacy text response path', async () => {
    const {agent, responses} = setup();
    agent.prompter = {promptConvo: () => Promise.resolve('Hello player')};
    assert.equal(await agent.handleMessage('Player', 'hello'), false);
    assert.deepEqual(responses, ['Hello player']);
    assert.equal(agent.isIdle(), true);
});
test('single-agent native work stays busy during generation and between tool calls',async t=>{
    const {agent}=setup();let release,requests=0;
    const command=getCommand('!stats'),original=command.perform;
    command.perform=()=>{assert.equal(agent.isIdle(),false);return 'Checked status.';};
    t.after(()=>{command.perform=original;});
    agent.prompter={use_brain:false,profile:{tool_narration:'none'},promptTools:()=>{
        requests++;assert.equal(agent.isIdle(),false);
        return requests===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(['Ready.',[]]);
    }};
    agent.agentSystem=new AgentSystem(agent);
    const pending=agent.handleMessage('Player','Check the area');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(agent.isIdle(),false);assert.equal(agent.taskAgent.is_running,true);
    release(['',[{id:'status',name:'stats',arguments:{}}]]);await pending;
    assert.equal(requests,2);assert.equal(agent.isIdle(),true);assert.equal(agent.taskAgent.is_running,false);
});
test('stopping or failing native generation releases the busy state without leaking diagnostics',async()=>{
    for(const cancel of [false,true]) {
        const {agent,responses}=setup();let reject;
        agent.prompter={use_brain:false,profile:{tool_narration:'none'},promptTools:()=>new Promise((_resolve,fail)=>{reject=fail;})};
        agent.agentSystem=new AgentSystem(agent);
        const pending=agent.handleMessage('Player','Do something');await new Promise(resolve=>setImmediate(resolve));
        assert.equal(agent.isIdle(),false);if(cancel) agent.agentSystem.cancelTask();
        reject(new Error('HTTP 503 from /chat/completions; requestTools failed'));await pending;
        assert.equal(agent.isIdle(),true);
        assert.deepEqual(responses,cancel?[]:["I'm having trouble working out the next step. Please try again shortly."]);
    }
});

test('Agent.handleMessage executes a native query and follows up using its tool result', async t => {
    const {agent, responses} = setup();
    const command = getCommand('!stats');
    const original = command.perform;
    command.perform = () => 'Position: 1,64,2';
    t.after(() => {command.perform = original;});
    let requests = 0;
    agent.prompter = {use_brain: false, promptTools: history => {
        requests++;
        if (requests === 1) return Promise.resolve(['', [{id: 'locate', name: 'stats', arguments: {}}]]);
        assert.equal(history.at(-1).role, 'tool');
        assert.equal(history.at(-1).content, 'Position: 1,64,2');
        return Promise.resolve(['{"chat_response":"I am at 1,64,2","work_done":true}', []]);
    }};
    agent.agentSystem = new AgentSystem(agent);
    assert.equal(await agent.handleMessage('Player', 'Where are you?'), true);
    assert.equal(requests, 2);
    assert.deepEqual(responses, ['I am at 1,64,2']);
});
