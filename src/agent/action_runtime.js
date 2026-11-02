import { withAction, withoutAction, releaseAction } from './action_context.js';
import { ProgressTracker } from './progress.js';
import { toolResult } from './tool_result.js';

export class ActionManager {
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentActionLabel = '';
        this.currentActionFn = null;
        this.resume_func = null;
        this.resume_name = '';
        this.timedout = false;
        this.owner = null;
        this.sequence = 0;
        this.startQueue = Promise.resolve();
        this.progress = new ProgressTracker();
    }
    reportProgress(message) {
        this.progress.report(message);
        this.agent.bot.emit('action_progress', {action: this.currentActionLabel, message});
    }
    resumeAction() {
        if (!this.resume_func || this.executing || this.agent.self_prompter?.isActive()) return Promise.resolve({success: false});
        return this.runAction(this.resume_name, this.resume_func, {timeout: this.resume_timeout});
    }
    async runAction(label, fn, {timeout = 10, resume = false} = {}) {
        if (resume) { this.resume_func = fn; this.resume_name = label; this.resume_timeout = timeout; }
        let release;
        const previous = this.startQueue;
        this.startQueue = new Promise(resolve => { release = resolve; });
        await previous;
        let owner;
        try {
            await this.stop();
            this.agent.clearBotLogs();
            const controller = new AbortController();
            owner = {id: ++this.sequence, bot: this.agent.bot, controller, signal: controller.signal, cleanups:new Set()};
            this.owner = owner;
            this.executing = true;
            this.currentActionLabel = label;
            this.currentActionFn = fn;
            this.timedout = false;
            this.progress.reset();
        } finally { release(); }
        const timer = timeout > 0 ? setTimeout(() => {
            if (this.owner === owner) {
                this.timedout = true;
                owner.controller.abort(Object.assign(new Error(`Action timed out after ${timeout} minutes`), {code: 'timeout'}));
                withoutAction(() => this.agent.requestInterrupt());
            }
        }, timeout * 60000) : null;
        this.agent.bot.emit('action_start', {action: label, id: owner.id});
        let abort;
        try {
            const value = await Promise.race([
                withAction(owner, async () => await fn()),
                new Promise((_, reject) => {
                    abort = () => reject(owner.signal.reason);
                    owner.signal.addEventListener('abort', abort, {once: true});
                    if (owner.signal.aborted) abort();
                }),
            ]);
            const output = this.getBotOutputSummary();
            const result = value?.status ? value : toolResult(value === false ? 'failed' : 'ok', output);
            return this._finish(owner, result, output);
        } catch (error) {
            const cancelled = owner.signal.aborted;
            if (!cancelled) console.error(`Action ${label} failed:`, error.stack || error);
            const result = toolResult(cancelled ? (error?.code === 'timeout' ? 'failed' : 'cancelled') : 'failed',
                error?.message || String(error), error?.code || (cancelled ? 'interrupted' : 'error'));
            if (!cancelled) withoutAction(() => this.agent.requestInterrupt());
            return this._finish(owner, result, result.text);
        } finally {
            clearTimeout(timer);
            releaseAction(owner);
            owner.signal.removeEventListener('abort', abort);
            if (this.owner === owner) {
                this.executing = false;
                this.owner = null;
                this.currentActionLabel = '';
                this.currentActionFn = null;
                if (!owner.signal.aborted) this.agent.bot.emit('idle');
            }
        }
    }
    _finish(owner, result, output) {
        const ended = {...result, success: ['ok', 'partial'].includes(result.status), message: result.text || output,
            interrupted: owner.signal.aborted, timedout: owner.signal.reason?.code === 'timeout'};
        if (this.owner === owner) this.lastResult = ended;
        this.agent.bot.emit('action_complete', {id: owner.id, result: ended});
        return ended;
    }
    async stop() {
        const owner = this.owner;
        if (!owner) return;
        owner.controller.abort(Object.assign(new Error('Action cancelled'), {code: 'interrupted'}));
        withoutAction(() => this.agent.requestInterrupt());
        releaseAction(owner);
        await new Promise(resolve => setTimeout(resolve, 0));
        if (this.owner === owner) {
            this.owner = null;
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
        }
    }
    cancelResume() { this.resume_func = null; this.resume_name = ''; }
    getBotOutputSummary() {
        const output = String(this.agent.bot.output || '');
        this.agent.bot.output = '';
        return output.length > 4000 ? `${output.slice(0,1500)}\n...\n${output.slice(-2500)}` : output;
    }
}
