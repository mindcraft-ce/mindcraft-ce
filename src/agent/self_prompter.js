const STOPPED = 0;
const ACTIVE = 1;
const PAUSED = 2;

export class SelfPrompter {
    constructor(agent) {
        this.agent = agent;
        this.state = STOPPED;
        this.loop_active = false;
        this.loopPromise = null;
        this.restartAfterStop = false;
        this.interrupt = false;
        this.prompt = '';
        this.idle_time = 0;
        this.cooldown = 2000;
    }

    start(prompt) {
        console.log('Self-prompting started.');
        if (!prompt) {
            if (!this.prompt)
                return 'No prompt specified. Ignoring request.';
            prompt = this.prompt;
        }
        this.state = ACTIVE;
        this.prompt = prompt;

        if (this.loopPromise) {
            // A newer start request wins over an in-flight stop/pause. Let the
            // owned loop unwind first, then start a fresh loop exactly once.
            this.restartAfterStop = true;
            return;
        }

        this.interrupt = false;
        void this.startLoop();
    }

    isActive() {
        return this.state === ACTIVE;
    }

    isStopped() {
        return this.state === STOPPED;
    }

    isPaused() {
        return this.state === PAUSED;
    }

    handleLoad(prompt, state) {
        if (state == undefined)
            state = STOPPED;
        this.state = state;
        this.prompt = prompt;
        if (state !== STOPPED && !prompt)
            throw new Error('No prompt loaded when self-prompting is active');
        if (state === ACTIVE) {
            this.start(prompt);
        }
    }

    setPromptPaused(prompt) {
        this.prompt = prompt;
        this.state = PAUSED;
    }

    async _runLoop() {
        let no_command_count = 0;
        const MAX_NO_COMMAND = 3;
        while (!this.interrupt) {
            const msg = `You are self-prompting with the goal: '${this.prompt}'. Your next response MUST contain a command with this syntax: !commandName. Respond:`;

            let used_command = await this.agent.handleMessage('system', msg, -1);
            if (!used_command) {
                no_command_count++;
                if (no_command_count >= MAX_NO_COMMAND) {
                    let out = `Agent did not use command in the last ${MAX_NO_COMMAND} auto-prompts. Stopping auto-prompting.`;
                    this.agent.openChat(out);
                    console.warn(out);
                    this.state = STOPPED;
                    break;
                }
            }
            else {
                no_command_count = 0;
                await new Promise(r => setTimeout(r, this.cooldown));
            }
        }
    }

    async startLoop() {
        if (this.loopPromise) {
            console.warn('Self-prompt loop is already active. Ignoring request.');
            return this.loopPromise;
        }

        console.log('starting self-prompt loop');
        this.loop_active = true;
        const loopPromise = this._runLoop();
        this.loopPromise = loopPromise;

        try {
            await loopPromise;
        } catch (error) {
            this.state = STOPPED;
            this.restartAfterStop = false;
            console.error('Self-prompt loop failed:', error);
        } finally {
            console.log('self prompt loop stopped');
            this.loop_active = false;
            if (this.loopPromise === loopPromise)
                this.loopPromise = null;

            const shouldRestart = this.restartAfterStop && this.state === ACTIVE;
            this.restartAfterStop = false;
            if (shouldRestart) {
                this.interrupt = false;
                void this.startLoop();
            }
        }
    }

    update(delta) {
        if (this.state === ACTIVE && !this.loop_active && !this.interrupt) {
            if (this.agent.isIdle())
                this.idle_time += delta;
            else
                this.idle_time = 0;

            if (this.idle_time >= this.cooldown) {
                console.log('Restarting self-prompting...');
                void this.startLoop();
                this.idle_time = 0;
            }
        }
        else {
            this.idle_time = 0;
        }
    }

    async stopLoop() {
        if (this.loopPromise)
            console.log('stopping self-prompt loop');
        this.interrupt = true;

        const activeLoop = this.loopPromise;
        if (activeLoop)
            await activeLoop;

        this.interrupt = false;
    }

    async stop(stop_action=true) {
        this.state = STOPPED;
        this.restartAfterStop = false;
        this.interrupt = true;
        if (stop_action)
            await this.agent.actions.stop();
        await this.stopLoop();
    }

    async pause() {
        this.state = PAUSED;
        this.restartAfterStop = false;
        this.interrupt = true;
        await this.agent.actions.stop();
        await this.stopLoop();
    }

    shouldInterrupt(is_self_prompt) {
        return is_self_prompt && (this.state === ACTIVE || this.state === PAUSED) && this.interrupt;
    }

    handleUserPromptedCmd(is_self_prompt, is_action) {
        if (!is_self_prompt && is_action) {
            void this.stopLoop();
        }
    }
}
