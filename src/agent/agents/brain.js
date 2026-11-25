import { Goals, checklistItem } from '../goals/goals.js';
import { toolCallMessage } from '../../models/_tool_request.js';
import { parseObject, functionTool } from './structured.js';

export const brainTools=[
    functionTool('directTask','Assign the Task one concrete objective, briefing and constraints. Do not replace healthy work just to repeat it.',{
        objective:{type:'string'},briefing:{type:'string'},constraints:{type:'string'},tools:{type:'array',items:{type:'string'}},model:{type:'string'},replace:{type:'boolean'},
    },['objective']),
    functionTool('injectNote','Give new context to the running Task without restarting it.',{note:{type:'string'}}),
    functionTool('stopTask','Cancel current work.',{}),
    functionTool('say','Say a useful user-facing message. Completion is reported once.',{message:{type:'string'}}),
    functionTool('wait','No action is needed now.',{}),
    functionTool('addGoal','Record a durable goal. Supply an inventory target when success can be measured.',{
        name:{type:'string'},description:{type:'string'},priority:{type:'number'},item:{type:'string'},count:{type:'integer'},
    },['name']),
    functionTool('completeGoal','Mark a goal complete after verifying evidence; inventory targets are checked in code.',{name:{type:'string'}}),
    functionTool('removeGoal','Remove a goal no longer wanted.',{name:{type:'string'}}),
];

export class BrainAgent {
    constructor(agent,queue) {this.agent=agent;this.messageQueue=queue;this.goals=new Goals();this.message_history=[];this.active_goal=null;}
    async processRequest(source,message) {
        const task=this.agent.agentSystem?.currentDirective;
        this.message_history.push({role:'user',content:`${source}: ${message}\nGoals:\n${this.goals.listFormattedGoals()}\nCurrent task: ${task?.objective||'none'}\nRecent outcome: ${this.lastOutcome||'none'}`});
        if(this.message_history.length>80) {
            const next=this.message_history.findIndex((m,i)=>i>=this.message_history.length-40&&m.role==='user');
            if(next>0) this.message_history=this.message_history.slice(next);
        }
        const [text,calls]=await this.agent.prompter.handleRequest('brain',this.message_history,brainTools);
        this.message_history.push(toolCallMessage(text,calls));
        if(calls.length) return {route:'control',operations:calls,text};
        const parsed=parseObject(text);
        if(parsed&&['task','rp'].includes(parsed.route)) {
            if(parsed.route==='task'&&typeof parsed.task_description!=='string') throw new Error('Brain task decision needs a description');
            return parsed;
        }
        if(text?.trim()) return {route:'rp',reply:text};
        throw new Error('Brain returned neither a decision nor a reply');
    }
    recordToolResult(call,result) {
        this.message_history.push({role:'tool',name:call.name,tool_call_id:call.id,content:String(result)});
        // Trim only at complete exchanges, never orphan a provider tool-result message.
        if(this.message_history.length>40) {
            const next=this.message_history.findIndex((m,i)=>i>10&&m.role==='user');
            if(next>0) this.message_history=this.message_history.slice(next);
        }
    }
    recordTaskOutcome(result) {this.lastOutcome=JSON.stringify(result);}
    applyGoalCall(call) {
        const a=call.arguments||{};
        if(typeof a.name!=='string'||!a.name.trim()) throw new Error(`${call.name} requires a goal name`);
        if(call.name==='addGoal') {
            let target=null;
            if(a.item!==undefined||a.count!==undefined) {
                if(typeof a.item!=='string'||!Number.isSafeInteger(a.count)||a.count<1) throw new Error('Inventory goal requires item and positive integer count');
                target={item:a.item.replace(/^minecraft:/,''),count:a.count};
            }
            this.goals.addGoal(a.name,a.description||'',Number.isFinite(a.priority)?a.priority:1,[],target);
        } else if(call.name==='completeGoal') this.goals.complete(a.name,this.agent.bot);
        else this.goals.removeGoal(a.name);
        return this.goals.listFormattedGoals();
    }
}
