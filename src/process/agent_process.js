import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { logoutAgent } from '../mindcraft/mindserver.js';

const init_agent_path = fileURLToPath(new URL('./init_agent.js', import.meta.url));

const DEFAULT_RESTART_WINDOW_MS = 60_000;
const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_RESTART_DELAY_MS = 500;
const DEFAULT_STOP_ESCALATION_MS = 10_000;

export function nextRestartPlan(restartTimes, now, {
    windowMs = DEFAULT_RESTART_WINDOW_MS,
    maxRestarts = DEFAULT_MAX_RESTARTS,
    baseDelayMs = DEFAULT_RESTART_DELAY_MS,
} = {}) {
    const recent = restartTimes.filter(timestamp => now - timestamp < windowMs);
    if (recent.length >= maxRestarts) {
        return { allowed: false, delayMs: null, restartTimes: recent };
    }
    const delayMs = baseDelayMs * (2 ** recent.length);
    return {
        allowed: true,
        delayMs,
        restartTimes: [...recent, now],
    };
}

export class AgentProcess {
    constructor(name, port, {
        exitParentOnTerminalCode = false,
        spawnFn = spawn,
        exitFn = code => process.exit(code),
        now = () => Date.now(),
        setTimer = setTimeout,
        clearTimer = clearTimeout,
        stopEscalationMs = DEFAULT_STOP_ESCALATION_MS,
    } = {}) {
        this.name = name;
        this.port = port;
        this.exitParentOnTerminalCode = exitParentOnTerminalCode;
        this.spawnFn = spawnFn;
        this.exitFn = exitFn;
        this.now = now;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.stopEscalationMs = stopEscalationMs;

        this.process = null;
        this.running = false;
        this.state = 'stopped';
        this.restartTimes = [];
        this.restartTimer = null;
        this.stopEscalationTimer = null;
        this.intentionalStop = false;
        this.restartRequested = false;
    }

    start(load_memory=false, init_message=null, count_id=0) {
        if (this.running) return;

        if (this.restartTimer) {
            this.clearTimer(this.restartTimer);
            this.restartTimer = null;
        }

        this.count_id = count_id;
        this.intentionalStop = false;
        this.state = 'starting';
        const startedAt = this.now();

        const args = [init_agent_path, this.name, '-n', this.name, '-c', count_id];
        if (load_memory)
            args.push('-l', load_memory);
        if (init_message)
            args.push('-m', init_message);
        args.push('-p', this.port);

        const agentProcess = this.spawnFn(process.execPath, args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });

        this.process = agentProcess;
        this.running = true;
        this.state = 'running';

        agentProcess.on('exit', (code, signal) => {
            if (this.process !== agentProcess) return;

            if (this.stopEscalationTimer) {
                this.clearTimer(this.stopEscalationTimer);
                this.stopEscalationTimer = null;
            }

            this.process = null;
            this.running = false;
            logoutAgent(this.name);
            console.log(`Agent process ${this.name} exited with code ${code} and signal ${signal}`);

            if (this.restartRequested) {
                this.restartRequested = false;
                this.intentionalStop = false;
                this.state = 'restarting';
                this.start(true, 'Agent process restarted.', this.count_id);
                return;
            }

            if (this.intentionalStop || signal === 'SIGINT' || signal === 'SIGTERM' || code === 0) {
                this.intentionalStop = false;
                this.state = 'stopped';
                return;
            }

            if (code != null && code > 1 && this.exitParentOnTerminalCode) {
                this.state = 'stopped';
                console.log(`Agent ${this.name} finished task with terminal code ${code}.`);
                this.exitFn(code);
                return;
            }

            if (this.now() - startedAt >= DEFAULT_RESTART_WINDOW_MS) {
                this.restartTimes = [];
            }
            this._scheduleRestart();
        });

        agentProcess.on('error', (err) => {
            console.error(`Agent process ${this.name} error:`, err);
        });
    }

    _scheduleRestart() {
        const plan = nextRestartPlan(this.restartTimes, this.now());
        this.restartTimes = plan.restartTimes;
        if (!plan.allowed) {
            this.state = 'failed';
            console.error(`Agent ${this.name} exceeded its restart budget and will remain stopped.`);
            return;
        }

        this.state = 'restarting';
        console.log(`Restarting agent ${this.name} in ${plan.delayMs} ms...`);
        this.restartTimer = this.setTimer(() => {
            this.restartTimer = null;
            this.start(true, 'Agent process restarted.', this.count_id);
        }, plan.delayMs);
    }

    _armStopEscalation(agentProcess) {
        if (this.stopEscalationTimer) this.clearTimer(this.stopEscalationTimer);
        this.stopEscalationTimer = this.setTimer(() => {
            this.stopEscalationTimer = null;
            if (this.process === agentProcess && this.running) {
                console.warn(`Agent ${this.name} did not stop cleanly; sending SIGKILL.`);
                agentProcess.kill('SIGKILL');
            }
        }, this.stopEscalationMs);
    }

    stop() {
        if (this.restartTimer) {
            this.clearTimer(this.restartTimer);
            this.restartTimer = null;
        }
        if (!this.running || !this.process) {
            this.state = 'stopped';
            return;
        }

        this.intentionalStop = true;
        this.state = 'stopping';
        const agentProcess = this.process;
        agentProcess.kill('SIGINT');
        this._armStopEscalation(agentProcess);
    }

    forceRestart() {
        if (this.restartTimer) {
            this.clearTimer(this.restartTimer);
            this.restartTimer = null;
        }

        if (this.running && this.process) {
            console.log(`Restart requested for agent ${this.name}.`);
            this.restartRequested = true;
            this.intentionalStop = true;
            this.state = 'stopping';
            const agentProcess = this.process;
            agentProcess.kill('SIGINT');
            this._armStopEscalation(agentProcess);
            return;
        }

        this.restartRequested = false;
        this.intentionalStop = false;
        this.start(true, 'Agent process restarted.', this.count_id);
    }
}
