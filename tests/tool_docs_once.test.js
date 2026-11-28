import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Prompter } from '../src/models/prompter.js';
import { setSettings } from '../src/agent/settings.js';
import { getToolDefinitions } from '../src/agent/commands/tool_registry.js';

// The native tool list already travels in the request's tools field. The system prompt must not carry a
// second copy of it: that doubled the prompt and made it change whenever the tool set did.

const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), 'mindcraft-tool-docs-'));
test.before(() => process.chdir(temporary));
test.after(() => { process.chdir(root); rmSync(temporary, {recursive: true, force: true}); });

function create(profile = {}) {
    setSettings({base_profile: 'assistant', num_examples: 0, blocked_actions: []});
    const agent = {name: 'TestBot', history: {memory: ''}, blocked_actions: [], self_prompter: {isStopped: () => true}};
    return new Prompter(agent, {name: 'TestBot', model: 'ollama/test', cooldown: 0, ...profile});
}
const examples = {createExampleMessage: () => Promise.resolve('')};

test('native tool mode sends the tool list once, in the tools field only', async () => {
    const prompter = create();
    const prompt = await prompter.replaceStrings(prompter.profile.conversing, [], examples);
    const tools = getToolDefinitions(prompter.agent);
    assert.ok(tools.length > 10);
    for (const tool of tools.slice(0, 10))
        assert.ok(!prompt.includes(tool.function.description), `${tool.function.name} is described in the prompt`);
    assert.match(prompt, /native function interface/);
    assert.ok(!prompt.includes('$COMMAND_DOCS'));
});

test('legacy !command mode still lists its commands in the prompt', async () => {
    const prompter = create({use_function_calling: false});
    // The legacy template also reads live stats, which need a bot; the command list is all this checks.
    const prompt = await prompter.replaceStrings('$COMMAND_DOCS', [], examples);
    assert.match(prompt, /!stats/);
    assert.match(prompt, /!collectBlocks/);
});
