import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { ROOT } from '../src/runtime.mjs';
const url='http://127.0.0.1:18890';
let ready=false;
for(let i=0;i<50;i++){try{if((await fetch(url+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
assert(ready,'原型服务未启动');
const data=JSON.parse(await readFile(join(ROOT,'examples/cases.json'),'utf8')).find(c=>c.id==='newcomer');
const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const response=await post('/api/runs',{...data,synthetic:true,acceptCost:true});assert.equal(response.status,202);
const {id}=await response.json();
const duplicate=await post('/api/runs',{...data,synthetic:true,acceptCost:true});assert.equal(duplicate.status,409);
const early=await post(`/api/runs/${id}/review`,{approved:true,draft:'模拟草稿'});assert.equal(early.status,409);
let job;
for(let i=0;i<200;i++){job=await(await fetch(url+`/api/runs/${id}`)).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,1500));}
assert.equal(job.status,'completed',job.error);
assert.equal(job.outcome.trace.length,4);
assert.equal(job.outcome.outputs.course.price,null);assert.equal(job.outcome.outputs.course.schedule,null);
assert.equal(job.outcome.outputs.admissions.age,8);
assert.equal(job.outcome.outputs.admissions.foundation,'零基础');
assert.equal(new Set(job.outcome.trace.map(p=>p.sessionId)).size,4);
assert(job.outcome.trace.every(p=>p.exitCode===0&&p.openclawRunId));
const review=await post(`/api/runs/${id}/review`,{approved:true,draft:job.outcome.outputs.report.parentReply});assert.equal(review.status,200);
const reviewed=await review.json();assert.equal(reviewed.approved,true);assert.equal(reviewed.sent,false);
await writeFile(join(ROOT,'.local','verified-http.json'),JSON.stringify({jobId:id,checks:['202 start','409 duplicate','409 premature review','4 independent sessions','age and foundation','null price and schedule','receipt present','200 review','sent=false'],outcome:job.outcome,review:reviewed},null,2));
console.log(`HTTP E2E passed: ${id}; 4 real OpenClaw calls, review saved, no message sent.`);
