export class ActionManager {
    /**
     * Cancels the current action, optionally with a reason.
     * @param {string} reason - Optional reason for cancellation.
     */
    cancelCurrentAction(reason) {
        if (reason) {
            console.log(`Action cancelled: ${reason}`);
        }
        this.cancelResume();
        this.stop();
    }
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentActionLabel = '';
        this.currentActionFn = null;
        this.timedout = false;
        this.resume_func = null;
        this.resume_name = '';
    }

    async resumeAction(actionFn, timeout) {
        return this._executeResume(actionFn, timeout);
    }

    async runAction(actionLabel, actionFn, { timeout, resume = false } = {}) {
        if (resume) {
            return this._executeResume(actionLabel, actionFn, timeout);
        } else {
            return this._executeAction(actionLabel, actionFn, timeout);
        }
    }

    async stop() {
        if (!this.executing) return;
        
        const maxRetries = 5; // Max 1.5 seconds of waiting (5 * 300ms)
        let retries = 0;
        
        const timeout = setTimeout(() => {
            this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
        }, 10000);
        
        while (this.executing && retries < maxRetries) {
            this.agent.requestInterrupt();
            console.log(`waiting for code to finish executing... (attempt ${retries + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 300));
            retries++;
        }
        
        clearTimeout(timeout);
        
        // Force stop if still executing after max retries
        if (this.executing) {
            console.warn('Force stopping execution after max retries reached');
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            this.cancelResume();
            this.agent.clearBotLogs();
        }
    } 

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    async _executeResume(actionLabel = null, actionFn = null, timeout = 10) {
        const new_resume = actionFn != null;
        if (new_resume) { // start new resume
            this.resume_func = actionFn;
            assert(actionLabel != null, 'actionLabel is required for new resume');
            this.resume_name = actionLabel;
        }
        if (this.resume_func != null && (this.agent.isIdle() || new_resume) && (!this.agent.self_prompter.isActive() || new_resume)) {
            this.currentActionLabel = this.resume_name;
            let res = await this._executeAction(this.resume_name, this.resume_func, timeout);
            this.currentActionLabel = '';
            return res;
        } else {
            return { success: false, message: null, interrupted: false, timedout: false };
        }
    }

    async _executeAction(actionLabel, actionFn, timeout = 10) {
        let TIMEOUT;
        try {
            console.log('executing code...\n');

            // await current action to finish (executing=false), with 10 seconds timeout
            // also tell agent.bot to stop various actions
            if (this.executing) {
                console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentActionLabel}"`);
            }
            await this.stop();

            // clear bot logs and reset interrupt code
            this.agent.clearBotLogs();

            this.executing = true;
            this.currentActionLabel = actionLabel;
            this.currentActionFn = actionFn;

            // timeout in minutes
            if (timeout > 0) {
                // Cap timeout at 15 minutes to prevent hanging
                const maxTimeout = 15;
                if (timeout > maxTimeout) {
                    console.warn(`Timeout capped from ${timeout} to ${maxTimeout} minutes`);
                    timeout = maxTimeout;
                }
                TIMEOUT = this._startTimeout(timeout);
            }

            // start the action
            await actionFn();

            // mark action as finished + cleanup
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);

            // get bot activity summary
            let output = this.getBotOutputSummary();
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.agent.clearBotLogs();

            // if not interrupted and not generating, emit idle event
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }

            // return action status report
            return { success: true, message: output, interrupted, timedout };
        } catch (err) {
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            
            console.error("Code execution triggered catch:", err);
            
            // Handle PathStopped errors specifically - these are normal interruptions
            if (err.name === 'PathStopped' || err.message?.includes('PathStopped')) {
                console.log('PathStopped error caught - treating as successful interruption');
                let output = this.getBotOutputSummary();
                let interrupted = true; // PathStopped means we were interrupted
                this.agent.clearBotLogs();
                this.agent.bot.emit('idle');
                return { success: true, message: output, interrupted, timedout: false };
            }
            
            // Handle GoalChanged errors specifically - these are also normal interruptions
            if (err.name === 'GoalChanged' || err.message?.includes('GoalChanged')) {
                console.log('GoalChanged error caught - treating as successful interruption');
                let output = this.getBotOutputSummary();
                let interrupted = true; // GoalChanged means we were interrupted
                this.agent.clearBotLogs();
                this.agent.bot.emit('idle');
                return { success: true, message: output, interrupted, timedout: false };
            }
            
            // Handle GoalChanged errors specifically - these happen when modes interrupt actions
            if (err.name === 'GoalChanged' || err.message?.includes('GoalChanged')) {
                console.log('GoalChanged error caught - treating as interruption by autonomous mode');
                let output = this.getBotOutputSummary();
                let interrupted = true; // GoalChanged means we were interrupted by a mode
                this.agent.clearBotLogs();
                this.agent.bot.emit('idle');
                return { success: true, message: output, interrupted, timedout: false };
            }
            
            // Log the full stack trace for other errors
            console.error(err.stack);
            await this.stop();
            err = err.toString();

            let message = this.getBotOutputSummary() +
                '!!Code threw exception!!\n' +
                'Error: ' + err + '\n' +
                'Stack trace:\n' + err.stack+'\n';

            let interrupted = this.agent.bot.interrupt_code;
            this.agent.clearBotLogs();
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }
            return { success: false, message, interrupted, timedout: false };
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
            await this.stop(); // last attempt to stop
        }, TIMEOUT_MINS * 60 * 1000);
    }

}