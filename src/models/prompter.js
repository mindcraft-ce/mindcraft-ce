import { mkdirSync, writeFileSync } from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs, getCommand } from '../agent/commands/index.js';
import { SkillLibrary } from '../agent/library/skill_library.js';
import { stringifyTurns } from '../utils/text.js';
import settings from '../agent/settings.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectAPI, createModel } from './_model_map.js';
import { resolveProfile } from './profile_resolver.js';
import {
    resolveResponseTimeoutMs,
    sendWithResponseDeadline,
    shouldRetryPromptError,
} from './prompt_request_policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Prompter {
    constructor(agent, profile) {
        this.agent = agent;
        const defaults_dir = path.join(__dirname, '../../profiles/defaults');
        this.profile = resolveProfile(profile, settings.base_profile, defaults_dir);

        this.convo_examples = null;
        this.coding_examples = null;
        const name = this.profile.name;
        this.cooldown = this.profile.cooldown ? this.profile.cooldown : 0;
        this.last_prompt_time = 0;
        this.awaiting_coding = false;

        const chat_model_profile = selectAPI(this.profile.model);
        this.responseTimeoutMs = resolveResponseTimeoutMs(chat_model_profile);
        this.chat_model = createModel(chat_model_profile);

        if (this.profile.code_model) {
            const code_model_profile = selectAPI(this.profile.code_model);
            this.codeResponseTimeoutMs = resolveResponseTimeoutMs(code_model_profile);
            this.code_model = createModel(code_model_profile);
        } else {
            this.codeResponseTimeoutMs = this.responseTimeoutMs;
            this.code_model = this.chat_model;
        }

        if (this.profile.vision_model) {
            const vision_model_profile = selectAPI(this.profile.vision_model);
            this.vision_model = createModel(vision_model_profile);
        } else {
            this.vision_model = this.chat_model;
        }

        let embedding_model_profile = null;
        if (this.profile.embedding) {
            try {
                embedding_model_profile = selectAPI(this.profile.embedding);
            } catch {
                embedding_model_profile = null;
            }
        }
        if (embedding_model_profile) this.embedding_model = createModel(embedding_model_profile);
        else this.embedding_model = createModel({api: chat_model_profile.api});

        this.skill_libary = new SkillLibrary(agent, this.embedding_model);
        mkdirSync(`./bots/${name}`, { recursive: true });
        writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4));
    }

    getName() { return this.profile.name; }
    getInitModes() { return this.profile.modes; }

    async initExamples() {
        try {
            this.convo_examples = new Examples(this.embedding_model, settings.num_examples);
            this.coding_examples = new Examples(this.embedding_model, settings.num_examples);
            await Promise.all([
                this.convo_examples.load(this.profile.conversation_examples),
                this.coding_examples.load(this.profile.coding_examples),
                this.skill_libary.initSkillLibrary()
            ]);
            console.log('Examples initialized.');
        } catch (error) {
            console.error('Failed to initialize examples:', error);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    async replaceStrings(prompt, messages, examples=null, to_summarize=[], last_goals=null) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);
        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent) + '\n';
            stats += await getCommand('!entities').perform(this.agent) + '\n';
            stats += await getCommand('!nearbyBlocks').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) prompt = prompt.replaceAll('$INVENTORY', await getCommand('!inventory').perform(this.agent));
        if (prompt.includes('$ACTION')) prompt = prompt.replaceAll('$ACTION', this.agent.actions.currentActionLabel);
        if (prompt.includes('$COMMAND_DOCS')) prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs(this.agent));
        if (prompt.includes('$CODE_DOCS')) {
            const code_task_content = messages.slice().reverse().find(msg =>
                msg.role !== 'system' && msg.content.includes('!newAction(')
            )?.content?.match(/!newAction\((.*?)\)/)?.[1] || '';
            prompt = prompt.replaceAll('$CODE_DOCS', await this.skill_libary.getRelevantSkillDocs(code_task_content, settings.relevant_docs_count));
        }
        if (prompt.includes('$EXAMPLES') && examples !== null) prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages));
        if (prompt.includes('$MEMORY')) prompt = prompt.replaceAll('$MEMORY', this.agent.history.memory);
        if (prompt.includes('$TO_SUMMARIZE')) prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO')) prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        if (prompt.includes('$SELF_PROMPT')) {
            const self_prompt = !this.agent.self_prompter.isStopped() ? `YOUR CURRENT ASSIGNED GOAL: "${this.agent.self_prompter.prompt}"\n` : '';
            prompt = prompt.replaceAll('$SELF_PROMPT', self_prompt);
        }
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (const goal in last_goals) {
                goal_text += last_goals[goal]
                    ? `You recently successfully completed the goal ${goal}.\n`
                    : `You recently failed to complete the goal ${goal}.\n`;
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$BLUEPRINTS') && this.agent.npc.constructions) {
            const blueprints = Object.keys(this.agent.npc.constructions).join(', ');
            prompt = prompt.replaceAll('$BLUEPRINTS', blueprints);
        }
        const remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) console.warn('Unknown prompt placeholders:', remaining.join(', '));
        return prompt;
    }

    async checkCooldown() {
        const elapsed = Date.now() - this.last_prompt_time;
        if (elapsed < this.cooldown && this.cooldown > 0) await new Promise(r => setTimeout(r, this.cooldown - elapsed));
        this.last_prompt_time = Date.now();
    }

    _cleanReasoningOutput(generation) {
        if (typeof generation !== 'string') return generation;
        if (generation.includes('</think>')) generation = generation.split('</think>').pop();
        return generation.trim();
    }

    async _send(model, messages, prompt, timeoutMs) {
        return sendWithResponseDeadline(model, messages, prompt, { timeoutMs });
    }

    async promptConvo(messages) {
        this.most_recent_msg_time = Date.now();
        const current_msg_time = this.most_recent_msg_time;

        for (let i = 0; i < 3; i++) {
            await this.checkCooldown();
            if (current_msg_time !== this.most_recent_msg_time) return '';
            let prompt = await this.replaceStrings(this.profile.conversing, messages, this.convo_examples);
            let generation;
            try {
                generation = await this._send(this.chat_model, messages, prompt, this.responseTimeoutMs);
                if (typeof generation !== 'string') throw new Error('Generated response is not a string');
                console.log('Generated response:', generation);
                await this._saveLog(prompt, messages, generation, 'conversation');
            } catch (error) {
                console.error('Error during message generation or file writing:', error);
                if (!shouldRetryPromptError(error)) throw error;
                continue;
            }
            if (generation.includes('(FROM OTHER BOT)')) {
                console.warn('LLM hallucinated message as another bot. Trying again...');
                continue;
            }
            if (current_msg_time !== this.most_recent_msg_time) {
                console.warn(`${this.agent.name} received new message while generating, discarding old response.`);
                return '';
            }
            return this._cleanReasoningOutput(generation);
        }
        return '';
    }

    async promptCoding(messages) {
        if (this.awaiting_coding) return '```//no response```';
        this.awaiting_coding = true;
        await this.checkCooldown();
        const prompt = await this.replaceStrings(this.profile.coding, messages, this.coding_examples);
        try {
            const resp = await this._send(this.code_model, messages, prompt, this.codeResponseTimeoutMs);
            await this._saveLog(prompt, messages, resp, 'coding');
            return resp;
        } finally {
            this.awaiting_coding = false;
        }
    }

    async promptMemSaving(to_summarize) {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(this.profile.saving_memory, null, null, to_summarize);
        const resp = await this._send(this.chat_model, [], prompt, this.responseTimeoutMs);
        await this._saveLog(prompt, to_summarize, resp, 'memSaving');
        return this._cleanReasoningOutput(resp);
    }

    async promptShouldRespondToBot(new_message) {
        await this.checkCooldown();
        const messages = this.agent.history.getHistory();
        messages.push({role: 'user', content: new_message});
        const prompt = await this.replaceStrings(this.profile.bot_responder, null, null, messages);
        const res = await this._send(this.chat_model, [], prompt, this.responseTimeoutMs);
        return res.trim().toLowerCase() === 'respond';
    }

    async promptVision(messages, imageBuffer) {
        await this.checkCooldown();
        const prompt = await this.replaceStrings(this.profile.image_analysis, messages, null, null, null);
        return this.vision_model.sendVisionRequest(messages, prompt, imageBuffer);
    }

    async promptGoalSetting(messages, last_goals) {
        let system_message = await this.replaceStrings(this.profile.goal_setting, messages);
        let user_message = 'Use the below info to determine what goal to target next\n\n$LAST_GOALS\n$STATS\n$INVENTORY\n$CONVO';
        user_message = await this.replaceStrings(user_message, messages, null, null, last_goals);
        const res = await this._send(this.chat_model, [{role: 'user', content: user_message}], system_message, this.responseTimeoutMs);
        let goal = null;
        try {
            goal = JSON.parse(res.split('```')[1].replace('json', '').trim());
        } catch (err) {
            console.log('Failed to parse goal:', res, err);
        }
        if (!goal || !goal.name || !goal.quantity || isNaN(parseInt(goal.quantity))) return null;
        goal.quantity = parseInt(goal.quantity);
        return goal;
    }

    async _saveLog(prompt, messages, generation, tag) {
        if (!settings.log_all_prompts) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const task_id = this.agent.task.task_id;
        const taskPrefix = task_id == null ? '' : `Task ID: ${task_id}\n`;
        const logEntry = `[${timestamp}] ${taskPrefix}Prompt:\n${prompt}\n\nConversation:\n${JSON.stringify(messages, null, 2)}\n\nResponse:\n${generation}\n\n`;
        await this._saveToFile(`${tag}_${timestamp}.txt`, logEntry);
    }

    async _saveToFile(logFile, logEntry) {
        const task_id = this.agent.task.task_id;
        const logDir = task_id == null
            ? path.join(__dirname, `../../bots/${this.agent.name}/logs`)
            : path.join(__dirname, `../../bots/${this.agent.name}/logs/${task_id}`);
        await fs.mkdir(logDir, { recursive: true });
        await fs.appendFile(path.join(logDir, logFile), String(logEntry), 'utf-8');
    }
}
