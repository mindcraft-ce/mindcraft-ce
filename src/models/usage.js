import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

const roles=new AsyncLocalStorage();
const requests=new AsyncLocalStorage();
export function normalizeUsage(response={}) {
    const u=response.usage||response.usageMetadata||{};
    const cached=u.prompt_tokens_details?.cached_tokens??u.input_tokens_details?.cached_tokens??u.cache_read_input_tokens??u.cachedContentTokenCount??0;
    const write=u.cache_creation_input_tokens??u.input_tokens_details?.cache_write_tokens??0;
    const input=(u.prompt_tokens??u.input_tokens??u.promptTokenCount??response.prompt_eval_count??0)+
        (u.cache_read_input_tokens!==undefined||u.cache_creation_input_tokens!==undefined?cached+write:0);
    const output=u.completion_tokens??u.output_tokens??u.candidatesTokenCount??response.eval_count??0;
    const valid=n=>Number.isFinite(n)&&n>=0?n:0;
    return {input:valid(input),output:valid(output),cached:Math.min(valid(input),valid(cached)),cost:Number.isFinite(u.cost)&&u.cost>=0?u.cost:null};
}
export class UsageMeter {
    constructor(config={}, {now=Date.now,file=null}={}) {
        this.config=config||{};this.now=now;this.file=file;this.sessionCost=0;this.calls=0;this.events=[];this.byRole={};this.instrumented=new WeakSet();
        this.day=this.dayKey();this.dayCost=0;this.dayUnpriced=0;this.unpricedCalls=0;
        for(const key of ['usd_per_session','usd_per_day','tokens_per_hour'])
            if(this.config[key]!=null&&(!Number.isFinite(this.config[key])||this.config[key]<0)) throw new Error(`Invalid usage_budget.${key}`);
        if(file&&existsSync(file)) {
            try {const saved=JSON.parse(readFileSync(file,'utf8'));if(saved.day===this.day) {this.dayCost=saved.dayCost||0;this.dayUnpriced=saved.dayUnpriced||0;}this.events=(saved.events||[]).filter(e=>now()-e.at<3600000);}
            catch(error) {console.warn('Usage state could not be restored:',error.message);}
        }
    }
    dayKey() {return new Date(this.now()).toLocaleDateString('en-CA');}
    refresh() {
        if(this.day!==this.dayKey()) {this.day=this.dayKey();this.dayCost=0;this.dayUnpriced=0;}
        this.events=this.events.filter(e=>this.now()-e.at<3600000);
    }
    assertAvailable() {
        this.refresh();
        const c=this.config;
        if((this.unpricedCalls&&c.usd_per_session!=null)||(this.dayUnpriced&&c.usd_per_day!=null))
            throw Object.assign(new Error('USD budget cannot be enforced: configure model pricing or use a token budget.'),{code:'budget_unpriced'});
        if(c.tokens_per_hour!=null&&this.events.some(e=>e.unknownTokens))
            throw Object.assign(new Error('Token budget cannot be enforced because a provider did not report token counts.'),{code:'budget_unmetered'});
        const exceeded=(c.usd_per_session!=null&&this.sessionCost>=c.usd_per_session)||
            (c.usd_per_day!=null&&this.dayCost>=c.usd_per_day)||
            (c.tokens_per_hour!=null&&this.events.reduce((n,e)=>n+e.tokens,0)>=c.tokens_per_hour);
        if(exceeded) throw Object.assign(new Error('Model usage budget reached; raise the configured limit or wait for its window to reset.'),{code:'budget_exhausted'});
    }
    record(response,role='text',pricing=null,latencyMs=0) {
        const request=requests.getStore();if(request) request.recorded=true;
        this.refresh();
        const usage=normalizeUsage(response);
        const reported=Boolean(response.usage||response.usageMetadata||response.prompt_eval_count!==undefined||response.eval_count!==undefined);
        if(usage.cost==null&&pricing&&reported) {
            const input=pricing.input_per_million,output=pricing.output_per_million,cached=pricing.cached_input_per_million??input;
            if([input,output,cached].every(n=>Number.isFinite(n)&&n>=0))
                usage.cost=((usage.input-usage.cached)*input+usage.cached*cached+usage.output*output)/1000000;
        }
        if(usage.cost==null) {this.unpricedCalls++;this.dayUnpriced++;}
        this.calls++;this.sessionCost+=usage.cost||0;this.dayCost+=usage.cost||0;
        const u=response.usage||response.usageMetadata||{};
        const unknownTokens=![u.input_tokens,u.prompt_tokens,u.promptTokenCount,response.prompt_eval_count,u.output_tokens,u.completion_tokens,u.candidatesTokenCount,response.eval_count].some(Number.isFinite);
        this.events.push({at:this.now(),tokens:usage.input+usage.output,unknownTokens});
        const totals=this.byRole[role]||={calls:0,input:0,output:0,cached:0,cost:0,latencyMs:0,pricedCalls:0};
        totals.calls++;for(const key of ['input','output','cached']) totals[key]+=usage[key];
        totals.cost+=usage.cost||0;totals.pricedCalls+=Number(usage.cost!=null);totals.latencyMs+=latencyMs;
        if(this.file) {
            mkdirSync(path.dirname(this.file),{recursive:true});
            const tmp=`${this.file}.${process.pid}.tmp`;
            writeFileSync(tmp,JSON.stringify({day:this.day,dayCost:this.dayCost,dayUnpriced:this.dayUnpriced,events:this.events}));renameSync(tmp,this.file);
        }
        return usage;
    }
    run(role,fn) {return roles.run(role,fn);}
    snapshot() {this.refresh();return {calls:this.calls,session_cost_usd:this.sessionCost,day_cost_usd:this.dayCost,
        tokens_last_hour:this.events.reduce((n,e)=>n+e.tokens,0),unmetered_calls:this.events.filter(e=>e.unknownTokens).length,
        unpriced_calls:this.unpricedCalls,roles:structuredClone(this.byRole)};}
    instrument(model,pricing=null) {
        if(!model||this.instrumented.has(model)) return model;
        this.instrumented.add(model);
        for(const key of ['sendRequest','sendVisionRequest','embed','embedMany']) {
            const original=model[key];if(typeof original!=='function') continue;
            const meter=this;
            model[key]=async function(...args) {
                meter.assertAvailable();
                const request={recorded:false};
                return await requests.run(request,async()=>{
                    const start=meter.now();
                    try {
                        const result=await original.apply(this,args);
                        if(!request.recorded) meter.record(result&&typeof result==='object'?result:{},roles.getStore()||'text',pricing,meter.now()-start);
                        return result;
                    } catch(error) {
                        if(!request.recorded&&!String(error?.code||'').startsWith('budget_')) meter.record({},roles.getStore()||'text',pricing,meter.now()-start);
                        throw error;
                    }
                });
            };
        }
        const targets=[[model,'send'],[model,'sendToolRequest'],[model.openai?.chat?.completions,'create'],[model.groq?.chat?.completions,'create'],
            [model.client?.chat?.completions,'create'],[model.vllm?.chat?.completions,'create'],
            [model.anthropic?.messages,'create'],[model.genAI?.models,'generateContent'],[model.huggingface,'chatCompletion']];
        for(const [target,key] of targets) {
            const original=target?.[key];if(typeof original!=='function') continue;
            const meter=this;
            target[key]=async function(...args) {
                meter.assertAvailable();const start=meter.now();
                let response;
                try {
                    response=await original.apply(this,args);
                } catch(error) {
                    if(!String(error?.code||'').startsWith('budget_'))
                        meter.record({},roles.getStore()||'text',pricing,meter.now()-start);
                    throw error;
                }
                meter.record(response,roles.getStore()||'text',pricing,meter.now()-start);return response;
            };
        }
        return model;
    }
}
