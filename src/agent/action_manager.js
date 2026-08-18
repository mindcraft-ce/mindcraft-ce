import assert from 'node:assert/strict';
import { AsyncMutex } from '../utils/async_mutex.js';

export class ActionManager {
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentActionLabel = '';
        this.currentActionFn = null;
        this.timedout = false;
        this.resume_func = null;
        this.resume_name = '';
        this.last_action_time = 0;
        this.recent_action_counter = 0;
        this.actionMutex = new AsyncMutex();
        this.stopPromise = null;
    }

    resumeAction(timeout) {
        return this.actionMutex.runExclusive(() => this._executeResume(null, null, timeout));
    }

    runAction(actionLabel, actionFn, { timeout, resume = false } = {}) {
        // Preserve the existing "new action interrupts current action" behavior,
        // but let the mutex own who is allowed to mutate ActionManager state.
        if (this.executing) {
            console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentActionLabel}"`);
            void this.stop().catch(error => {
                console.error('Failed to stop current action before queued action:', error);
            });
        }

        return this.actionMutex.runExclusive(() => {
            if (resume) {
                return this._executeResume(actionLabel, actionFn, timeout);
            }
            return this._executeAction(actionLabel, actionFn, timeout);
        });
    }

    async stop() {
        if (this.stopPromise) return this.stopPromise;
        if (!this.executing) return;

        this.stopPromise = (async () => {
            const timeout = setTimeout(() => {
                this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
            }, 10000);
            try {
                while (this.executing) {
                    this.agent.requestInterrupt();
                    console.log('waiting for code to finish executing...');
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } finally {
                clearTimeout(timeout);
            }
        })();

        try {
            return await this.stopPromise;
        } finally {
            this.stopPromise = null;
        }
    }

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    async _executeResume(actionLabel = null, actionFn = null, timeout = 10) {
        const new_resume = actionFn != null;
        if (new_resume) {
            this.resume_func = actionFn;
            assert(actionLabel != null, 'actionLabel is required for new resume');
            this.resume_name = actionLabel;
        }
        if (this.resume_func != null && (this.agent.isIdle() || new_resume) && (!this.agent.self_prompter.isActive() || new_resume)) {
            this.currentActionLabel = this.resume_name;
            const res = await this._executeAction(this.resume_name, this.resume_func, timeout);
            this.currentActionLabel = '';
            return res;
        }
        return { success: false, message: null, interrupted: false, timedout: false };
    }

    async _executeAction(actionLabel, actionFn, timeout = 10) {
        let TIMEOUT;
        this.timedout = false;
        try {
            if (this.last_action_time > 0) {
                const time_diff = Date.now() - this.last_action_time;
                if (time_diff < 20) {
                    this.recent_action_counter++;
                }
                else {
                    this.recent_action_counter = 0;
                }
                if (this.recent_action_counter > 3) {
                    console.warn('Fast action loop detected, cancelling resume.');
                    this.cancelResume();
                }
                if (this.recent_action_counter > 5) {
                    console.error('Infinite action loop detected, shutting down.');
                    this.agent.cleanKill('Infinite action loop detected, shutting down.');
                    return { success: false, message: 'Infinite action loop detected, shutting down.', interrupted: false, timedout: false };
                }
            }
            this.last_action_time = Date.now();
            console.log('executing code...\n');

            // A previous owner may still be finishing an externally requested stop.
            await this.stop();

            this.agent.clearBotLogs();

            this.executing = true;
            this.currentActionLabel = actionLabel;
            this.currentActionFn = actionFn;

            if (timeout > 0) {
                TIMEOUT = this._startTimeout(timeout);
            }

            await actionFn();

            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);

            const output = this.getBotOutputSummary();
            const interrupted = this.agent.bot.interrupt_code;
            const timedout = this.timedout;
            this.agent.clearBotLogs();

            if (!interrupted) {
                this.agent.bot.emit('idle');
            }

            return { success: true, message: output, interrupted, timedout };
        } catch (err) {
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error('Code execution triggered catch:', err);
            console.error(err?.stack);
            await this.stop();

            const errString = err instanceof Error ? err.toString() : String(err);
            const stack = err instanceof Error && err.stack ? err.stack : '';
            const message = this.getBotOutputSummary() +
                '!!Code threw exception!!\n' +
                'Error: ' + errString + '\n' +
                'Stack trace:\n' + stack + '\n';

            const interrupted = this.agent.bot.interrupt_code;
            const timedout = this.timedout;
            this.agent.clearBotLogs();
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }
            return { success: false, message, interrupted, timedout };
        }
    }

    getBotOutputSummary() {
        const { bot } = this.agent;
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Action output is very long (${output.length} chars) and has been shortened.\n
          First outputs:\n${output.substring(0, MAX_OUT / 2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT / 2)}`;
        }
        else {
            output = 'Action output:\n' + output.toString();
        }
        bot.output = '';
        return output;
    }

    _startTimeout(TIMEOUT_MINS = 10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            await this.stop();
        }, TIMEOUT_MINS * 60 * 1000);
    }
}
