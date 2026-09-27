import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../src/runtime.mjs';
import { validateResult } from '../src/workflow.mjs';
const records=[];
for (const scenario of ['admissions','coach']) {
  const data=JSON.parse(await readFile(join(ROOT,`examples/verified-${scenario}.json`),'utf8'));
  const checks=[];
  for (const [stage,result] of Object.entries(data.outputs)) { validateResult(stage,result); checks.push(`${stage}: schema passed`); }
  assert.equal(data.review.sent,false);checks.push('no external sending');
  assert.equal(new Set(data.trace.map(p=>p.sessionId)).size,data.trace.length);checks.push('distinct sessions');
  if(scenario==='admissions'){assert.equal(data.outputs.admissions.age,8);assert.equal(data.outputs.course.price,null);assert.equal(data.outputs.course.schedule,null);checks.push('known age retained; unknown price/schedule remain null');}
  records.push({scenario,mode:'offline-audit-of-historical-live-output',runId:data.runId,checks});
}
await mkdir(join(ROOT,'.local'),{recursive:true});
await writeFile(join(ROOT,'.local/quality-audit.json'),JSON.stringify({createdAt:new Date().toISOString(),limitations:'Two saved examples only; not a new live call, broad benchmark, or single-agent comparison.',records},null,2));
console.log(JSON.stringify(records,null,2));
