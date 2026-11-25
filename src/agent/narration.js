import settings from './settings.js';
import { actionMessage, playerNarration, problemMessage } from './user_messages.js';

export function narrationConfig(profile = {}) {
    const read = (key, fallback) => profile[key] ?? settings[key] ?? fallback;
    const mode = read('tool_narration', 'periodic');
    if (!['all','periodic','none'].includes(mode)) throw new Error('tool_narration must be all, periodic, or none');
    const every = read('tool_narration_every', 3);
    const seconds = read('tool_narration_max_silence_seconds', 30);
    if (mode === 'periodic' && (!Number.isSafeInteger(every) || every < 1 || !Number.isFinite(seconds) || seconds <= 0))
        throw new Error('Periodic narration requires a positive integer cadence and positive silence interval');
    return {mode,every,seconds};
}

export function narrationInstructions(profile) {
    const {mode,every} = narrationConfig(profile);
    const voice = 'Player-facing messages must be brief, natural and useful: describe progress toward the player\'s goal. Keep tool names, internal modes, pathfinding details, coordinates, logs and implementation jargon out of routine chat unless the player asks for them. Do not recite health, weather, inventory or other status unless it matters to the request. A block already in place is satisfied, not a reason to retry or change goals. Automatic behaviors assist the player\'s task; they are not a new objective.';
    const policy = mode === 'none' ? 'Execute tools without routine progress chatter. Still answer questions and report completion, blockers, or important failures.'
        : mode === 'all' ? 'Include a brief factual user-facing update with each tool call. Execute the function natively as well; prose alone does not perform an action.'
            : `Give brief factual progress updates about every ${every} tool calls. Execute functions natively. Always report questions, important blockers and completion.`;
    return `${voice} ${policy}`;
}

export class ToolNarrator {
    constructor(agent, source, {now = Date.now, interval = 1000} = {}) {
        this.agent=agent;this.source=source;this.now=now;
        Object.assign(this,narrationConfig(agent.prompter?.profile));
        this.closed=false;this.count=0;this.lastAt=now();this.queue=Promise.resolve();
        this.progress='';this.activeCall=null;this.announced=false;this.pendingText='';this.thinking=false;
        this.failures=new Map();this.reportedProblems=new Map();
        this.onProgress=({user_message})=>{this.progress=playerNarration(user_message);};
        agent.bot?.on?.('action_progress',this.onProgress);
        if(this.mode==='periodic'&&interval>0) this.timer=setInterval(()=>{this.tick().catch(error=>console.warn('Narration:',error.message));},interval);
        this.timer?.unref?.();
    }
    async send(text) {
        if(this.closed||!text?.trim()) return;
        this.lastAt=this.now();this.count=0;
        const pending=this.queue.then(async()=>{if(!this.closed) await this.agent.routeResponse(this.source,text.trim());});
        this.queue=pending.catch(()=>{});
        await pending;
    }
    async assistant(text, {hasCalls=false, question=false} = {}) {
        this.announced=false;
        this.pendingText=hasCalls?playerNarration(text):'';
        if(!hasCalls||question) return await this.send(text);
        if(this.mode==='all'||(this.mode==='periodic'&&this.due())) {
            if(this.pendingText) {await this.send(this.pendingText);this.pendingText='';this.announced=true;}
        }
    }
    due() {return this.count>=this.every||this.now()-this.lastAt>=this.seconds*1000;}
    async beforeTool(call) {
        this.activeCall=call;this.progress='';
        if(this.mode==='all'&&!this.announced) await this.send(actionMessage(call));
        this.announced=false;
    }
    async afterTool(result, call=this.activeCall) {
        this.count++;this.activeCall=null;
        const key=`${call?.name || 'step'}:${call?.arguments?.type || ''}:${result.code || result.status}`;
        if(['failed','blocked'].includes(result.status)) {
            const attempts=(this.failures.get(key)||0)+1;this.failures.set(key,attempts);
            const important=result.status==='blocked'||attempts>=2;
            const last=this.reportedProblems.get(key);
            if((important||(this.mode==='periodic'&&this.due()))&&(last===undefined||this.now()-last>=60000)) {
                await this.send(problemMessage(result,call));this.reportedProblems.set(key,this.now());
            }
            this.pendingText='';
            return;
        }
        if(result.status==='cancelled') return;
        for(const failed of this.failures.keys()) if(failed.startsWith(`${call?.name}:`)) {
            this.failures.delete(failed);this.reportedProblems.delete(failed);
        }
        if(this.mode==='periodic'&&this.due()) {
            await this.send(this.pendingText||actionMessage(call,{complete:true,result}));this.pendingText='';
        }
    }
    startThinking() {this.thinking=true;}
    endThinking() {this.thinking=false;}
    async tick() {
        if(!this.closed&&this.mode==='periodic'&&this.due()) {
            if(this.activeCall) await this.send(this.progress||actionMessage(this.activeCall));
            else if(this.thinking) await this.send("I'm working out the next step.");
        }
    }
    close() {
        this.closed=true;clearInterval(this.timer);
        this.agent.bot?.off?.('action_progress',this.onProgress);
    }
}
