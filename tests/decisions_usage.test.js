import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DecisionService,encodeDecision,decodeDecision} from '../src/agent/decisions.js';
import {UsageMeter,normalizeUsage} from '../src/models/usage.js';

const questions={addressed:{type:'predicate',instructions:'Is it for Andy?'},
    intent:{type:'choice',instructions:'Intent?',options:{task:'Work',stop:'Stop'}},
    mood:{type:'score',instructions:'Mood?',levels:['hostile','neutral','friendly']}};
test('decision adapters encode each documented provider contract, without treating chat probabilities as decisions',()=>{
    const openai=encodeDecision('openai','model',{message:'hi'},questions);
    assert.equal(openai.questions[0].type,'predicate');assert.equal(openai.questions[1].choices[1].value,'stop');
    assert.equal(openai.questions[2].levels[2].label,'friendly');
    for(const provider of ['typesafe','openrouter']) {
        const body=encodeDecision(provider,'model',{message:'hi'},questions);
        assert.equal(body.questions.addressed.type,'noul');assert.deepEqual(body.questions.intent.criteria,questions.intent.options);
    }
});
test('decision parsing validates probabilities, score ranges, refusals and allowed choices',()=>{
    assert.deepEqual(decodeDecision('typesafe',{answers:{addressed:{noul:1.5},intent:{choice:'invented',confidence:1},mood:{score:8,confidence:1}}},questions),{});
    const decoded=decodeDecision('openai',{answers:[{name:'addressed',type:'predicate',probability:0.95},{name:'intent',type:'choice',choice:'stop',confidence:0.9},{name:'mood',type:'refusal'}]},questions);
    assert.equal(decoded.intent.choice,'stop');assert.equal(decoded.addressed.probability,0.95);assert.equal(decoded.mood,undefined);
});
test('disabled decisions make zero requests and confidence thresholds fall back instead of guessing',async()=>{
    let calls=0;
    const fetcher=()=>{calls++;throw new Error('must not run');};
    const disabled=new DecisionService({}, {},{fetcher});assert.equal(await disabled.triage('Player','hi'),null);assert.equal(calls,0);
    const service=new DecisionService({}, {enabled:true,provider:'typesafe',api_key:'fixture'}, {fetcher:()=>Promise.resolve({ok:true,json:()=>Promise.resolve({answers:{status:{choice:'done',confidence:0.2}}})})});
    assert.equal(await service.taskStatus('get logs',[]),null);
});
test('HTTP failures and request timeouts fall back to normal behavior',async()=>{
    const config={enabled:true,provider:'openai',api_key:'fixture',timeout_ms:10};
    const failed=new DecisionService({},config,{fetcher:()=>Promise.resolve({ok:false,status:429})});
    assert.equal(await failed.ask('test',{},questions),null);assert.match(failed.lastError,/429/);
    const timeout=new DecisionService({},config,{fetcher:(_url,{signal})=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>resolve({ok:false,status:500}),1000);
        signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
    })});
    assert.equal(await timeout.ask('test',{},questions),null);assert.match(timeout.lastError,/timeout/i);
});
test('decision transport sends the configured endpoint, authorization and typed payload and records usage',async()=>{
    const meter=new UsageMeter();let request;
    const service=new DecisionService({prompter:{usage:meter}}, {enabled:true,provider:'openai',api_key:'fixture',url:'http://127.0.0.1/decisions'}, {
        fetcher:(url,options)=>{request={url,options};return Promise.resolve({ok:true,json:()=>Promise.resolve({answers:[{name:'addressed',type:'predicate',probability:0.99}],usage:{input_tokens:10,output_tokens:0}})});},
    });
    const answers=await service.ask('test',{message:'Andy'},questions);
    assert.equal(answers.addressed.probability,0.99);assert.equal(request.options.headers.Authorization,'Bearer fixture');
    assert.ok(request.options.signal instanceof AbortSignal);assert.equal(JSON.parse(request.options.body).questions[0].name,'addressed');
    assert.equal(meter.snapshot().roles.decisions.input,10);
});
test('usage normalizes Ollama, Anthropic and Gemini counts and preserves unknown prices',()=>{
    assert.deepEqual(normalizeUsage({prompt_eval_count:12,eval_count:5}),{input:12,output:5,cached:0,cost:null});
    assert.equal(normalizeUsage({usage:{input_tokens:5,cache_read_input_tokens:20,cache_creation_input_tokens:10}}).input,35);
    assert.equal(normalizeUsage({usageMetadata:{promptTokenCount:10,candidatesTokenCount:3,cachedContentTokenCount:7}}).cached,7);
});
test('one meter accounts across roles, enforces budgets and expires token windows',async()=>{
    let now=10000000,calls=0;const meter=new UsageMeter({tokens_per_hour:10},{now:()=>now});
    const provider={send:()=>{calls++;return Promise.resolve({prompt_eval_count:8,eval_count:2});}};
    meter.instrument(provider);
    await meter.run('brain',()=>provider.send());await assert.rejects(provider.send(),/budget reached/);assert.equal(calls,1);
    now+=3600001;await meter.run('task',()=>provider.send());assert.equal(meter.snapshot().roles.task.calls,1);
});
test('daily spend persists atomically, session spend resets, and unpriced USD limits cannot silently fail',()=>{
    const dir=mkdtempSync(path.join(tmpdir(),'ce-usage-'));const file=path.join(dir,'usage.json');
    try {
        const meter=new UsageMeter({usd_per_day:1},{file});meter.record({usage:{cost:1}},'brain');
        const restored=new UsageMeter({usd_per_day:1},{file});assert.equal(restored.sessionCost,0);assert.throws(()=>restored.assertAvailable(),/budget reached/);
        const unknown=new UsageMeter({usd_per_session:1});unknown.record({usage:{input_tokens:1}});assert.throws(()=>unknown.assertAvailable(),/pricing/);
        const priced=new UsageMeter();priced.record({usage:{prompt_tokens:1000000,completion_tokens:500000}},'task',{input_per_million:1,output_per_million:2});
        assert.equal(priced.sessionCost,2);
        const unreported=new UsageMeter({usd_per_session:1});unreported.record({},'task',{input_per_million:1,output_per_million:2});
        assert.throws(()=>unreported.assertAvailable(),/pricing/);
    } finally {rmSync(dir,{recursive:true,force:true});}
});
test('legacy provider calls without exposed metadata remain counted and nested SDK calls count once',async()=>{
    const meter=new UsageMeter();
    const legacy={sendRequest:()=>Promise.resolve('legacy text')};meter.instrument(legacy);
    await legacy.sendRequest();assert.equal(meter.calls,1);assert.equal(meter.unpricedCalls,1);
    const nested={send:()=>Promise.resolve({usage:{input_tokens:7,output_tokens:3}}),async sendRequest(){await this.send();return 'reply';}};
    meter.instrument(nested);await meter.run('summary',()=>nested.sendRequest());
    assert.equal(meter.calls,2);assert.equal(meter.snapshot().roles.summary.input,7);
});
test('missing token counts and unpriced daily usage cannot bypass caps across restart',()=>{
    let now=10000000;const tokens=new UsageMeter({tokens_per_hour:100},{now:()=>now});
    tokens.record({usage:{cost:0}});assert.throws(()=>tokens.assertAvailable(),/did not report token counts/);
    now+=3600001;assert.doesNotThrow(()=>tokens.assertAvailable());
    const dir=mkdtempSync(path.join(tmpdir(),'ce-unknown-price-'));const file=path.join(dir,'usage.json');
    try {
        const first=new UsageMeter({usd_per_day:1},{file});first.record({usage:{input_tokens:2}});
        const restored=new UsageMeter({usd_per_day:1},{file});assert.throws(()=>restored.assertAvailable(),/pricing/);
    } finally {rmSync(dir,{recursive:true,force:true});}
});
