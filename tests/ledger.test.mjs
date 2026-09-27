import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../src/ledger.mjs';
test('ledger deduplicates, validates, detects stale edits and survives restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sports-ledger-')),ledger=new Ledger(dir);await ledger.load();
  const job={id:crypto.randomUUID(),status:'completed',outcome:{scenario:'admissions',outputs:{report:{summary:'模拟孩子零基础，希望周末试听'}}}};
  const [a,b]=await Promise.all([ledger.create(job),ledger.create(job)]);assert.equal(a.id,b.id);assert.equal(ledger.list().length,1);
  const edit={revision:1,owner:'模拟工作人员A',status:'待试听',nextFollowUp:'2026-10-01',notes:'人工确认后联系'};
  await assert.rejects(ledger.update(a.id,{...edit,nextFollowUp:'2026-02-30'}),/日期/);
  await assert.rejects(ledger.update(a.id,{...edit,status:'已发送'}),/状态/);
  const result=await ledger.update(a.id,edit);assert.equal(result.revision,2);assert.equal(result.sent,false);
  await assert.rejects(ledger.update(a.id,edit),/刷新/);
  await assert.rejects(ledger.update(a.id,{...edit,revision:2,notes:'模拟13812345678'}),/联系方式/);
  const restored=new Ledger(dir);await restored.load();assert.equal(restored.list()[0].owner,edit.owner);assert.equal(restored.list()[0].events.length,1);
  await assert.rejects(ledger.create({...job,id:crypto.randomUUID(),status:'running'}),/完成/);
});
