import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../src/job-store.mjs';
test('durable results and approval survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(),'sports-store-'));
  const store = new JobStore(directory);
  const job = {id:crypto.randomUUID(),status:'completed',events:[],outcome:{review:{approved:true,sent:false,editedDraft:'模拟草稿'}},controller:new AbortController()};
  await store.save(job);
  const loaded = await new JobStore(directory).load();
  assert.equal(loaded[0].outcome.review.editedDraft,'模拟草稿');
  assert.equal(loaded[0].outcome.review.sent,false);
  assert.equal(loaded[0].controller,undefined);
});
test('interrupted tasks never resume automatically', async () => {
  const directory = await mkdtemp(join(tmpdir(),'sports-store-'));
  const store = new JobStore(directory), id=crypto.randomUUID();
  await store.save({id,status:'running',events:[{type:'stage-done',stage:'plan'}]});
  const [job]=await new JobStore(directory).load();
  assert.equal(job.status,'interrupted');assert.equal(job.events.length,1);
  assert.match(job.error,/未自动重试/);
  assert.equal(JSON.parse(await readFile(join(directory,`${id}.json`),'utf8')).status,'interrupted');
});
test('ordered snapshots keep the final review', async () => {
  const directory = await mkdtemp(join(tmpdir(),'sports-store-'));
  const store = new JobStore(directory), id=crypto.randomUUID();
  await Promise.all([store.save({id,status:'running',events:[]}),store.save({id,status:'completed',events:[],outcome:{review:{approved:true}}})]);
  assert.equal((await store.load())[0].outcome.review.approved,true);
});
