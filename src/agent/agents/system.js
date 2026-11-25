import { randomUUID } from 'node:crypto';
import { BrainAgent, brainTools } from './brain.js';
import { validateArguments } from './structured.js';
import { RPAgent } from './rp.js';
import { TaskAgent } from './task.js';
import { MessageQueue } from '../message_queue.js';
import settings from '../settings.js';
import { getToolDefinitions } from '../commands/tool_registry.js';
import { responseProblem } from '../user_messages.js';

const near = (a,b) => {
    const tokens=s=>new Set(String(s).toLowerCase().split(/\W+/).filter(w=>w.length>2));
    const x=tokens(a),y=tokens(b);
    return x.size&&y.size?[...x].filter(w=>y.has(w)).length/Math.max(x.size,y.size)>=0.8:a===b;
};
export class AgentSystem {
    constructor(agent,{now=Date.now}={}) {
        this.agent=agent;this.now=now;this.queue=new MessageQueue();this.brain=new BrainAgent(agent,this.queue);
        this.rp=new RPAgent(agent);this.task=new TaskAgent(agent,this.queue);agent.taskAgent=this.task;
        this.pending=Promise.resolve();this.activeTask=null;this.generation=0;this.currentDirective=null;this.lastDirective=null;
        this.ready=false;this.lastCheck=now();this.retasks=0;this.lastFingerprint='';this.lastSaid=null;
    }
    cancelTask() {
        this.generation++;this.task.cancelTask();this.queue.clear();clearTimeout(this.wakeTimer);this.wakeTimer=null;
        this.agent.prompter?.cancelPending?.();this.pendingWake=null;
        if(this.currentDirective) this.lastDirective={...this.currentDirective,outcome:'stopped'};
        this.currentDirective=null;
    }
    handleMessage(source,message,shouldInterrupt=()=>false,maxResponses=settings.agent_max_steps??50) {
        if(maxResponses<=0) return Promise.resolve(false);
        const addressed=message.trim().replace(new RegExp(`^${String(this.agent.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[, ]+`,'i'),'');
        if(/^(?:stop|cancel|stop it|cancel that|stop now)[.!\s]*$/i.test(addressed)) {
            this.cancelTask();
            return Promise.resolve(this.agent.actions?.stop()).then(async()=>{await this.say(source,'Stopped.');return true;});
        }
        const generation=this.generation;
        const interrupted=()=>generation!==this.generation||shouldInterrupt();
        const operation=this.pending.then(async()=>{
            if(interrupted()) return false;
            if(!message.startsWith('[Supervision event]')) this.retasks=0;
            if(this.agent.decisions?.enabled && !['system',this.agent.name,'ADMIN'].includes(source) && !message.startsWith('[Supervision event]')) {
                const triage=await this.agent.decisions.triage(source,message);
                if(interrupted()) return false;
                const named=message.toLowerCase().includes(String(this.agent.name).toLowerCase());
                if(!named&&triage?.addressed<=1-this.agent.decisions.config.min_probability) return false;
                if(triage?.intent==='stop'&&triage.addressed>=this.agent.decisions.config.min_probability) {
                    this.cancelTask();await this.agent.actions.stop();await this.say(source,'Stopped.');return true;
                }
            }
            if(!this.agent.prompter.use_brain) {
                const runner=new TaskAgent(this.agent);
                this.task=runner;this.agent.taskAgent=runner;runner.source=source;
                let result;
                try {
                    result=await runner.runLoop(this.agent.history.getHistory(),null,true,interrupted,
                        Math.min(maxResponses,settings.agent_max_steps??50));
                } catch(error) {
                    if(!interrupted()) {
                        console.warn('Native conversation failed:',error.stack||error);
                        await this.say(source,responseProblem(error));
                    }
                    return false;
                }
                if(!result.work_done&&result.chat_response&&!interrupted()) await this.say(source,result.chat_response);
                await this.agent.history.save();return result.usedTool;
            }
            try { return await this.assess(source,message,interrupted); }
            catch(error) {
                if(!interrupted()) {
                    console.warn('Brain request failed:',error.stack||error);
                    await this.say(source,responseProblem(error));
                }
                return false;
            }
        });
        this.pending=operation.catch(()=>{});
        return operation;
    }
    async assess(source,message,interrupted=()=>false,attempt=0,steps=0) {
        const decision=await this.brain.processRequest(source,message);
        if(interrupted()||!decision) return false;
        if(decision.operations) {
            let errorText='',terminal=false;
            for(const call of decision.operations) {
                if(interrupted()) {this.brain.recordToolResult(call,'Cancelled before execution.');continue;}
                if(errorText) {this.brain.recordToolResult(call,'NOT executed: an earlier supervision tool failed. Reassess its error first.');continue;}
                let result;
                try {
                    result=await this.apply(call,source,interrupted);
                    if(['directTask','injectNote','stopTask','say','wait'].includes(call.name)) terminal=true;
                } catch(error) {result=`Error: ${error.message}`;errorText=result;}
                this.brain.recordToolResult(call,result);
            }
            await this.agent.history?.save();
            if(errorText&&!this.currentDirective&&!interrupted()) {
                if(attempt<2) return await this.assess(source,`Correct the reported supervision-tool errors or explain the blocker: ${errorText}`,interrupted,attempt+1,steps+1);
                console.warn('Brain could not proceed:',errorText);
                await this.say(source,"I couldn't work out how to do that. Could you give me a smaller next step?");
            }
            if(!errorText&&!terminal&&!interrupted()) {
                if(steps+1<(settings.agent_max_steps??50))
                    return await this.assess(source,'Continue from these supervision-tool results. Assign concrete work, answer the player, or wait if no work remains.',interrupted,attempt,steps+1);
                await this.say(source,"I'm having trouble finishing this. Could you give me a smaller next step?");
            }
            return Boolean(this.currentDirective);
        }
        if(decision.route==='rp') {await this.reply(source,message,decision,interrupted);return false;}
        if(decision.route==='task') {
            await this.reply(source,message,decision,interrupted);
            return await this.startDirective({objective:decision.task_description,briefing:decision.task_system_prompt,
                replace:decision.task_action==='cancel_and_start'},source,interrupted);
        }
        throw new Error(`Unknown Brain route: ${decision.route}`);
    }
    async apply(call,source,interrupted=()=>false) {
        const a=call.arguments||{};
        const definition=brainTools.find(t=>t.function.name===call.name);
        if(!definition) throw new Error(`Unknown Brain tool '${call.name}'`);
        validateArguments(definition,a);
        if(['addGoal','completeGoal','removeGoal'].includes(call.name)) return this.brain.applyGoalCall(call);
        if(call.name==='say') {
            if(typeof a.message!=='string') throw new Error('say requires message');
            await this.say(source,a.message,true);return 'Message delivered.';
        }
        if(call.name==='wait') return 'Waiting for relevant events.';
        if(call.name==='stopTask') {this.task.cancelTask();await this.agent.actions.stop();this.currentDirective=null;return 'Task stopped.';}
        if(call.name==='injectNote') {
            if(typeof a.note!=='string') throw new Error('injectNote requires a note');
            if(!this.activeTask&&this.lastDirective?.outcome!=='stopped'&&this.lastDirective)
                return await this.startDirective({...this.lastDirective,objective:this.lastDirective.objective,briefing:a.note},source,interrupted);
            this.queue.enqueue({source,message:a.note,type:'context'});return 'Context queued without replacing work.';
        }
        if(call.name==='directTask') return await this.startDirective(a,source,interrupted);
        throw new Error(`Unknown Brain tool '${call.name}'`);
    }
    async startDirective(args,source,interrupted=()=>false) {
        if(typeof args.objective!=='string'||!args.objective.trim()) throw new Error('directTask requires an objective');
        if(args.tools!==undefined) {
            const available=new Set(getToolDefinitions(this.agent).map(t=>t.function.name));
            if(!Array.isArray(args.tools)||args.tools.some(name=>typeof name!=='string'||!available.has(name)))
                throw new Error(`Tool grants require exact available names. Available: ${[...available].join(', ')}`);
        }
        // A correction while the same action runs is context, not a fresh task.
        if(this.activeTask&&!this.task.cancelJob&&!args.replace&&this.currentDirective&&near(this.currentDirective.objective,args.objective)) {
            this.queue.enqueue({source,message:[args.objective,args.briefing,args.constraints].filter(Boolean).join('\n'),type:'context'});
            return 'Updated the active task without restarting it.';
        }
        if(this.activeTask&&!this.currentDirective) await this.activeTask;
        if(this.activeTask) {
            if(!args.replace&&!this.task.cancelJob) {
                this.queue.enqueue({source,message:args.briefing||args.objective,type:'context'});
                return 'Task is running; context queued. Set replace=true to change objectives.';
            }
            this.task.cancelTask();await this.agent.actions.stop();await this.activeTask;this.queue.clear();
        }
        if(interrupted()) return false;
        const fingerprint=this.fingerprint();
        if(this.lastDirective&&near(this.lastDirective.objective,args.objective)&&fingerprint===this.lastFingerprint) this.retasks++;
        else this.retasks=0;
        this.lastFingerprint=fingerprint;
        if(this.retasks>=3) {
            await this.say(source,'I have paused repeated attempts without progress. I need a different approach.');
            return 'Repeated unchanged task refused. Change approach or ask the player.';
        }
        // Validate selected endpoints before handing the task off.
        this.agent.prompter.selectTaskModel?.(args.model||this.agent.prompter.model_selection?.default_task_model);
        const directive={id:randomUUID(),objective:args.objective,briefing:args.briefing||'',constraints:args.constraints||'',
            tools:args.tools,model:args.model||(this.agent.prompter.model_selection?.enabled?this.agent.prompter.model_selection.default_task_model:undefined),source,startedAt:this.now()};
        this.currentDirective=directive;this.lastCheck=this.now();
        const generation=this.generation;
        this.task.source=source;
        const active=this.task.performTask(directive.objective,[directive.briefing,directive.constraints].filter(Boolean).join('\n'),directive)
            .then(async result=>{
                if(generation!==this.generation||this.task.cancelJob||this.currentDirective?.id!==directive.id) return;
                this.lastDirective={...directive,outcome:result.work_done?'done':result.blocked?'blocked':'paused',result};
                this.currentDirective=null;this.brain.recordTaskOutcome(result);
                if(this.agent.decisions?.enabled&&result.work_done) {
                    const goals=this.brain.goals.active().filter(g=>!g.target);
                    const completed=await this.agent.decisions.checkGoals(goals,{results:this.task.lastResults,inventory:this.fingerprint()});
                    if(generation===this.generation) for(const id of completed) this.brain.goals.complete(id,this.agent.bot);
                }
                if(generation!==this.generation||this.task.cancelJob) return;
                if(!result.work_done&&result.chat_response) await this.say(source,result.chat_response);
                if(this.ready) this.wake(source,`Task ${this.lastDirective.outcome}: ${JSON.stringify(result)}\nRecent tools: ${JSON.stringify(this.task.lastResults)}`);
            }).catch(async error=>{
                if(generation!==this.generation||this.task.cancelJob) return;
                this.lastDirective={...directive,outcome:'blocked',error:error.message};this.currentDirective=null;
                console.warn('Task failed:',error.stack||error);
                await this.say(source,responseProblem(error));
                if(this.ready) this.wake(source,`Task error: ${error.message}`);
            }).finally(async()=>{
                if(this.activeTask===active) this.activeTask=null;
                await this.agent.history?.save();
            });
        this.activeTask=active;
        return 'Task assigned.';
    }
    wake(source,message) {
        if(!this.ready||!this.agent.prompter.use_brain) return;
        // Coalesce event bursts; the latest status is read when the wake actually runs.
        this.pendingWake={source,message};
        if(this.wakeTimer) return;
        this.wakeTimer=setTimeout(()=>{this.wakeTimer=null;this.flushWake().catch(error=>console.warn('Brain wake:',error.message));},250);
        this.wakeTimer.unref?.();
    }
    async flushWake() {
        const event=this.pendingWake;this.pendingWake=null;
        if(!event||!this.ready) return;
        const generation=this.generation;
        if(event.message.startsWith('Periodic status:')&&this.agent.decisions?.enabled&&this.currentDirective) {
            const status=await this.agent.decisions.taskStatus(this.currentDirective.objective,this.task.lastResults);
            if(generation!==this.generation) return;
            if(status==='continue'&&(this.gatedChecks||0)<3) {this.gatedChecks=(this.gatedChecks||0)+1;return;}
            this.gatedChecks=0;
        }
        await this.handleMessage(event.source,`[Supervision event] ${event.message}`,()=>false,1);
    }
    tick() {
        if(!this.ready||!this.agent.prompter.use_brain||!this.currentDirective) return;
        const seconds=this.agent.prompter.profile?.brain_check_in_seconds??settings.brain_check_in_seconds??60;
        if(seconds<=0||this.now()-this.lastCheck<seconds*1000) return;
        this.lastCheck=this.now();
        this.wake(this.currentDirective.source,`Periodic status: ${this.agent.actions.currentActionLabel||'awaiting Task response'}. ${this.agent.actions.progress?.message||''}`);
    }
    async reply(source,message,decision,interrupted) {
        const reply=decision.reply||await this.rp.respond(source,message,decision);
        if(reply&&!interrupted()) {await this.say(source,reply);await this.agent.history.save();}
    }
    async say(source,text,transform=false) {
        if(!text?.trim()) return;
        const generation=this.generation;
        if(this.lastSaid?.source===source&&this.lastSaid.text===text&&this.now()-this.lastSaid.at<10000) return;
        if(transform&&this.agent.prompter.profile?.use_rp_agent!==false) text=await this.rp.transform(text,source);
        if(generation!==this.generation) return;
        this.lastSaid={source,text,at:this.now()};
        try {await this.agent.history?.add(this.agent.name,text);} catch(error) {console.warn('Reply history:',error.message);}
        await this.agent.routeResponse(source,text);
    }
    fingerprint() {return JSON.stringify(this.agent.bot?.inventory?.items()?.map(i=>[i.name,i.count])||[]);}
    snapshot() {return {version:1,goals:this.brain.goals.toJSON(),notes:this.rp.playerNotes,locations:this.agent.memory_bank?.getJson?.(),
        directive:this.currentDirective,lastDirective:this.lastDirective,scope:this.scope()};}
    scope() {return `${settings.host}:${settings.port}/${settings.world_id||this.agent.bot?.worldIdentity||'unknown'}/${this.agent.bot?.game?.dimension||'unknown'}`;}
    restore(state) {if(state?.version===1) this.saved=state;}
    onSpawn() {
        this.ready=true;
        if(this.saved) {
            this.brain.goals.restore(this.saved.goals);
            this.rp.playerNotes=Object.assign(Object.create(null),this.saved.notes||{});
            if(this.saved.scope===this.scope()&&this.saved.locations) this.agent.memory_bank?.loadJson?.(this.saved.locations);
            if(this.saved.scope===this.scope()&&this.saved.directive) {
                this.lastDirective={...this.saved.directive,outcome:'paused'};
                this.wake(this.saved.directive.source,`Restarted. Reassess this saved objective against fresh world state before resuming: ${this.saved.directive.objective}`);
            }
            this.saved=null;
        }
    }
}
