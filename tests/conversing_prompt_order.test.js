import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Prompter } from '../src/models/prompter.js';
import { setSettings } from '../src/agent/settings.js';

// Providers that cache a repeated start of a request by themselves (OpenAI, DeepSeek, Gemini, local servers
// that keep their KV cache) can reuse only what comes before the first part that changes. In the legacy
// !command prompt the command docs are the largest part and change least, so they and the fixed
// instructions come first, and the goal, the memory summary, the live stats, the inventory and the examples
// (picked per message) come after them.

const root = process.cwd();
const temporary = mkdtempSync(path.join(tmpdir(), 'mindcraft-prompt-order-'));
test.before(() => process.chdir(temporary));
test.after(() => { process.chdir(root); rmSync(temporary, {recursive: true, force: true}); });

function conversing(profile = {}) {
    setSettings({base_profile: 'assistant', num_examples: 0, blocked_actions: [], use_xml_prompts: false});
    const agent = {name: 'TestBot', history: {memory: ''}, blocked_actions: [], self_prompter: {isStopped: () => true}};
    return new Prompter(agent, {name: 'TestBot', model: 'ollama/test', cooldown: 0, use_function_calling: false, ...profile})
        .profile.conversing;
}

const changing = ['$SELF_PROMPT', '$MEMORY', '$STATS', '$INVENTORY', '$EXAMPLES'];

for (const [name, profile] of [['the plain prompt', {}], ['the XML prompt', {prompt_format: 'xml'}]]) {
    test(`${name} puts the fixed instructions and the command docs before every part that changes`, () => {
        const template = conversing(profile);
        const docs = template.indexOf('$COMMAND_DOCS');
        const instructions = template.indexOf('Be a friendly');
        assert.ok(docs > 0 && instructions > 0, 'the template has its command docs and instructions');
        assert.ok(instructions < docs, 'the instructions come before the command docs');
        for (const placeholder of changing) {
            const at = template.indexOf(placeholder);
            assert.ok(at > 0, `${placeholder} is in the template`);
            assert.ok(docs < at, `${placeholder} comes after the command docs`);
        }
    });
}
