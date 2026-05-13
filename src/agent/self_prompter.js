const STOPPED = 0
const ACTIVE = 1
const PAUSED = 2
export class SelfPrompter {
    constructor(agent) {
        this.agent = agent;
        this.state = STOPPED;
        this.loop_active = false;
        this.interrupt = false;
        this.prompt = '';
        this.idle_time = 0;
        // Cooldown 2000-4000ms with per-bot random offset. Heartbeats now route
        // through the local idle_model (free), so we can tick fast without burning
        // Codex quota. User-driven chat still uses gpt-5.4-mini through Brain/Task path.
        this.cooldown = 2000 + Math.floor(Math.random() * 2000);

        this.next_step_explanation = null;
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
        this.startLoop();
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

    async handleLoad(prompt, state) {
        if (state == undefined)
            state = STOPPED;
        this.state = state;
        this.prompt = prompt;
        if (state !== STOPPED && !prompt)
            throw new Error('No prompt loaded when self-prompting is active');
        if (state === ACTIVE) {
            await this.start(prompt);
        }
    }

    async handleWorkUpdate(work_done, next_steps_explained) {
        if (!work_done && this.state === ACTIVE) {
            this.next_step_explanation = next_steps_explained;
        }
        else {
            this.next_step_explanation = null;
            this.stopLoop();
        }
    }

    setPromptPaused(prompt) {
        this.prompt = prompt;
        this.state = PAUSED;
    }

    async startLoop() {
        if (this.loop_active) {
            console.warn('Self-prompt loop is already active. Ignoring request.');
            return;
        }
        console.log('starting self-prompt loop')
        this.loop_active = true;
        let no_command_count = 0;
        // Don't permanently stop — transient failures (Ollama 500s, model not following format)
        // shouldn't kill autonomy. Reset count after a long miss streak instead of breaking.
        const MAX_NO_COMMAND = 60;
        while (!this.interrupt) {
            const msg = `Self-prompt tick. Goal: '${this.prompt}'. Use the function-calling interface to call ONE tool that advances a real project (gathering, crafting, building, exploring). PREFER productive tools: collectBlocks, craftRecipe, placeHere, goToCoordinates, goToPlayer, executeCode (for multi-block placements), smeltItem, equip, consume. AVOID rapid repetition of lookAtPlayer or rememberHere — you've already done those plenty. If you have nothing better to do, START a wood-gathering project: collectBlocks(type="oak_log", num=4). Tool call in your reply, no plain "!" chat text. Respond:`;
            
            let used_command = await this.agent.handleMessage('system', msg, -1);
            if (!used_command) {
                no_command_count++;
                if (no_command_count >= MAX_NO_COMMAND) {
                    // Don't permanently STOP — transient Ollama failures and "model said
                    // nothing useful" both end up here. Just reset the counter and back off
                    // with a longer sleep, then keep trying. Real bug = many failed ticks
                    // visible in logs, but autonomy resurrects on the next opportunity.
                    console.warn(`No command in ${MAX_NO_COMMAND} ticks; backing off for 30s and retrying.`);
                    no_command_count = 0;
                    await new Promise(r => setTimeout(r, 30000));
                    continue;
                }
            }
            else {
                no_command_count = 0;
            }
            // Always cooldown between ticks, success or not. Previously the sleep was only
            // in the success branch, so chat-only/no-command responses re-fired at API speed
            // (causing the rate-limit avalanche we saw — 75 calls/min from one bot).
            await new Promise(r => setTimeout(r, this.cooldown));
        }
        console.log('self prompt loop stopped')
        this.loop_active = false;
        this.interrupt = false;
    }

    update(delta) {
        // automatically restarts loop
        if (this.state === ACTIVE && !this.loop_active && !this.interrupt) {
            if (this.agent.isIdle())
                this.idle_time += delta;
            else
                this.idle_time = 0;

            if (this.idle_time >= this.cooldown) {
                console.log('Restarting self-prompting...');
                this.startLoop();
                this.idle_time = 0;
            }
        }
        else {
            this.idle_time = 0;
        }
    }

    async stopLoop() {
        // you can call this without await if you don't need to wait for it to finish
        if (this.interrupt)
            return;
        console.log('stopping self-prompt loop')
        this.interrupt = true;
        while (this.loop_active) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.interrupt = false;
    }

    async stop(stop_action=true) {
        this.interrupt = true;
        if (stop_action)
            await this.agent.actions.stop();
        this.stopLoop();
        this.state = STOPPED;
    }

    async pause() {
        this.interrupt = true;
        await this.agent.actions.stop();
        this.stopLoop();
        this.state = PAUSED;
    }

    shouldInterrupt(is_self_prompt) { // to be called from handleMessage
        return is_self_prompt && (this.state === ACTIVE || this.state === PAUSED) && this.interrupt;
    }

    handleUserPromptedCmd(is_self_prompt, is_action) {
        // if a user messages and the bot responds with an action, stop the self-prompt loop
        if (!is_self_prompt && is_action) {
            this.stopLoop();
            // this stops it from responding from the handlemessage loop and the self-prompt loop at the same time
        }
    }
}