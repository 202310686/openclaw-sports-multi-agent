import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, validateResult, parseObject, parseEnvelope, runWorkflow } from '../src/workflow.mjs';
const fixture = {
  plan:{steps:['需求分析','课程建议','主管汇总'],boundary:'模拟数据，人工审核'},
  admissions:{age:8,foundation:'零基础',goals:['体能','团队意识'],area:'模拟区域',availability:'周末',trialIntent:'想试听',missing:['具体校区','具体时间']},
  course:{courseId:'foundation',reasons:['零基础'],prerequisites:['教练评估'],unknown:['价格','课表'],price:null,schedule:null},
  coach:{observations:['运球基本掌握'],strengths:['参与积极'],improvements:['投篮稳定性'],nextTraining:['基础动作训练'],historyLimit:'无历史对比，不推断进步'},
  report:{summary:'模拟方案',parentReply:'建议先了解基础班，具体时间待确认。',followUp:['确认时间'],unknown:['价格'],evidenceBoundary:'模拟数据，人工审核，未发送'}
};
test('accept synthetic consultation',()=>assert.match(validateInput('模拟：孩子8岁零基础','admissions',true),/8岁/));
test('reject real-data consent absent',()=>assert.throws(()=>validateInput('模拟：孩子8岁零基础','admissions',false)));
test('reject unsupported scenario',()=>assert.throws(()=>validateInput('模拟：孩子8岁零基础','unknown',true)));
test('reject oversized input',()=>assert.throws(()=>validateInput('模拟'.repeat(1200),'admissions',true)));
test('reject mobile contact',()=>assert.throws(()=>validateInput('模拟手机号13812345678','admissions',true)));
test('reject email',()=>assert.throws(()=>validateInput('模拟联系人 test@example.com','admissions',true)));
test('reject labelled home address',()=>assert.throws(()=>validateInput('家庭住址：真实地址示例','admissions',true)));
test('accept JSON with fence',()=>assert.equal(parseObject('```json\n{"x":1}\n```').x,1));
test('reject prose pretending to be JSON',()=>assert.throws(()=>parseObject('已调用Agent，成功！')));
test('reject array result',()=>assert.throws(()=>parseObject('[]')));
test('extract CLI envelope with banner',()=>assert.equal(parseEnvelope('banner\n{"result":{"payloads":[{"text":"ok"}],"meta":{}}}').text,'ok'));
test('reject missing CLI payload',()=>assert.throws(()=>parseEnvelope('{"ok":false}')));
test('reject guessed course price',()=>assert.throws(()=>validateResult('course',{...fixture.course,price:99})));
test('reject invalid course ID',()=>assert.throws(()=>validateResult('course',{...fixture.course,courseId:'vip'})));
test('reject monetary promise in draft',()=>assert.throws(()=>validateResult('report',{...fixture.report,parentReply:'只要99元'})));
test('discard unknown output fields',()=>assert.equal(validateResult('plan',{...fixture.plan,extra:'ignored'}).extra,undefined));
test('admissions sequence delegates to independent role IDs',async()=>{
  const calls=[],events=[];
  const runner=async({role,stage})=>{calls.push([role,stage]);return{result:structuredClone(fixture[stage]),proof:{agent:`sports-${role}`,stage,sessionId:`test-${stage}`,transport:'test-stub',exitCode:0}};};
  const r=await runWorkflow({input:'模拟孩子8岁，零基础想试听',runner,onEvent:e=>events.push(e)});
  assert.deepEqual(calls,[['coordinator','plan'],['admissions','admissions'],['course','course'],['coordinator','report']]);
  assert.equal(r.mode,'test');assert.equal(r.review.sent,false);assert.equal(r.review.approved,false);assert.equal(events.at(-1).type,'completed');
});
test('coach path does not invoke course or admissions',async()=>{
  const calls=[];const runner=async({stage})=>{calls.push(stage);return{result:structuredClone(fixture[stage]),proof:{stage,transport:'test-stub'}};};
  await runWorkflow({input:'模拟训练记录：课堂积极，投篮不稳定，无历史对比',scenario:'coach',runner});
  assert.deepEqual(calls,['plan','coach','report']);
});
test('failure stops workflow without fabricating later stages',async()=>{
  const calls=[];const runner=async({stage})=>{calls.push(stage);if(stage==='admissions')throw new Error('network unavailable');return{result:fixture[stage],proof:{stage}};};
  await assert.rejects(runWorkflow({input:'模拟孩子8岁零基础',runner}),/network/);assert.deepEqual(calls,['plan','admissions']);
});
test('pre-cancelled run performs no API calls',async()=>{
  const controller=new AbortController();controller.abort();let count=0;
  await assert.rejects(runWorkflow({input:'模拟孩子8岁零基础',signal:controller.signal,runner:async()=>{count++;}}),/取消/);assert.equal(count,0);
});
