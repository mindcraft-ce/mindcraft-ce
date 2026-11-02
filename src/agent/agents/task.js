import { executeTool, getToolDefinitions, isToolAction } from '../commands/tool_registry.js';
import { toolCallMessage } from '../../models/_tool_request.js';
import settings from '../settings.js';
import { asToolResult, toolResult, toolResultText } from '../tool_result.js';
import { ToolNarrator } from '../narration.js';
import { parseObject, chatText, functionTool, validateArguments } from './structured.js';
import { playerNarration, problemMessage } from '../user_messages.js';

const controls = [
    functionTool('taskDone','Declare the assigned objective complete, with factual evidence.',{summary:{type:'string'}},[]),
    functionTool('taskBlocked','Return control to the Brain with a specific blocker after reasonable recovery attempts.',{reason:{type:'string'}}),
    functionTool('requestTools','Request additional available tools for this directive.',{names:{type:'array',items:{type:'string'}},reason:{type:'string'}},['names']),
];

export class TaskAgent {
    constructor(agent, messageQueue) {
        this.agent=agent;this.messageQueue=messageQueue;this.is_running=false;this.cancelJob=false;
        this.currentTaskDescription=null;this.currentStep=0;this.allowedTools=null;this.lastResults=[];
    }
    async performTask(description, systemPrompt='', directive={}) {
        if(this.is_running) throw new Error('A task is already running');
        this.is_running=true;this.cancelJob=false;this.currentTaskDescription=description;this.currentStep=0;
        this.allowedTools=Array.isArray(directive.tools)?new Set(directive.tools):null;
        this.directive=directive;
        try {
            this.model=this.agent.prompter.selectTaskModel?.(directive.model||this.agent.prompter.model_selection?.default_task_model)
                ||this.agent.prompter.task_model||this.agent.prompter.chat_model;
            const template=this.agent.prompter.profile.task_agent||'';
            const header=template?await this.agent.prompter.replaceStrings(template,[]):'';
            const prompt=`${header}\n${systemPrompt}\nUse native tools. Call taskDone when the assigned objective is verified complete, or taskBlocked with a specific blocker.\nObjective: ${description}`;
            return await this.runLoop([{role:'user',content:description}],prompt,false);
        } finally {
            this.is_running=false;this.currentTaskDescription=null;this.currentStep=0;
        }
    }
    async runLoop(history,prompt=null,conversation=true,shouldInterrupt=()=>false,maxSteps=settings.agent_max_steps??50) {
        if(!Number.isSafeInteger(maxSteps)||maxSteps<1) throw new Error('agent_max_steps must be a positive integer');
        let usedTool=false,noTools=0;
        let executed=0;
        const callLimit=settings.agent_max_tool_calls??80;
        const batchLimit=settings.max_tool_calls_per_response??12;
        if(!Number.isSafeInteger(callLimit)||callLimit<1||!Number.isSafeInteger(batchLimit)||batchLimit<1) throw new Error('Tool call limits must be positive integers');
        const wasRunning=this.is_running;
        this.is_running=true;
        let narrator;
        try {
            narrator=new ToolNarrator(this.agent,this.source);
            this.narrator=narrator;
            this.requestRole=conversation?'conversation':'task';
            for(let step=1;step<=maxSteps;step++) {
                this.currentStep=step;
                for(const item of this.messageQueue?.drain()||[]) {
                    if(item.type==='cancel') this.cancelTask();
                    else history.push({role:'user',content:`[Update from ${item.source}]: ${item.message}`});
                }
                if(this.cancelJob||shouldInterrupt()) break;
                const available=getToolDefinitions(this.agent);
                const definitions=available.filter(t=>!this.allowedTools||this.allowedTools.has(t.function.name)||!isToolAction(this.agent,t.function.name));
                if(!conversation) definitions.push(...controls);
                narrator.startThinking();
                const [text,calls]=conversation
                    ?await this.agent.prompter.promptTools(history,definitions)
                    :await this.agent.prompter.requestTools(history,prompt,definitions,null,this.model||this.agent.prompter.task_model||this.agent.prompter.chat_model);
                narrator.endThinking();
                if(this.cancelJob||shouldInterrupt()) break;
                history.push(toolCallMessage(text,calls));
                const parsed=parseObject(text),visible=chatText(text);
                const recorded=[text,...calls.map(c=>`Tool call ${c.name}: ${JSON.stringify(c.arguments)}`)].filter(Boolean).join('\n');
                if(recorded) await this.agent.history?.add(this.agent.name,recorded);
                if(this.cancelJob||shouldInterrupt()) break;
                await narrator.assistant(visible,{hasCalls:calls.length>0,question:parsed?.input_from_user_needed===true});
                let handoff=null;
                let batchExecuted=0;
                for(const call of calls) {
                    if(this.cancelJob||shouldInterrupt()) break;
                    const control=!conversation&&controls.find(t=>t.function.name===call.name);
                    let result;
                    try {
                        if(executed>=callLimit||batchExecuted>=batchLimit) {
                            result=toolResult('blocked','This call was NOT executed because the tool-call budget was reached.','tool_budget');
                            history.push({role:'tool',name:call.name,tool_call_id:call.id,content:toolResultText(result)});
                            continue;
                        }
                        if(control) validateArguments(control,call.arguments);
                        executed++;batchExecuted++;
                        if(!conversation&&call.name==='taskDone') {
                            handoff={work_done:true,chat_response:call.arguments.summary||visible};
                            result=toolResult('ok','Task completion handed to Brain.');
                        } else if(!conversation&&call.name==='taskBlocked') {
                            if(typeof call.arguments.reason!=='string'||!call.arguments.reason.trim()) throw new Error('taskBlocked requires a reason');
                            handoff={work_done:false,chat_response:playerNarration(call.arguments.reason)||problemMessage(),blocked:true};
                            result=toolResult('blocked',call.arguments.reason);
                        } else if(!conversation&&call.name==='requestTools') {
                            if(!Array.isArray(call.arguments.names)||call.arguments.names.some(n=>typeof n!=='string')) throw new Error('requestTools needs a string array');
                            const allowed=new Set(available.map(t=>t.function.name));
                            const requested=call.arguments.names.filter(n=>allowed.has(n));
                            for(const name of requested) this.allowedTools?.add(name);
                            result=toolResult('ok',`Available: ${requested.join(', ')}. Unavailable: ${call.arguments.names.filter(n=>!allowed.has(n)).join(', ')||'none'}.`);
                        } else {
                            if(!definitions.some(t=>t.function.name===call.name)) throw new Error(`Tool ${call.name} is not granted; use requestTools`);
                            await narrator.beforeTool(call);
                            this.agent.self_prompter?.handleUserPromptedCmd(this.source==='system'||this.source===this.agent.name,isToolAction(this.agent,call.name));
                            console.log(`[TaskAgent] Calling tool ${call.name}`,call.arguments);
                            result=asToolResult(await executeTool(this.agent,call.name,call.arguments));usedTool=true;
                        }
                    } catch(error) {result=toolResult('failed',error.message,error.code||'error');}
                    if(this.cancelJob||shouldInterrupt()) break;
                    const content=toolResultText(result);
                    history.push({role:'tool',name:call.name,tool_call_id:call.id,content});
                    await this.agent.history?.add('system',`${call.name}: ${content}`);
                    this.lastResults.push({name:call.name,...result});this.lastResults=this.lastResults.slice(-8);
                    if(!control) await narrator.afterTool(result,call);
                    if(handoff) break;
                }
                await this.agent.history?.save();
                if(handoff) return {...handoff,steps:step,usedTool};
                if(executed>=callLimit) return {chat_response:"I'm having trouble finishing this. Could you give me a smaller next step?",steps:step,work_done:false,usedTool};
                if(!calls.length) {
                    if(conversation) return {chat_response:visible,steps:step,work_done:true,usedTool};
                    if(parsed?.work_done===true) return {chat_response:visible,steps:step,work_done:true,usedTool};
                    noTools++;
                    if(this.agent.decisions?.enabled) {
                        const status=await this.agent.decisions.taskStatus(this.currentTaskDescription,this.lastResults);
                        if(status==='done') return {chat_response:visible,steps:step,work_done:true,usedTool};
                        if(status==='blocked') return {chat_response:visible||'Task blocked.',steps:step,work_done:false,blocked:true,usedTool};
                    }
                    if(noTools>=3) return {chat_response:"I'm not making progress with this approach. Could you give me a smaller next step?",steps:step,work_done:false,blocked:true,usedTool};
                    history.push({role:'user',content:'Continue the next concrete step with native tools, or call taskDone/taskBlocked with evidence.'});
                } else noTools=0;
            }
            return {chat_response:this.cancelJob||shouldInterrupt()?'':"I'm having trouble finishing this. Could you give me a smaller next step?",steps:this.currentStep,work_done:false,usedTool};
        } catch(error) {
            if(this.cancelJob||shouldInterrupt()) return {chat_response:'',steps:this.currentStep,work_done:false,usedTool};
            throw error;
        } finally {
            narrator?.close();this.narrator=null;this.requestRole=null;
            this.is_running=wasRunning;
        }
    }
    cancelTask() {
        this.cancelJob=true;this.narrator?.close();
        if(this.requestRole) this.agent.prompter?.cancelPending?.(this.requestRole);
    }
    _parseResponse(text) {return parseObject(text);}
}
