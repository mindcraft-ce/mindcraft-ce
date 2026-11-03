import assert from 'node:assert/strict';

const cancelledAction = () => ({ success: false, message: null, interrupted: true, timedout: false });

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
        this._activeAction = null;
        this._pendingAction = null;
        this._resumeVersion = 0;
    }

    resumeAction(actionFn, timeout) {
        return this._executeResume(actionFn, timeout);
    }

    runAction(actionLabel, actionFn, { timeout, resume = false } = {}) {
        return resume
            ? this._executeResume(actionLabel, actionFn, timeout)
            : this._executeAction(actionLabel, actionFn, timeout);
    }

    stop() {
        // A manual stop also cancels actions that have not acquired ownership.
        this._pendingAction = null;
        this._syncState();
        return this._stopCurrentAction();
    }

    _syncState() {
        this.executing = this._activeAction !== null || this._pendingAction !== null;
        this.currentActionLabel = this._activeAction?.label || '';
        this.currentActionFn = this._activeAction?.fn || null;
        this.timedout = this._activeAction?.timedout || false;
    }

    _stopCurrentAction(action = this._activeAction) {
        if (!action || this._activeAction !== action)
            return Promise.resolve();
        action.interrupted = true;
        // Assign the shared promise before plugin callbacks can re-enter stop().
        if (!action.stopping) {
            action.stopping = Promise.resolve().then(() => this._stopAction(action)).catch(error => {
                action.stopping = null;
                throw error;
            });
        }
        return action.stopping;
    }

    async _stopAction(action) {
        if (this._activeAction !== action)
            return;
        const timeout = setTimeout(() => {
            if (this._activeAction === action)
                this.agent.cleanKill(`Code execution refused stop after 10 seconds (stuck action: "${action.label}"). Killing process.`);
        }, 10000);
        try {
            while (this._activeAction === action) {
                this.agent.requestInterrupt();
                console.log('waiting for code to finish executing...');
                let poll;
                try {
                    await Promise.race([
                        action.done,
                        new Promise(resolve => { poll = setTimeout(resolve, 300); }),
                    ]);
                } finally {
                    clearTimeout(poll);
                }
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    cancelResume() {
        this._resumeVersion++;
        this.resume_func = null;
        this.resume_name = null;
    }

    async _executeResume(actionLabel = null, actionFn = null, timeout = 10) {
        const new_resume = actionFn != null;
        if (new_resume) {
            assert(actionLabel != null, 'actionLabel is required for new resume');
            this._resumeVersion++;
            this.resume_func = actionFn;
            this.resume_name = actionLabel;
        }
        if (this.resume_func != null && (this.agent.isIdle() || new_resume) && (!this.agent.self_prompter.isActive() || new_resume)) {
            return await this._executeAction(this.resume_name, this.resume_func, timeout, true);
        }
        return { success: false, message: null, interrupted: false, timedout: false };
    }

    async _executeAction(actionLabel, actionFn, timeout = 10, resume = false) {
        const request = { label: actionLabel, fn: actionFn, resumeVersion: this._resumeVersion };
        // Coalesce pending transitions: only the newest request may start.
        this._pendingAction = request;
        this._syncState();
        try {
            if (this._activeAction)
                console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentActionLabel}"`);
            await this._stopCurrentAction();
        } catch (error) {
            if (this._pendingAction === request) {
                this._pendingAction = null;
                this._syncState();
            }
            // Failure to stop another action must not release its state or logs.
            console.error('Failed to interrupt current action:', error);
            return { success: false, message: `Failed to interrupt current action: ${error}`, interrupted: true, timedout: false };
        }
        if (this._pendingAction !== request)
            return cancelledAction();
        this._pendingAction = null;
        if (resume && (this.resume_func !== actionFn || this._resumeVersion !== request.resumeVersion)) {
            this._syncState();
            return cancelledAction();
        }

        const action = { ...request, interrupted: false, timedout: false, timer: null };
        action.done = new Promise(resolve => { action.finish = resolve; });
        this._activeAction = action;
        this._syncState();
        this.agent.clearBotLogs();

        let failure = null;
        try {
            if (this.last_action_time > 0) {
                const time_diff = Date.now() - this.last_action_time;
                this.recent_action_counter = time_diff < 20 ? this.recent_action_counter + 1 : 0;
                if (this.recent_action_counter > 3) {
                    console.warn('Fast action loop detected, cancelling resume.');
                    this.cancelResume();
                }
                if (this.recent_action_counter > 5) {
                    console.error('Infinite action loop detected, shutting down.');
                    this.agent.cleanKill('Infinite action loop detected, shutting down.');
                    throw new Error('Infinite action loop detected, shutting down.');
                }
            }
            this.last_action_time = Date.now();
            console.log('executing code...\n');
            if (timeout > 0)
                action.timer = this._startTimeout(timeout, action);
            await actionFn();
        } catch (error) {
            failure = { error };
            if (this._resumeVersion === action.resumeVersion)
                this.cancelResume();
            console.error('Code execution triggered catch:', error);
            console.error(error?.stack);
        }
        return this._finishAction(action, failure);
    }

    _finishAction(action, failure) {
        clearTimeout(action.timer);
        if (this._activeAction !== action) {
            action.finish();
            return cancelledAction();
        }
        const interrupted = action.interrupted || this.agent.bot.interrupt_code;
        const timedout = action.timedout;
        let message;
        try {
            message = this.getBotOutputSummary();
            if (failure !== null) {
                message += '!!Code threw exception!!\n' +
                    `Error: ${failure.error}\nStack trace:\n${failure.error?.stack}\n`;
            }
        } finally {
            this.agent.clearBotLogs();
            this._activeAction = null;
            this._syncState();
            action.finish();
        }
        // Cleanup is complete before idle handlers can start a replacement.
        if (!interrupted && !this.executing)
            this.agent.bot.emit('idle');
        return { success: failure === null, message, interrupted, timedout };
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

    _startTimeout(TIMEOUT_MINS = 10, action = this._activeAction) {
        return setTimeout(() => {
            if (!action || this._activeAction !== action)
                return;
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            action.timedout = true;
            this._syncState();
            Promise.resolve(this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`))
                .catch(error => console.error('Failed to record action timeout:', error));
            this._stopCurrentAction(action)
                .catch(error => console.error('Failed to stop timed-out action:', error));
        }, TIMEOUT_MINS * 60 * 1000);
    }
}
