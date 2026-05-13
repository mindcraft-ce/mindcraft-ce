import { executeTool, getToolDocs, getToolDefinitions } from '../commands/index.js';
import { CodeAgent, getAugment } from './code.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('TaskAgent');

const MAX_STEPS = 15;
const MAX_NO_TOOL_STREAK = 3;

export class TaskAgent {
    constructor(agent, messageQueue) {
        this.agent = agent;
        this.messageQueue = messageQueue;
        this.is_running = false;
        this.cancelJob = false;
        this.currentTaskDescription = null;
        this.currentStep = 0;
    }

    async performTask(taskDescription, systemPrompt) {
        this.is_running = true;
        this.cancelJob = false;
        this.currentTaskDescription = taskDescription;
        this.currentStep = 0;

        log.info(`Starting: ${taskDescription}`);

        // prepend task_agent.xml header if available
        let taskHeader = '';
        const headerTemplate = this.agent.prompter?.profile?.task_agent;
        if (headerTemplate) {
            taskHeader = await this.agent.prompter.replaceStrings(headerTemplate, [{ role: 'user', content: taskDescription }]);
            taskHeader += '\n\n';
        }

        const toolDocs = getToolDocs();
        const fullPrompt = `${taskHeader}${systemPrompt}\n\nTask: ${taskDescription}\n\n${toolDocs}\n\n` +
            `IMPORTANT: You MUST use the function calling interface to call tools. Do NOT just mention tools in your text response.\n` +
            `EFFICIENCY: For any structure that needs more than 3 blocks placed (walls, roofs, floors, towers, paths), use executeCode with a for-loop to place all blocks in a single call. Do NOT call placeBlockAt one block at a time — that wastes steps. Example: \`for (let x = 0; x < 5; x++) { for (let z = 0; z < 5; z++) { await skills.placeBlock(bot, 'cobblestone', baseX+x, baseY, baseZ+z); } }\`. Same for collecting many blocks: prefer collectBlocks(type, count) over many individual digs.\n` +
            `FOLLOW THROUGH: keep going until the structure is actually complete. Don't declare work_done until walls, roof, and door are all placed. Re-check the world (nearbyBlocks/stats) before claiming done.\n` +
            `After calling tools, respond with a brief JSON: {"thought": "...", "step_report": "...", "work_done": true/false}\n` +
            `Set work_done to true ONLY when the task is fully complete. Include "chat_response" when done to report back.`;

        const history = [{ role: 'system', content: fullPrompt }];
        let step = 0;
        let noToolStreak = 0;
        let lastParsed = null;

        while (step < MAX_STEPS && !this.cancelJob) {
            // drain queue from brain
            if (this.messageQueue?.hasItems()) {
                const items = this.messageQueue.drain();
                for (const item of items) {
                    if (item.type === 'cancel') {
                        log.info('Cancel request from brain.');
                        this.cancelJob = true;
                        break;
                    }
                    if (item.type === 'context') {
                        log.info(`Brain update from ${item.source}: ${item.message}`);
                        history.push({
                            role: 'user',
                            content: `[Brain Update from ${item.source}]: ${item.message}`
                        });
                    }
                }
                if (this.cancelJob) break;
            }

            step++;
            this.currentStep = step;
            log.info(`Step ${step}/${MAX_STEPS}`);

            let response, toolCalls;
            try {
                // null response_format — conflicts with tools on many providers
                [response, toolCalls] = await this.agent.prompter.chat_model.sendRequest(
                    history, null, getToolDefinitions(), null
                );
            } catch (error) {
                log.error(`LLM call failed at step ${step}:`, error);
                history.push(
                    { role: 'assistant', content: '' },
                    { role: 'user', content: `[Error]: LLM call failed: ${error.message}. Try again.` }
                );
                continue;
            }

            history.push({ role: 'assistant', content: response || '' });

            let parsed = this._parseResponse(response);
            if (parsed) {
                lastParsed = parsed;
                if (parsed.thought) log.info(`Thought: ${parsed.thought}`);
                if (parsed.step_report) log.info(`Report: ${parsed.step_report}`);
            }

            if (toolCalls && toolCalls.length > 0) {
                noToolStreak = 0;
                const results = await this._executeToolCalls(toolCalls);
                history.push({ role: 'user', content: `[Tool Results]:\n${results}` });
            } else {
                noToolStreak++;
                log.info(`No tool calls (streak: ${noToolStreak}/${MAX_NO_TOOL_STREAK})`);
            }

            if (parsed?.work_done) {
                log.info(`Task complete in ${step} steps.`);
                this._clearTaskStatus();
                return {
                    chat_response: parsed.chat_response || parsed.step_report || 'Task done.',
                    steps: step,
                    work_done: true
                };
            }

            if (noToolStreak > 0 && (!toolCalls || toolCalls.length === 0)) {
                if (noToolStreak >= MAX_NO_TOOL_STREAK) {
                    log.warn(`${MAX_NO_TOOL_STREAK} consecutive steps with no tool calls. Aborting.`);
                    this._clearTaskStatus();
                    return {
                        chat_response: 'I was unable to make progress on this task — my model could not call the required tools.',
                        steps: step,
                        work_done: false
                    };
                }

                const nudge = noToolStreak === 1
                    ? '[System]: No tools were called. You MUST use the function calling interface to invoke tools — do not just describe what you want to do.'
                    : `[System]: WARNING - ${noToolStreak} consecutive steps with no tool calls. You must actually invoke tools using the function calling API, not mention them in text. If you cannot call tools, set work_done=true to end the task.`;
                history.push({ role: 'user', content: nudge });
            }
        }

        this._clearTaskStatus();
        const reason = this.cancelJob ? 'Task cancelled.' : `Task stopped (${MAX_STEPS} step limit).`;
        this.cancelJob = false;
        log.info(reason);
        return {
            chat_response: lastParsed?.chat_response || reason,
            steps: step,
            work_done: false
        };
    }

    cancelTask() {
        this.cancelJob = true;
        log.info('Cancellation requested.');
    }

    _clearTaskStatus() {
        this.is_running = false;
        this.currentTaskDescription = null;
        this.currentStep = 0;
    }

    async _executeToolCalls(toolCalls) {
        const results = [];

        for (const call of toolCalls) {
            if (!call.name) {
                results.push('Error: Tool call missing name');
                continue;
            }

            log.info(`Calling tool: ${call.name}`);
            log.info(`  raw args (${typeof call.arguments}): ${JSON.stringify(call.arguments)?.slice(0,300)}`);

            // Responses API returns arguments as a JSON-encoded string. Parse so
            // executeTool's positional-arg mapping can read each parameter.
            let parsedArgs = call.arguments || {};
            if (typeof parsedArgs === 'string') {
                try { parsedArgs = JSON.parse(parsedArgs); } catch { parsedArgs = {}; }
            }
            log.info(`  parsed args: ${JSON.stringify(parsedArgs)?.slice(0,300)}`);

            try {
                const result = await executeTool(this.agent, call.name, parsedArgs);
                results.push(`${call.name}: ${result || 'Success (no output)'}`);
                log.info(`${call.name} -> ${result}`);
            } catch (error) {
                if (error.message.includes('not found')) {
                    const augResult = await this._tryAugment(call);
                    if (augResult !== null) {
                        results.push(`${call.name}: ${augResult || 'Success (no output)'}`);
                        continue;
                    }
                }
                results.push(`${call.name}: Error - ${error.message}`);
                log.error(`${call.name} failed:`, error.message);
            }
        }

        return results.join('\n');
    }

    async _tryAugment(call) {
        const augment = getAugment(call.name);
        if (!augment) return null;

        log.info(`Using augment: ${call.name}`);
        try {
            let args = call.arguments || {};
            if (typeof args === 'string') {
                try { args = JSON.parse(args); } catch { args = {}; }
            }
            const positionalArgs = Array.isArray(augment.parameters)
                ? augment.parameters.map(p => args[p.name])
                : [];
            return await augment.execute(this.agent, ...positionalArgs);
        } catch (error) {
            log.error(`Augment ${call.name} failed:`, error.message);
            return `Error: ${error.message}`;
        }
    }

    async requestAugment(spec) {
        const codeAgent = new CodeAgent(this.agent);
        try {
            const tool = await codeAgent.generateAugment(spec);
            return tool ? `Augment ${spec.augment_name} ready.` : `Failed to generate ${spec.augment_name}.`;
        } catch (error) {
            return `Augment error: ${error.message}`;
        }
    }

    _parseResponse(response) {
        if (!response?.trim()) return null;

        let clean = response.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        else if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);
        clean = clean.trim();

        if (clean.startsWith('{')) {
            let depth = 0, inStr = false, esc = false;
            for (let i = 0; i < clean.length; i++) {
                const ch = clean[i];
                if (esc) { esc = false; continue; }
                if (ch === '\\') { esc = true; continue; }
                if (ch === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (ch === '{') depth++;
                else if (ch === '}' && --depth === 0) {
                    clean = clean.slice(0, i + 1);
                    break;
                }
            }
        }

        try {
            return JSON.parse(clean);
        } catch {
            return null;
        }
    }
}
