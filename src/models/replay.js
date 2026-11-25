import { readFileSync } from 'node:fs';

// Local, opt-in deterministic provider for controller/gameplay regressions. Records are
// JSON or JSONL objects {role, text, calls}; no network access or API credentials.
export class Replay {
    static prefix='replay';
    constructor(model_name) {
        this.model_name=model_name||'replay';this.indices=new Map();
        if(!model_name) {this.entries=[];return;}
        const source=readFileSync(model_name,'utf8').trim();
        this.entries=source.startsWith('[')?JSON.parse(source):source.split('\n').filter(Boolean).map(line=>JSON.parse(line));
        if(!Array.isArray(this.entries)) throw new Error('Replay transcript must contain an array or JSONL records');
    }
    next(role) {
        if(role==='conversation'&&!this.entries.some(e=>e.role==='conversation')) role='task';
        const entries=this.entries.filter(e=>(e.role||'task')===role);
        const index=this.indices.get(role)||0;
        if(index>=entries.length) throw new Error(`Replay exhausted for role '${role}'`);
        this.indices.set(role,index+1);return entries[index];
    }
    sendToolRequest(_history,_system,_tools,_format,{role='task',signal}={}) {
        const entry=this.next(role);
        const response=[entry.text||'',entry.calls||[]];
        response.usage={input_tokens:0,output_tokens:0,cost:0};
        const delay=entry.delay_ms||0;
        if(!Number.isFinite(delay)||delay<0) throw new Error('Replay delay_ms must be nonnegative');
        if(!delay) return Promise.resolve(response);
        return new Promise((resolve,reject)=>{
            let timer;
            const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};
            if(signal?.aborted) {abort();return;}
            signal?.addEventListener('abort',abort,{once:true});
            timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve(response);},delay);
        });
    }
    sendRequest() {return Promise.resolve(this.next('summary').text||'');}
    embed() {return Promise.reject(new Error('Replay does not provide embeddings'));}
}
