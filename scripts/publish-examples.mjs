import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../src/runtime.mjs';
// Explicit allowlist export. Never copy CLI envelopes, credentials, raw logs or prompts.
for(const scenario of ['admissions','coach']){
  const path=join(ROOT,'.local',scenario==='admissions'?'verified-http.json':'verified-coach.json');
  const source=JSON.parse(await readFile(path,'utf8'));
  const r=source.outcome??source;
  if(r.status!=='completed'||r.dataClass!=='synthetic'||r.mode!=='live')throw new Error('只发布已完成的模拟数据真实运行结果');
  const data={runId:r.runId,scenario:r.scenario,dataClass:'synthetic',mode:'historical-replay',status:r.status,startedAt:r.startedAt,durationMs:r.durationMs,outputs:r.outputs,
    trace:r.trace.map(p=>({agent:p.agent,sessionId:p.sessionId,stage:p.stage,startedAt:p.startedAt,durationMs:p.durationMs,exitCode:p.exitCode,transport:p.transport,model:p.model,openclawRunId:p.openclawRunId,provider:p.provider})),review:{approved:false,sent:false},provenance:'由内置模拟案例实际调用 OpenClaw + DeepSeek 后保存；不是当前实时输出，且不附原始模型封装或密钥'};
  const text=JSON.stringify(data,null,2);
  if(/sk-[a-zA-Z0-9]{20,}|C:[\\/]+Users[\\/]+|authToken|apiKey/.test(text))throw new Error('公开样例疑似含私有字段');
  await writeFile(join(ROOT,'examples',`verified-${scenario}.json`),text);
  console.log(`导出已脱敏 ${scenario} 历史样例`);
}
