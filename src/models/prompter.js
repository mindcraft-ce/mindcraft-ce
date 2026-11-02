import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from '../agent/commands/index.js';
import { SkillLibrary } from "../agent/library/skill_library.js";
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from '../agent/commands/index.js';
import settings from '../agent/settings.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectAPI, createModel } from './_model_map.js';
import { sendToolRequest, supportsNativeTools } from './_tool_request.js';
import { getToolDocs, getToolDefinitions } from '../agent/commands/tool_registry.js';
import { responseFormatSchema } from './_response_format.js';
import { narrationInstructions, narrationConfig } from '../agent/narration.js';
import { UsageMeter } from './usage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Prompter {
    constructor(agent, profile) {
        this.agent = agent;
        this.profile = profile;
        const defaults_dir = path.join(__dirname, '../../profiles/defaults');
        this.use_tools = profile.use_function_calling ?? settings.use_function_calling ?? true;
        this.use_brain = profile.use_brain_agent ?? settings.use_brain_agent ?? false;
        this.profile.use_rp_agent = profile.use_rp_agent ?? settings.use_rp_agent ?? true;
        if (this.use_brain && !this.use_tools) throw new Error('use_brain_agent requires use_function_calling=true');
        const format = profile.prompt_format ?? settings.prompt_format ?? 'auto';
        if (!['auto', 'xml'].includes(format)) throw new Error('prompt_format must be auto or xml');
        const xml = format === 'xml' || (profile.use_xml_prompts ?? settings.use_xml_prompts ?? false);
        narrationConfig(profile);
        const promptType = this.use_tools ? 'tools' : 'commands';
        let default_profile = JSON.parse(readFileSync(path.join(defaults_dir, '_default.json'), 'utf8'));
        const promptOverrides = {};
        if (xml || this.use_tools) {
            for (const key of ['conversing', 'coding', 'saving_memory', 'bot_responder', 'image_analysis'])
                promptOverrides[key] = readFileSync(path.join(defaults_dir, promptType, `${key}.xml`), 'utf8');
        }
        if (this.use_brain) {
            for (const key of ['brain_agent', 'rp_agent', 'task_agent', 'executor_agent', 'code_agent'])
                promptOverrides[key] = readFileSync(path.join(defaults_dir, 'tools', `${key}.xml`), 'utf8');
        }
        Object.assign(default_profile, promptOverrides);
        let base_fp = '';
        if (settings.base_profile.includes('survival')) {
            base_fp = path.join(defaults_dir, 'survival.json');
        } else if (settings.base_profile.includes('assistant')) {
            base_fp = path.join(defaults_dir, 'assistant.json');
        } else if (settings.base_profile.includes('creative')) {
            base_fp = path.join(defaults_dir, 'creative.json');
        } else if (settings.base_profile.includes('god_mode')) {
            base_fp = path.join(defaults_dir, 'god_mode.json');
        }
        let base_profile = JSON.parse(readFileSync(base_fp, 'utf8'));

        Object.assign(base_profile, promptOverrides);

        // first use defaults to fill in missing values in the base profile
        for (let key in default_profile) {
            if (base_profile[key] === undefined)
                base_profile[key] = default_profile[key];
        }
        // then use base profile to fill in missing values in the individual profile
        for (let key in base_profile) {
            if (this.profile[key] === undefined)
                this.profile[key] = base_profile[key];
        }
        // base overrides default, individual overrides base

        this.convo_examples = null;
        this.coding_examples = null;
        
        let name = this.profile.name;
        this.cooldown = this.profile.cooldown ? this.profile.cooldown : 0;
        this.last_prompt_time = 0;
        this.awaiting_coding = false;

        // for backwards compatibility, move max_tokens to params
        let max_tokens = null;
        if (this.profile.max_tokens)
            max_tokens = this.profile.max_tokens;

        let chat_model_profile = selectAPI(this.profile.model);
        this.chat_model = createModel(chat_model_profile);
        for (const role of ['brain','task','rp']) {
            const configured = this.profile[`${role}_model`] ?? settings[`${role}_model`];
            this[`${role}_model`] = configured ? createModel(selectAPI(structuredClone(configured))) : this.chat_model;
        }
        this.model_selection = this.profile.model_selection ?? settings.model_selection ?? {enabled:false};
        if (this.model_selection.enabled) {
            if (!Array.isArray(this.model_selection.models) || !this.model_selection.models.length)
                throw new Error('model_selection.models must contain a configured task-model roster');
            const ids = new Set();
            for (const entry of this.model_selection.models) {
                if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || !entry.model || ids.has(entry.id))
                    throw new Error('Task model roster requires unique IDs and a model for every entry');
                ids.add(entry.id);
                if (entry.scores && (typeof entry.scores !== 'object' || Array.isArray(entry.scores) ||
                    Object.values(entry.scores).some(n => !Number.isFinite(n)))) throw new Error(`Invalid scores for task model '${entry.id}'`);
            }
            if (this.model_selection.default_task_model && !this.model_selection.models.some(m => m.id === this.model_selection.default_task_model && m.enabled !== false))
                throw new Error('default_task_model must name an enabled roster entry');
        }
        this.task_models = new Map();
        this.pendingControllers = new Set();
        this.cancelEpoch = 0;
        this.roleEpochs = new Map();
        this.usage = new UsageMeter(this.profile.usage_budget ?? settings.usage_budget,
            {file:`./bots/${this.profile.name}/usage.json`});
        for (const model of [this.chat_model,this.brain_model,this.task_model,this.rp_model]) {
            this.usage.instrument(model, this.profile.model_pricing ?? settings.model_pricing);
        }
        if (this.use_tools && !supportsNativeTools(this.chat_model))
            throw new Error(`Provider '${this.chat_model.constructor.prefix}' does not support native tools; select a tool-capable provider or set use_function_calling=false.`);
        if (this.use_brain && [this.brain_model,this.task_model,this.rp_model].some(model => !supportsNativeTools(model)))
            throw new Error('Brain, Task and RP models must support the native tool request interface');

        if (this.profile.code_model) {
            let code_model_profile = selectAPI(this.profile.code_model);
            this.code_model = createModel(code_model_profile);
        }
        else {
            this.code_model = this.chat_model;
        }

        if (this.profile.vision_model) {
            let vision_model_profile = selectAPI(this.profile.vision_model);
            this.vision_model = createModel(vision_model_profile);
        }
        else {
            this.vision_model = this.chat_model;
        }
        this.usage.instrument(this.code_model, this.profile.model_pricing ?? settings.model_pricing);
        this.usage.instrument(this.vision_model, this.profile.model_pricing ?? settings.model_pricing);

        
        let embedding_model_profile = null;
        if (this.profile.embedding) {
            try {
                embedding_model_profile = selectAPI(this.profile.embedding);
            } catch (e) {
                embedding_model_profile = null;
            }
        }
        if (this.profile.embedding === false) {
            this.embedding_model = null;
        }
        else if (embedding_model_profile) {
            this.embedding_model = createModel(embedding_model_profile);
        }
        else {
            this.embedding_model = createModel({api: chat_model_profile.api});
        }

        this.skill_libary = new SkillLibrary(agent, this.embedding_model);
        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw new Error('Failed to save profile:', err);
            }
            console.log("Copy profile saved.");
        });
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async initExamples() {
        try {
            this.convo_examples = new Examples(this.embedding_model, settings.num_examples);
            this.coding_examples = new Examples(this.embedding_model, settings.num_examples);
            
            // Wait for both examples to load before proceeding
            await Promise.all([
                this.convo_examples.load(this.profile.conversation_examples),
                this.coding_examples.load(this.profile.coding_examples),
                this.skill_libary.initSkillLibrary()
            ]).catch(error => {
                // Preserve error details
                console.error('Failed to initialize examples. Error details:', error);
                console.error('Stack trace:', error.stack);
                throw error;
            });

            console.log('Examples initialized.');
        } catch (error) {
            console.error('Failed to initialize examples:', error);
            console.error('Stack trace:', error.stack);
            throw error; // Re-throw with preserved details
        }
    }

    async replaceStrings(prompt, messages, examples=null, to_summarize=[], last_goals=null) {
        prompt = prompt.replaceAll('$NARRATION_RULES', narrationInstructions(this.profile));
        prompt = prompt.replaceAll('$NAME', this.agent.name);

        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent) + '\n';
            stats += await getCommand('!entities').perform(this.agent) + '\n';
            stats += await getCommand('!nearbyBlocks').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) {
            let inventory = await getCommand('!inventory').perform(this.agent);
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$ACTION')) {
            prompt = prompt.replaceAll('$ACTION', this.agent.actions.currentActionLabel);
        }
        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', this.use_tools ? getToolDocs(this.agent) : getCommandDocs(this.agent));
        if (prompt.includes('$CODE_DOCS')) {
            const code_task_content = (messages || []).slice().reverse().find(msg =>
                msg.role !== 'system' && msg.content.includes('!newAction(')
            )?.content?.match(/!newAction\((.*?)\)/)?.[1] || '';

            prompt = prompt.replaceAll(
                '$CODE_DOCS',
                await this.skill_libary.getRelevantSkillDocs(code_task_content, settings.relevant_docs_count)
            );
        }
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', this.agent.history.memory);
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        if (prompt.includes('$SELF_PROMPT')) {
            // if active or paused, show the current goal
            let self_prompt = !this.agent.self_prompter.isStopped() ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` : '';
            prompt = prompt.replaceAll('$SELF_PROMPT', self_prompt);
        }
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (let goal in last_goals) {
                if (last_goals[goal])
                    goal_text += `You recently successfully completed the goal ${goal}.\n`;
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`;
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                let blueprints = '';
                for (let blueprint in this.agent.npc.constructions) {
                    blueprints += blueprint + ', ';
                }
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints.slice(0, -2));
            }
        }

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt;
    }

    async checkCooldown() {
        let elapsed = Date.now() - this.last_prompt_time;
        if (elapsed < this.cooldown && this.cooldown > 0) {
            await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        }
        this.last_prompt_time = Date.now();
    }

    // Only experimental callers use the structured contract. Text/vision/memory callers
    // retain develop's string return value and provider behavior.
    async handleRequest(source, messages = [], tools = [], response_format = null) {
        const templates = { brain: 'brain_agent', rp: 'rp_agent', conversation: 'conversing' };
        const key = templates[source];
        if (!key) throw new Error(`Unknown request source: ${source}`);
        const examples = this.use_tools ? {createExampleMessage: () => Promise.resolve('Use the native function interface, not inline !commands.')} : this.convo_examples;
        let prompt = await this.replaceStrings(this.profile[key] || '', messages, examples);
        if (source === 'brain') prompt += '\nExact Task tool names available for grants (omit tools to grant the normal set): ' +
            getToolDefinitions(this.agent).map(t => t.function.name).join(', ');
        if (source === 'brain' && this.model_selection.enabled) prompt += '\nTask model choices: ' + JSON.stringify(
            (this.model_selection.models || []).filter(m => m.enabled !== false).map(m => ({id:m.id,notes:m.notes,scores:m.scores})));
        return await this.requestTools(messages, prompt, tools, response_format,
            source === 'brain' ? this.brain_model : source === 'rp' ? this.rp_model : this.chat_model, source);
    }

    selectTaskModel(id) {
        const selection = this.model_selection;
        if (!selection.enabled || !id) return this.task_model;
        const entry = selection.models?.find(m => m.id === id && m.enabled !== false);
        if (!entry) throw new Error(`Unknown or disabled task model '${id}'`);
        if (!this.task_models.has(id)) {
            const model = createModel(selectAPI(structuredClone(entry.model)));
            if (!supportsNativeTools(model)) throw new Error(`Task model '${id}' does not support native tools`);
            this.task_models.set(id, this.usage.instrument(model, entry.pricing));
        }
        return this.task_models.get(id);
    }

    async requestTools(messages, prompt, tools = [], response_format = null, model = this.chat_model, role = 'task') {
        const epoch = this.cancelEpoch, roleEpoch = this.roleEpochs.get(role) || 0;
        await this.checkCooldown();
        let requestMessages = messages;
        if (this.agent.bot?.entity?.position && this.agent.bot?.inventory) {
            const state = await this.replaceStrings('CURRENT STATE (fresh, takes precedence over older observations):\n$STATS\n$INVENTORY', []);
            requestMessages = [...messages, {role:'user',content:state}];
        }
        if (epoch !== this.cancelEpoch || roleEpoch !== (this.roleEpochs.get(role) || 0)) throw new Error('Request cancelled');
        const seconds = this.profile.request_timeout_seconds ?? settings.request_timeout_seconds ?? 120;
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('request_timeout_seconds must be positive');
        const controller = new AbortController();
        controller.role = role;
        this.pendingControllers.add(controller);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(seconds * 1000)]);
        let abort;
        let text, calls;
        try {
            [text, calls] = await this.usage.run(role, () => Promise.race([
                sendToolRequest(model, requestMessages, prompt, tools, response_format, {signal,role}),
                new Promise((_, reject) => {
                    abort = () => reject(signal.reason);
                    signal.addEventListener('abort', abort, {once:true});
                    if (signal.aborted) abort();
                }),
            ]));
        } finally {
            signal.removeEventListener('abort', abort);
            this.pendingControllers.delete(controller);
        }
        await this._saveLog(prompt, messages, JSON.stringify({ text, calls }), 'tools');
        return [text.includes('</think>') ? text.split('</think>').pop() : text, calls];
    }

    async promptTools(messages, tools) {
        return await this.handleRequest('conversation', messages, tools);
    }

    cancelPending(role = null) {
        if (role) this.roleEpochs.set(role, (this.roleEpochs.get(role) || 0) + 1);
        else this.cancelEpoch++;
        for (const controller of this.pendingControllers) {
            if (role && controller.role !== role) continue;
            controller.abort(new Error('Request cancelled'));
            this.pendingControllers.delete(controller);
        }
    }

    async promptConvo(messages) {
        this.most_recent_msg_time = Date.now();
        let current_msg_time = this.most_recent_msg_time;

        for (let i = 0; i < 3; i++) { // try 3 times to avoid hallucinations
            await this.checkCooldown();
            if (current_msg_time !== this.most_recent_msg_time) {
                return '';
            }

            let prompt = this.profile.conversing;
            prompt = await this.replaceStrings(prompt, messages, this.convo_examples);
            let generation;

            try {
                generation = await this.usage.run('conversation', () => this.chat_model.sendRequest(messages, prompt));
                if (typeof generation !== 'string') {
                    console.error('Error: Generated response is not a string', generation);
                    throw new Error('Generated response is not a string');
                }
                console.log("Generated response:", generation);
                await this._saveLog(prompt, messages, generation, 'conversation');

            } catch (error) {
                console.error('Error during message generation or file writing:', error);
                continue;
            }

            // Check for hallucination or invalid output
            if (generation?.includes('(FROM OTHER BOT)')) {
                console.warn('LLM hallucinated message as another bot. Trying again...');
                continue;
            }

            if (current_msg_time !== this.most_recent_msg_time) {
                console.warn(`${this.agent.name} received new message while generating, discarding old response.`);
                return '';
            }

            if (generation?.includes('</think>')) {
                const [_, afterThink] = generation.split('</think>');
                generation = afterThink;
            }

            return generation;
        }

        return '';
    }

    async promptCoding(messages) {
        if (this.awaiting_coding) {
            console.warn('Already awaiting coding response, returning no response.');
            return '```//no response```';
        }
        this.awaiting_coding = true;
        await this.checkCooldown();
        let prompt = this.profile.coding;
        prompt = await this.replaceStrings(prompt, messages, this.coding_examples);

        let resp;
        try { resp = await this.usage.run('coding', () => this.code_model.sendRequest(messages, prompt)); }
        finally { this.awaiting_coding = false; }
        await this._saveLog(prompt, messages, resp, 'coding');
        return resp;
    }

    async promptMemSaving(to_summarize) {
        await this.checkCooldown();
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, to_summarize);
        let resp = await this.usage.run('summary', () => this.chat_model.sendRequest([], prompt));
        await this._saveLog(prompt, to_summarize, resp, 'memSaving');
        if (resp?.includes('</think>')) {
            const [_, afterThink] = resp.split('</think>');
            resp = afterThink;
        }
        return resp;
    }

    async promptShouldRespondToBot(new_message) {
        await this.checkCooldown();
        let prompt = this.profile.bot_responder;
        let messages = this.agent.history.getHistory();
        messages.push({role: 'user', content: new_message});
        prompt = await this.replaceStrings(prompt, null, null, messages);
        let res = await this.usage.run('classifier', () => this.chat_model.sendRequest([], prompt));
        return res.trim().toLowerCase() === 'respond';
    }

    async promptVision(messages, imageBuffer) {
        await this.checkCooldown();
        let prompt = this.profile.image_analysis;
        prompt = await this.replaceStrings(prompt, messages, null, null, null);
        return await this.usage.run('vision', () => this.vision_model.sendVisionRequest(messages, prompt, imageBuffer));
    }

    async promptGoalSetting(messages, last_goals) {
        // deprecated
        let system_message = this.profile.goal_setting;
        system_message = await this.replaceStrings(system_message, messages);

        let user_message = 'Use the below info to determine what goal to target next\n\n';
        user_message += '$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO';
        user_message = await this.replaceStrings(user_message, messages, null, null, last_goals);
        let user_messages = [{role: 'user', content: user_message}];

        let res = await this.chat_model.sendRequest(user_messages, system_message);

        let goal = null;
        try {
            let data = res.split('```')[1].replace('json', '').trim();
            goal = JSON.parse(data);
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
        }
        if (!goal || !goal.name || !goal.quantity || isNaN(parseInt(goal.quantity))) {
            console.log('Failed to set goal:', res);
            return null;
        }
        goal.quantity = parseInt(goal.quantity);
        return goal;
    }

    async _saveLog(prompt, messages, generation, tag) {
        if (!settings.log_all_prompts)
            return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let logEntry;
        let task_id = this.agent.task.task_id;
        if (task_id == null) {
            logEntry = `[${timestamp}] \nPrompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        } else {
            logEntry = `[${timestamp}] Task ID: ${task_id}\nPrompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        }
        const logFile = `${tag}_${timestamp}.txt`;
        await this._saveToFile(logFile, logEntry);
    }

    async _saveToFile(logFile, logEntry) {
        let task_id = this.agent.task.task_id;
        let logDir;
        if (task_id == null) {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs`);
        } else {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs/${task_id}`);
        }

        await fs.mkdir(logDir, { recursive: true });

        logFile = path.join(logDir, logFile);
        await fs.appendFile(logFile, String(logEntry), 'utf-8');
    }
}
