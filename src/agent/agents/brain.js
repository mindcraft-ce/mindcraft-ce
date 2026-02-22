import { Goals, checklistItem } from '../goals/goals.js';
import { brainAgentResponseFormat } from './responseFormat.js';
import settings from '../settings.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('BrainAgent');

const MAX_BRAIN_HISTORY = 20;

export class BrainAgent {
    constructor(agent, messageQueue) {
        this.agent = agent;
        this.messageQueue = messageQueue;
        this.goals = new Goals();
        this.active_goal = null;
        this.message_history = [];
        this._processing = false;
    }

    async processRequest(source, message) {
        if (!source || !message) return null;
        if (source === this.agent.name) return null;

        // reentrancy: if brain is mid-LLM-call, queue the message
        if (this._processing) {
            log.info(`Already processing, queuing message from ${source}`);
            if (this.messageQueue) {
                this.messageQueue.enqueue({ source, message, type: 'context' });
            }
            return { route: 'queued', thoughts: 'Brain is busy, message queued.' };
        }

        this._processing = true;

        try {
            log.info(`Request from ${source}: ${message}`);
            this._appendUserMessage(source, message);

            let response;
            try {
                [response] = await this.agent.prompter.handleRequest(
                    'brain', this.message_history, [], brainAgentResponseFormat
                );
                log.info(`Raw response: ${response}`);
            } catch (error) {
                log.error('LLM request failed:', error);
                return null;
            }

            let parsed;
            try {
                parsed = JSON.parse(response);
            } catch (e) {
                log.error('Failed to parse JSON:', response);
                return null;
            }

            this.message_history.push({ role: 'assistant', content: response });
            this._trimHistory();

            log.info(`Route: ${parsed.route} | Thoughts: ${parsed.thoughts}`);

            if (parsed.goal_action)
                this._handleGoalAction(parsed.goal_action);

            if (parsed.route === 'task') {
                const task_description = parsed.task_description || parsed.thoughts.split(/[.!?\n]/)[0].trim();
                const task_system_prompt = parsed.task_system_prompt || '';
                const task_action = parsed.task_action || 'start';

                log.info(`Task: ${task_description} (action: ${task_action})`);
                log.info(`System prompt (${task_system_prompt.length} chars)`);

                return { route: 'task', thoughts: parsed.thoughts, task_description, task_system_prompt, task_action };
            }

            return { route: 'rp', thoughts: parsed.thoughts };
        } finally {
            this._processing = false;
        }
    }

    recordTaskOutcome(result) {
        const outcome = result
            ? `[Task completed in ${result.steps || '?'} steps]: ${result.chat_response || 'Done.'}`
            : '[Task failed]';
        this.message_history.push({ role: 'user', content: outcome });
        this._trimHistory();
    }

    _appendUserMessage(source, message) {
        const goalsContext = this.goals.listFormattedGoals();
        const activeGoalContext = this.active_goal
            ? this.goals.listFormattedGoal(this.active_goal)
            : 'No active goal.';

        let taskStatus = '[Task Status]: No task running.';
        const taskAgent = this.agent.taskAgent;
        if (taskAgent?.is_running) {
            const desc = taskAgent.currentTaskDescription || 'unknown';
            const step = taskAgent.currentStep || '?';
            taskStatus = `[Task Status]: Running "${desc}" (step ${step}/${50})`;
        }

        this.message_history.push({
            role: 'user',
            content: `[${source}]: ${message}\n\n` +
                `${taskStatus}\n` +
                `[Current Goals]:\n${goalsContext}\n` +
                `[Active Goal]:\n${activeGoalContext}`
        });
        this._trimHistory();
    }

    _trimHistory() {
        const max = settings.max_messages || MAX_BRAIN_HISTORY;
        while (this.message_history.length > max)
            this.message_history.shift();
    }

    _handleGoalAction(goalAction) {
        const { action, goal, priority, goal_description, checklist, checklist_item, checklist_completed } = goalAction;

        switch (action) {
            case 'add':
                if (goal) {
                    const items = checklist ? checklist.map(desc => new checklistItem(desc)) : [];
                    this.goals.addGoal(goal, goal_description || '', priority || 1, items);
                    log.info(`Added goal: ${goal}`);
                    if (!this.active_goal || (priority && priority > (this.goals.getGoal(this.active_goal)?.priority || 0)))
                        this.active_goal = goal;
                }
                break;
            case 'remove':
                if (goal) {
                    this.goals.removeGoal(goal);
                    log.info(`Removed goal: ${goal}`);
                    if (this.active_goal === goal)
                        this.active_goal = this._getHighestPriorityGoal();
                }
                break;
            case 'set_priority':
                if (goal && priority !== undefined) {
                    this.goals.setPriority(goal, priority);
                    log.info(`Set priority of ${goal} to ${priority}`);
                }
                break;
            case 'mark_checklist_item':
                if (goal && checklist_item) {
                    const completed = checklist_completed !== undefined ? checklist_completed : true;
                    this.goals.markChecklistItem(goal, checklist_item, completed);
                    log.info(`Marked "${checklist_item}" as ${completed ? 'done' : 'incomplete'}`);
                }
                break;
            case 'recreate_checklist_item':
                if (goal && checklist_item) {
                    const goalObj = this.goals.getGoal(goal);
                    if (goalObj) {
                        goalObj.check_list.push(new checklistItem(checklist_item));
                        log.info(`Added checklist item "${checklist_item}" to ${goal}`);
                    }
                }
                break;
            default:
                log.warn(`Unknown goal action: ${action}`);
        }
    }

    _getHighestPriorityGoal() {
        const goals = this.goals.listGoals();
        if (goals.length === 0) return null;
        return goals.reduce((h, c) => c.priority > h.priority ? c : h).name;
    }

    getStatus() {
        return {
            active_goal: this.active_goal,
            goals: this.goals.listGoals(),
            history_length: this.message_history.length
        };
    }
}
