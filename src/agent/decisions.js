import { getKey } from '../utils/keys.js';

const providers={
    typesafe:{url:'https://api.typesafe.ai/v1/systemone',key:'TYPESAFE_API_KEY',model:'jev-latest'},
    openrouter:{url:'https://openrouter.ai/api/alpha/decisions',key:'OPENROUTER_API_KEY',model:'~typesafe/jev-latest'},
    openai:{url:'https://api.openai.com/v1/decisions',key:'OPENAI_API_KEY',model:'gpt-6-luna'},
};
const probability=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;

export function encodeDecision(provider,model,state,questions) {
    if(provider==='openai') return {model,input:typeof state==='string'?state:JSON.stringify(state),questions:Object.entries(questions).map(([name,q])=>({
        name,type:q.type,instructions:q.instructions,
        ...(q.type==='choice'?{choices:Object.entries(q.options).map(([value,description])=>({value,description}))}:{}),
        ...(q.type==='score'?{levels:q.levels.map(label=>({label}))}:{}),
    }))};
    return {model,state,questions:Object.fromEntries(Object.entries(questions).map(([name,q])=>[name,{
        type:q.type==='predicate'?'noul':q.type,instructions:q.instructions,
        ...(q.type==='choice'?{criteria:q.options}:q.type==='score'?{criteria:q.levels}:{}),
    }]))};
}
export function decodeDecision(provider,response,questions) {
    if(typeof response.output==='string'&&!response.answers) response=JSON.parse(response.output);
    const raw=provider==='openai'?Object.fromEntries((response.answers||[]).map(a=>[a.name,a])):response.answers;
    if(!raw||typeof raw!=='object') throw new Error('Decision response has no answers');
    const answers={};
    for(const [name,q] of Object.entries(questions)) {
        const a=raw[name];if(!a||a.type==='refusal') continue;
        if(q.type==='predicate') {const p=provider==='openai'?a.probability:a.noul;if(probability(p)) answers[name]={probability:p};}
        else if(q.type==='choice'&&Object.hasOwn(q.options,a.choice)&&probability(a.confidence)) answers[name]={choice:a.choice,confidence:a.confidence};
        else if(q.type==='score'&&Number.isFinite(a.score)&&a.score>=0&&a.score<=q.levels.length-1&&probability(a.confidence)) answers[name]={score:a.score,confidence:a.confidence};
    }
    return answers;
}
export class DecisionService {
    constructor(agent,config={}, {fetcher=fetch}={}) {
        this.agent=agent;this.config={provider:'openrouter',timeout_ms:4000,min_confidence:0.6,min_probability:0.85,chat_triage:true,task_status:true,goal_check:true,...config};
        this.fetcher=fetcher;this.enabled=Boolean(config.enabled);this.calls=0;this.lastError=null;
        if(!this.enabled) return;
        const c=this.config;
        if(!providers[c.provider]) throw new Error('decisions.provider must be typesafe, openrouter, or openai');
        if(!probability(c.min_confidence)||!probability(c.min_probability)||c.min_probability<=0.5||!Number.isFinite(c.timeout_ms)||c.timeout_ms<=0)
            throw new Error('Invalid decision confidence thresholds or timeout');
    }
    async ask(purpose,state,questions) {
        if(!this.enabled) return null;
        const c=this.config,p=providers[c.provider];
        try {
            this.agent.prompter?.usage?.assertAvailable();
            const key=c.api_key?.startsWith('env:')?getKey(c.api_key.slice(4)):c.api_key||getKey(p.key);
            const url=new URL(c.url||p.url);
            if(!['http:','https:'].includes(url.protocol)) throw new Error('Invalid decision endpoint protocol');
            const started=Date.now();
            const response=await this.fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
                body:JSON.stringify(encodeDecision(c.provider,c.model||p.model,state,questions)),signal:AbortSignal.timeout(c.timeout_ms)});
            if(!response.ok) throw new Error(`Decision endpoint returned HTTP ${response.status}`);
            const data=await response.json();
            const answers=decodeDecision(c.provider,data,questions);
            this.calls++;this.lastError=null;
            this.agent.prompter?.usage?.record(data,'decisions',c.pricing,Date.now()-started);
            this.agent.bot?.emit?.('decision',{purpose,answers,latency_ms:Date.now()-started});
            return answers;
        } catch(error) {
            this.lastError=error.message;
            console.warn(`Decision ${purpose} unavailable; using normal agent behavior: ${error.message}`);
            return null;
        }
    }
    async triage(source,message) {
        if(!this.enabled||!this.config.chat_triage) return null;
        const answers=await this.ask('chat_triage',{bot:this.agent.name,source,message,activity:this.agent.actions?.currentActionLabel}, {
            addressed:{type:'predicate',instructions:'Is the message addressed to the bot, rather than conversation between other players?'},
            intent:{type:'choice',instructions:'What does the player want from the bot?',options:{task:'Do something in the world',question:'Answer a question',stop:'Stop current work',social:'Conversation',noise:'Not meaningful'}},
        });
        if(!answers) return null;
        return {addressed:answers.addressed?.probability,intent:answers.intent?.confidence>=this.config.min_confidence?answers.intent.choice:null};
    }
    async taskStatus(objective,recentResults) {
        if(!this.enabled||!this.config.task_status) return null;
        const inventory=this.agent.bot?.inventory?.items()?.map(i=>({name:i.name,count:i.count}))||[];
        const answers=await this.ask('task_status',{objective,recentResults,inventory},{status:{type:'choice',
            instructions:'Using only observed results and inventory, is the objective fully done, genuinely blocked, or should work continue?',
            options:{done:'Clear evidence every requirement is met',blocked:'Repeated failure with no remaining approach',continue:'More concrete work remains possible'}}});
        const answer=answers?.status;return answer?.confidence>=this.config.min_confidence?answer.choice:null;
    }
    async checkGoals(goals,evidence) {
        if(!this.enabled||!this.config.goal_check||!goals.length) return [];
        const questions=Object.fromEntries(goals.map(g=>[g.id,{type:'predicate',instructions:`Is the entire goal demonstrably achieved from this evidence: ${g.goal_description||g.name}? If evidence is missing answer no.`}]));
        const answers=await this.ask('goal_check',evidence,questions);
        return goals.filter(g=>answers?.[g.id]?.probability>=Math.max(0.95,this.config.min_probability)).map(g=>g.id);
    }
    snapshot() {return {enabled:this.enabled,provider:this.config.provider,calls:this.calls,last_error:this.lastError};}
}
