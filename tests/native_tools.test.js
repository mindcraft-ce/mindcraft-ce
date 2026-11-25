import test from 'node:test';
import assert from 'node:assert/strict';
import { setSettings } from '../src/agent/settings.js';
import { getCommands, getCommand } from '../src/agent/commands/index.js';
import { getToolDefinitions, executeTool } from '../src/agent/commands/tool_registry.js';
import { sendToolRequest, toolCallMessage } from '../src/models/_tool_request.js';
import { TaskAgent } from '../src/agent/agents/task.js';
import { AgentSystem } from '../src/agent/agents/system.js';
import { CodeAgent, getAugmentRegistry, validateAugmentSpec } from '../src/agent/agents/code.js';

const tools = [{ type: 'function', function: { name: 'stats', description: 'Get stats', parameters: { type: 'object', properties: {} } } }];
const input = [{ role: 'user', content: 'Where am I?' }];
const completion = (content, tool_calls = []) => ({ choices: [{ finish_reason: 'stop', message: { content, tool_calls } }] });

test('native schemas retain develop commands, optional arguments and per-agent restrictions', () => {
    setSettings({ allow_insecure_coding: true });
    const names = getToolDefinitions({}).map(t => t.function.name);
    for (const command of getCommands()) assert.ok(names.includes(command.name.slice(1)), command.name);
    const plan = getToolDefinitions({}).find(t => t.function.name === 'getCraftingPlan');
    assert.deepEqual(plan.function.parameters.required, ['targetItem']);
    const restricted = getToolDefinitions({blocked_actions: ['!goToPlayer', 'placeBlockAt', '!stop']}).map(t => t.function.name);
    assert.ok(!restricted.includes('goToPlayer'));
    assert.ok(!restricted.includes('placeBlockAt'));
    assert.ok(restricted.includes('stop'));
    assert.ok(getToolDefinitions({}).some(t => t.function.name === 'goToPlayer'));
    setSettings({allow_insecure_coding: false});
    for (const name of ['newAction', 'generateAugment', 'executeCode'])
        assert.ok(!getToolDefinitions({}).some(t => t.function.name === name));
});

test('structured execution rejects malformed, unknown, disabled and out-of-range arguments before running', async t => {
    setSettings({ allow_insecure_coding: false });
    const command = getCommand('!goToCoordinates');
    const original = command.perform;
    const received = [];
    command.perform = (...args) => received.push(args);
    t.after(() => { command.perform = original; });
    const agent = {};
    await executeTool(agent, 'goToCoordinates', { x: 1, y: 64, z: -2, closeness: 1 });
    assert.deepEqual(received, [[agent, 1, 64, -2, 1]]);
    for (const args of [{x: '1', y: 64, z: 0}, {x: Infinity, y: 64, z: 0}, {x: 1, y: 64, z: 0, extra: true}, []])
        await assert.rejects(executeTool(agent, 'goToCoordinates', args));
    await assert.rejects(executeTool({blocked_actions: ['!goToCoordinates']}, 'goToCoordinates', {x: 1, y: 64, z: 0}));
    await assert.rejects(executeTool(agent, 'stay', {type: -2}), /range/);
    await assert.rejects(executeTool(agent, 'executeCode', {task: 'test'}), /disabled/);
    await assert.rejects(executeTool(agent, 'constructor'), /not found/);
    assert.equal(received.length, 1);
});
test('native help advertises function calls rather than legacy inline-command syntax',async()=>{
    const help=await executeTool({},'help');
    assert.match(help,/Available native tools/);assert.match(help, /"name": "collectBlocks"/);
    assert.ok(!help.includes('Only use one command in each response'));
});

test('OpenAI-compatible tools preserve call ids and structured results across a full round trip', async () => {
    const packs = [];
    const provider = { model_name: 'test-model', params: {temperature: 0.2}, openai: {chat: {completions: {create: pack => {
        packs.push(structuredClone(pack));
        return Promise.resolve(packs.length === 1 ? completion(null, [{id: 'call-1', function: {name: 'stats', arguments: '{}'}}]) : completion('Done'));
    }}}} };
    const original = structuredClone(input);
    const [text, calls] = await sendToolRequest(provider, input, 'system', tools);
    await sendToolRequest(provider, [...input, toolCallMessage(text, calls), {role: 'tool', tool_call_id: calls[0].id, name: 'stats', content: 'Position: 1,64,2'}], 'system', tools);
    assert.deepEqual(input, original);
    assert.deepEqual(packs[0].tools, tools);
    assert.equal(packs[0].temperature, 0.2);
    assert.equal(packs[1].messages[2].tool_calls[0].id, 'call-1');
    assert.equal(packs[1].messages[3].role, 'tool');
    assert.equal(packs[1].messages[3].tool_call_id, 'call-1');
});

test('Anthropic retains signed thinking and returns matching tool_result blocks', async () => {
    const content = [{type: 'thinking', thinking: 'plan', signature: 'signature'}, {type: 'tool_use', id: 'tool-1', name: 'stats', input: {}}];
    const packs = [];
    const provider = { model_name: 'claude-test', anthropic: {messages: {create: pack => {
        packs.push(pack);
        return Promise.resolve({content: packs.length === 1 ? content : [{type: 'text', text: 'Done'}]});
    }}} };
    const [text, calls] = await sendToolRequest(provider, input, 'system', tools);
    await sendToolRequest(provider, [...input, toolCallMessage(text, calls), {role: 'tool', name: 'stats', tool_call_id: calls[0].id, content: 'ok'}], 'system', tools);
    assert.deepEqual(packs[1].messages[1].content, content);
    assert.equal(packs[1].messages[2].content[0].tool_use_id, 'tool-1');
    assert.deepEqual(packs[0].tools[0].input_schema, tools[0].function.parameters);
});

test('Gemini retains thought signatures, JSON schemas and function responses', async () => {
    const parts = [{functionCall: {name: 'stats', args: {}}, thoughtSignature: 'signed'}];
    const packs = [];
    const provider = {model_name: 'gemini-test', genAI: {models: {generateContent: pack => {
        packs.push(pack);
        return Promise.resolve({text: packs.length === 1 ? '' : 'Done', functionCalls: packs.length === 1 ? [{name: 'stats', args: {}}] : [], candidates: [{content: {parts}}]});
    }}} };
    const [text, calls] = await sendToolRequest(provider, input, 'system', tools);
    await sendToolRequest(provider, [...input, toolCallMessage(text, calls), {role: 'tool', name: 'stats', tool_call_id: calls[0].id, content: 'ok'}], 'system', tools);
    assert.deepEqual(packs[1].contents[1].parts, parts);
    assert.deepEqual(packs[1].contents[2].parts, [{functionResponse: {name: 'stats', response: {result: 'ok'}}}]);
    assert.deepEqual(packs[0].config.tools[0].functionDeclarations[0].parametersJsonSchema, tools[0].function.parameters);
});

test('Ollama sends object arguments rather than encoded JSON in tool history', async () => {
    let payload;
    const provider = {constructor: {prefix: 'ollama'}, model_name: 'test', chat_endpoint: '/api/chat', send: (endpoint, pack) => {
        payload = pack;
        return Promise.resolve({message: {content: '', tool_calls: [{function: {name: 'stats', arguments: {}}}]}});
    }};
    const [, calls] = await sendToolRequest(provider, input, 'system', tools);
    await sendToolRequest(provider, [...input, toolCallMessage('', calls)], 'system', tools);
    assert.deepEqual(payload.messages[2].tool_calls[0].function.arguments, {});
});

test('malformed tool arguments and truncated responses fail without executing anything', async () => {
    const provider = {model_name: 'test', openai: {chat: {completions: {create: () => Promise.resolve(completion('', [{function: {name: 'stats', arguments: '{bad'}}]))}}}};
    await assert.rejects(sendToolRequest(provider, input, 'system', tools), SyntaxError);
    provider.openai.chat.completions.create = () => Promise.resolve({choices: [{finish_reason: 'length', message: {content: 'partial'}}]});
    await assert.rejects(sendToolRequest(provider, input, 'system', tools), /truncated/);
    await assert.rejects(sendToolRequest({model_name: 'test'}, input, 'system', tools), /not supported/);
});
test('provider failures, refusals and empty completions cannot become false success',async()=>{
    const ollama={constructor:{prefix:'ollama'},model_name:'test',send:()=>Promise.resolve({error:'model unavailable'})};
    await assert.rejects(sendToolRequest(ollama,input,'system',tools),/model unavailable/);
    ollama.send=()=>Promise.resolve({message:{content:''}});
    await assert.rejects(sendToolRequest(ollama,input,'system',tools),/empty completion/);
    const google={model_name:'test',genAI:{models:{generateContent:()=>Promise.resolve({candidates:[{finishReason:'MAX_TOKENS'}]})}}};
    await assert.rejects(sendToolRequest(google,input,'system',tools),/truncated/);
    const claude={model_name:'test',anthropic:{messages:{create:()=>Promise.resolve({content:[],stop_reason:'max_tokens'})}}};
    await assert.rejects(sendToolRequest(claude,input,'system',tools),/truncated/);
    const refused={model_name:'test',openai:{chat:{completions:{create:()=>Promise.resolve({choices:[{message:{refusal:'Unavailable'}}]})}}}};
    await assert.rejects(sendToolRequest(refused,input,'system',tools),/declined/);
});

test('cancelling during generation prevents a pending tool call from executing', async () => {
    setSettings({agent_max_steps: 3});
    let resolve;
    const response = new Promise(done => { resolve = done; });
    const agent = {name: 'TestBot', prompter: {promptTools: () => response}, routeResponse: () => {throw new Error('stale reply');}};
    const task = new TaskAgent(agent);
    const pending = task.runLoop([...input]);
    task.cancelTask();
    resolve(['', [{id: 'stop', name: 'stop', arguments: {}}]]);
    assert.equal((await pending).usedTool, false);
});

test('task loop feeds query results back natively and does not accept premature completion', async t => {
    setSettings({agent_max_steps: 3});
    const query = getCommand('!stats');
    const original = query.perform;
    query.perform = () => 'Position: 1,64,2';
    t.after(() => {query.perform = original;});
    let requests = 0;
    const agent = {name: 'TestBot', prompter: {profile: {}, requestTools: history => {
        requests++;
        if (requests === 1) return Promise.resolve(['{"work_done":true}', [{id: 'query-1', name: 'stats', arguments: {}}]]);
        assert.equal(history.at(-1).role, 'tool');
        assert.equal(history.at(-1).tool_call_id, 'query-1');
        assert.equal(history.at(-1).content, 'Position: 1,64,2');
        return Promise.resolve(['{"work_done":true,"chat_response":"Located"}', []]);
    }}, routeResponse: () => Promise.resolve()};
    const task = new TaskAgent(agent);
    const result = await task.performTask('Locate yourself');
    assert.equal(requests, 2);
    assert.equal(result.work_done, true);
    assert.equal(task.is_running, false);
});

test('task lifecycle releases running state after a provider failure', async () => {
    setSettings({agent_max_steps: 3});
    const task = new TaskAgent({prompter: {profile: {}, requestTools: () => Promise.reject(new Error('quota'))}});
    await assert.rejects(task.performTask('test'), /quota/);
    assert.equal(task.is_running, false);
    assert.equal(task.currentTaskDescription, null);
});

test('native agent serializes overlapping conversations and stop invalidates queued requests', async () => {
    setSettings({agent_max_steps: 3});
    let resolve;
    let count = 0;
    const waiting = new Promise(done => {resolve = done;});
    const agent = {name: 'TestBot', history: {getHistory: () => [...input], add: () => Promise.resolve(), save: () => Promise.resolve()},
        prompter: {use_brain: false, promptTools: () => {count++; return waiting;}}, routeResponse: () => Promise.resolve()};
    const system = new AgentSystem(agent);
    const first = system.handleMessage('Player', 'hi', () => false, 3);
    const second = system.handleMessage('Player', 'again', () => false, 3);
    await Promise.resolve();
    assert.equal(count, 1);
    system.cancelTask();
    resolve(['old response', []]);
    await Promise.all([first, second]);
    assert.equal(count, 1);
});

test('generated augments require explicit code permission and registries are bot-scoped', async () => {
    setSettings({allow_insecure_coding: false});
    await assert.rejects(new CodeAgent({}).generateAugment({}), /disabled/);
    const spec = {augment_name: 'safeName', description: 'test', parameters: []};
    validateAugmentSpec(spec);
    for (const name of ['../outside', 'x";boom()', '']) assert.throws(() => validateAugmentSpec({...spec, augment_name: name}));
    assert.throws(() => validateAugmentSpec({...spec, parameters: [{name: 'return', type: 'string', description: ''}]}));
    const first = {}, second = {};
    getAugmentRegistry(first).set('example', {});
    assert.equal(getAugmentRegistry(second).has('example'), false);
});

test('brain task replacement waits for cancellation and never runs two task loops', async () => {
    setSettings({agent_max_steps: 3});
    const agent = {name: 'TestBot', prompter: {use_brain: true},
        history: {add: () => Promise.resolve(), save: () => Promise.resolve()},
        actions: {stop: () => Promise.resolve()}, routeResponse: () => Promise.resolve()};
    const system = new AgentSystem(agent);
    system.brain.processRequest = () => Promise.resolve({route: 'task', task_description: 'test', task_action: 'cancel_and_start'});
    system.rp.respond = () => Promise.resolve(null);
    const resolvers = [];
    let running = 0;
    let maximum = 0;
    system.task.performTask = () => {
        system.task.cancelJob = false;
        running++;
        maximum = Math.max(maximum, running);
        return new Promise(resolve => {resolvers.push(() => {running--; resolve({work_done: false, steps: 1});});});
    };
    await system.handleMessage('Player', 'first', () => false, 3);
    const replacement = system.handleMessage('Player', 'replace', () => false, 3);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(system.task.cancelJob, true);
    assert.equal(resolvers.length, 1);
    resolvers[0]();
    await replacement;
    assert.equal(resolvers.length, 2);
    assert.equal(maximum, 1);
    const active = system.activeTask;
    resolvers[1]();
    await active;
    assert.equal(system.activeTask, null);
});

test('new brain request after stop waits for the cancelled task rather than injecting into it', async () => {
    setSettings({agent_max_steps: 3});
    const agent = {name: 'TestBot', prompter: {use_brain: true},
        history: {add: () => Promise.resolve(), save: () => Promise.resolve()},
        actions: {stop: () => Promise.resolve()}, routeResponse: () => Promise.resolve()};
    const system = new AgentSystem(agent);
    system.brain.processRequest = () => Promise.resolve({route: 'task', task_description: 'test', task_action: 'start'});
    system.rp.respond = () => Promise.resolve(null);
    const resolvers = [];
    system.task.performTask = () => {
        system.task.cancelJob = false;
        return new Promise(resolve => {resolvers.push(() => resolve({work_done: false}));});
    };
    await system.handleMessage('Player', 'first', () => false, 3);
    system.cancelTask();
    const next = system.handleMessage('Player', 'new task', () => false, 3);
    await new Promise(resolve => setImmediate(resolve));
    resolvers[0]();
    await next;
    assert.equal(resolvers.length, 2);
    assert.equal(system.queue.hasItems(), false);
    const active = system.activeTask;
    resolvers[1]();
    await active;
});
