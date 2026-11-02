import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Prompter } from '../src/models/prompter.js';
import { setSettings } from '../src/agent/settings.js';

const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), 'mindcraft-prompter-'));
test.before(() => process.chdir(temporary));
test.after(() => { process.chdir(root); rmSync(temporary, {recursive: true, force: true}); });

function create(profile = {}, settings = {}) {
    setSettings({base_profile: 'assistant', num_examples: 0, ...settings});
    const agent = {name: 'TestBot', history: {memory: ''}, blocked_actions: []};
    return new Prompter(agent, {name: 'TestBot', model: 'ollama/test', cooldown: 0, ...profile});
}

test('explicit legacy opt-out preserves develop prompts', () => {
    const prompter = create({use_function_calling:false});
    const defaults = JSON.parse(readFileSync(new URL('../profiles/defaults/_default.json', import.meta.url)));
    const assistant = JSON.parse(readFileSync(new URL('../profiles/defaults/assistant.json', import.meta.url)));
    for (const key of ['conversing', 'coding', 'saving_memory', 'bot_responder', 'image_analysis'])
        assert.equal(prompter.profile[key], assistant[key] ?? defaults[key], key);
    assert.equal(prompter.use_tools, false);
    assert.equal(prompter.use_brain, false);
});

test('XML prompts load outside the repository cwd and preserve explicit profile prompts', () => {
    const prompter = create({use_function_calling:false,use_xml_prompts: true, conversing: 'Custom conversation'});
    assert.equal(prompter.profile.conversing, 'Custom conversation');
    assert.match(prompter.profile.coding, /<system>/);
    assert.equal(prompter.use_tools, false);
});

test('native tools default on and brain remains optional with per-profile overrides', () => {
    const tools = create();
    assert.equal(tools.use_tools, true);
    assert.equal(tools.use_brain, false);
    assert.match(tools.profile.conversing, /function|tools/);
    assert.equal(tools.profile.image_analysis.match(/<system_prompt>/g).length, 1);
    assert.ok(!tools.profile.image_analysis.includes(String.raw`\n`));
    assert.throws(() => create({use_function_calling:false,use_brain_agent: true}), /requires/);
    const brain = create({use_function_calling: true, use_brain_agent: true});
    assert.match(brain.profile.brain_agent, /<brain_agent_system>/);
    assert.match(brain.profile.rp_agent, /<rp_agent_system>/);
    const legacy = create({use_function_calling: false, use_brain_agent: false}, {use_function_calling: true, use_brain_agent: true});
    assert.equal(legacy.use_tools, false);
    assert.equal(legacy.use_brain, false);
});

test('conversation, code, memory, vision and classifier keep their string contracts', async () => {
    const prompter = create();
    prompter.replaceStrings = prompt => Promise.resolve(prompt);
    let text = 'legacy text';
    const model = {sendRequest: () => Promise.resolve(text), sendVisionRequest: () => Promise.resolve('view')};
    prompter.chat_model = prompter.code_model = prompter.vision_model = model;
    assert.equal(await prompter.promptConvo([]), 'legacy text');
    assert.equal(await prompter.promptCoding([]), 'legacy text');
    assert.equal(await prompter.promptMemSaving([]), 'legacy text');
    assert.equal(await prompter.promptVision([], Buffer.from('image')), 'view');
    prompter.agent.history.getHistory = () => [];
    text = 'respond';
    assert.equal(await prompter.promptShouldRespondToBot('hello'), true);
});
test('role endpoints and a configured roster keep independent models and cache selections',()=>{
    const prompter=create({brain_model:'ollama/brain',task_model:'ollama/task',rp_model:'ollama/rp',
        model_selection:{enabled:true,default_task_model:'worker',models:[{id:'worker',model:'ollama/worker',scores:{mining:8}}]}});
    assert.equal(prompter.brain_model.model_name,'brain');assert.equal(prompter.task_model.model_name,'task');assert.equal(prompter.rp_model.model_name,'rp');
    const worker=prompter.selectTaskModel('worker');assert.equal(worker.model_name,'worker');
    assert.equal(prompter.selectTaskModel('worker'),worker);assert.throws(()=>prompter.selectTaskModel('missing'),/Unknown/);
    assert.throws(()=>create({model_selection:{enabled:true,models:[]}}),/roster/);
    assert.throws(()=>create({model_selection:{enabled:true,models:[{id:'x',model:'ollama/x'},{id:'x',model:'ollama/y'}]}}),/unique IDs/);
    assert.throws(()=>create({model_selection:{enabled:true,default_task_model:'missing',models:[{id:'x',model:'ollama/x'}]}}),/enabled roster/);
});
test('global role defaults apply while explicit profile overrides win',()=>{
    const global=create({}, {brain_model:'ollama/global-brain',use_rp_agent:false});
    assert.equal(global.brain_model.model_name,'global-brain');assert.equal(global.profile.use_rp_agent,false);
    const profile=create({brain_model:'',use_rp_agent:true}, {brain_model:'ollama/global-brain',use_rp_agent:false});
    assert.equal(profile.brain_model,profile.chat_model);assert.equal(profile.profile.use_rp_agent,true);
});
test('role-scoped cancellation aborts Task requests without cancelling the planner',async()=>{
    const prompter=create();const task=new AbortController(),brain=new AbortController();task.role='task';brain.role='brain';
    prompter.pendingControllers.add(task);prompter.pendingControllers.add(brain);
    prompter.cancelPending('task');assert.equal(task.signal.aborted,true);assert.equal(brain.signal.aborted,false);
    prompter.cancelPending();assert.equal(brain.signal.aborted,true);
});
test('cancellation during cooldown prevents a late provider request from starting',async()=>{
    const prompter=create();let release,calls=0;
    prompter.checkCooldown=()=>new Promise(resolve=>{release=resolve;});
    const model={model_name:'test',sendToolRequest:()=>{calls++;return Promise.resolve(['late',[]]);}};
    const pending=prompter.requestTools([], 'system',[],null,model,'task');
    prompter.cancelPending('task');release();
    await assert.rejects(pending,/cancelled/);assert.equal(calls,0);
});
