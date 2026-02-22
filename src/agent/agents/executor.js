import { executorCodeAgentResponseFormat } from './responseFormat.js';
import { listAugments } from './code.js';
import { createLogger } from '../../utils/logger.js';
import settings from '../settings.js';
import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import { Vec3 } from 'vec3';

const log = createLogger('ExecutorAgent');

export class ExecutorCodeAgent {
    constructor(agent) {
        this.agent = agent;
        this.maxAttempts = 3;
    }

    async executeTask(task, context) {
        log.info(`Task: ${task}`);

        let lastError = null;

        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            if (this.agent.bot.interrupt_code) {
                log.info('Interrupted.');
                return 'Code execution interrupted.';
            }

            log.info(`Attempt ${attempt}/${this.maxAttempts}`);

            let response;
            try {
                const messages = await this._buildMessages(task, context, lastError);
                const model = this.agent.prompter.code_model || this.agent.prompter.chat_model;
                const [generation] = await model.sendRequest(
                    messages, null, null, executorCodeAgentResponseFormat
                );
                response = this._parseResponse(generation);
            } catch (error) {
                log.error(`LLM call failed (attempt ${attempt}):`, error.message);
                lastError = `LLM call failed: ${error.message}`;
                continue;
            }

            if (!response?.is_complete || !response.function_body) {
                log.warn(`Incomplete response: ${response?.error_analysis || 'unknown'}`);
                lastError = response?.error_analysis || 'Code generation incomplete';
                continue;
            }

            try {
                const result = await this._executeCode(response.function_body);
                log.info('Execution succeeded.');
                return result || 'Code executed successfully.';
            } catch (error) {
                log.error(`Execution failed (attempt ${attempt}):`, error.message);
                lastError = `Execution error: ${error.message}`;
                continue;
            }
        }

        log.error(`Failed after ${this.maxAttempts} attempts.`);
        return `Code execution failed after ${this.maxAttempts} attempts. Last error: ${lastError}`;
    }

    async _buildMessages(task, context, lastError) {
        let systemPrompt = this.agent.prompter?.profile?.executor_agent || '';

        if (systemPrompt.includes('$CODE_DOCS') && this.agent.prompter?.skill_libary) {
            const codeDocs = await this.agent.prompter.skill_libary.getRelevantSkillDocs(
                task, settings.relevant_docs_count
            );
            systemPrompt = systemPrompt.replace('$CODE_DOCS', codeDocs);
        }

        if (systemPrompt.includes('$AUGMENT_DOCS')) {
            const augments = listAugments();
            const augmentDocs = augments.length > 0
                ? augments.map(a => `- ${a.name}: ${a.description}`).join('\n')
                : 'No augments registered yet.';
            systemPrompt = systemPrompt.replace('$AUGMENT_DOCS', augmentDocs);
        }

        let userContent = `Execute this task:\n${task}`;
        if (context)
            userContent += `\n\nContext: ${context}`;
        if (lastError)
            userContent += `\n\nPREVIOUS ATTEMPT FAILED:\n${lastError}\nPlease fix and try again.`;

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ];
    }

    async _executeCode(functionBody) {
        const agent = this.agent;
        const bot = agent.bot;

        const wrappedFn = new Function(
            'agent', 'bot', 'skills', 'world', 'Vec3', 'log',
            `return (async () => {\n${functionBody}\n})();`
        );

        let result;
        const actionFn = async () => {
            result = await wrappedFn(agent, bot, skills, world, Vec3, skills.log);
        };

        const code_return = await agent.actions.runAction(
            'action:executeCode', actionFn,
            { timeout: settings.code_timeout_mins }
        );

        if (code_return.interrupted && !code_return.timedout)
            return 'Code execution was interrupted.';

        return result || code_return.message || 'Code executed.';
    }

    _parseResponse(response) {
        let clean = response.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        else if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);
        try {
            return JSON.parse(clean.trim());
        } catch {
            return null;
        }
    }
}
