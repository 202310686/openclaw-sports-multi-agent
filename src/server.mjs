import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JobStore } from './job-store.mjs';
import { Ledger } from './ledger.mjs';
import { ROOT } from './runtime.mjs';
import { runWorkflow, validateInput } from './workflow.mjs';
const port = Number(process.env.PORT || 18890);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 无效');
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const store = new JobStore(join(process.env.SPORTS_DATA_DIR || join(ROOT, '.local'), 'jobs'));
const jobs = new Map((await store.load()).map(job => [job.id, job]));
const ledger = new Ledger(join(process.env.SPORTS_DATA_DIR || join(ROOT,'.local'),'ledger'));
await ledger.load();
// Preserve the previously verified HTTP run, including its original approval.
if (!process.env.SPORTS_DATA_DIR) {
  try {
    const legacy = JSON.parse(await readFile(join(ROOT, '.local/verified-http.json'), 'utf8'));
    if (legacy.jobId && (!jobs.has(legacy.jobId) || !jobs.get(legacy.jobId).outcome?.outputs)) {
      const jobId = legacy.jobId;
      const outcome = { ...legacy.outcome, review:legacy.review || legacy.outcome.review };
      const job = { id:jobId, scenario:outcome.scenario, createdAt:outcome.startedAt, status:'completed', events:[], outcome, error:null };
      await store.save(job); jobs.set(jobId,job);
    }
  } catch { /* Older installations may have no verified HTTP record. */ }
}
let busy = false;
function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function download(res, data) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="sports-${data.runId}.json"` }); res.end(JSON.stringify(data, null, 2)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 JSON 请求');
  let b = ''; for await (const chunk of req) { b += chunk; if (Buffer.byteLength(b) > 16000) throw new Error('请求过大'); }
  return JSON.parse(b);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(res, 403, { error: 'Host 不允许' });
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return send(res, 403, { error: 'Origin 不允许' });
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  try {
    if(req.method==='GET' && path==='/api/ledger') return send(res,200,ledger.list());
    if(req.method==='POST' && path==='/api/ledger') {
      const data=await body(req),job=jobs.get(data.jobId);
      if(!job)return send(res,404,{error:'任务不存在'});
      return send(res,200,await ledger.create(job));
    }
    const ledgerMatch=path.match(/^\/api\/ledger\/([0-9a-f-]{36})$/);
    if(req.method==='POST' && ledgerMatch) return send(res,200,await ledger.update(ledgerMatch[1],await body(req)));
    const assets = { '/': ['public/index.html', 'text/html'], '/app.js': ['public/app.js', 'text/javascript'], '/style.css': ['public/style.css', 'text/css'] };
    if (req.method === 'GET' && assets[path]) { const [file, type] = assets[path]; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(await readFile(join(ROOT, file))); }
    if (req.method === 'GET' && path === '/api/cases') return send(res, 200, JSON.parse(await readFile(join(ROOT, 'examples/cases.json'), 'utf8')));
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true, busy, service: 'sports-prototype', version: '0.2.0', pid: process.pid });
    if (req.method === 'GET' && path === '/api/history') return send(res, 200, [...jobs.values()].sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0,100).map(j => ({id:j.id, scenario:j.scenario || j.outcome?.scenario, status:j.status, createdAt:j.createdAt || j.outcome?.startedAt, approved:j.outcome?.review?.approved === true})));
    if (req.method === 'GET' && ['/api/replay','/api/replay/export'].includes(path)) {
      const scenario = new URL(req.url, `http://127.0.0.1:${port}`).searchParams.get('scenario') || 'admissions';
      if (!['admissions','coach'].includes(scenario)) return send(res,400,{error:'回放场景无效'});
      try { const data=JSON.parse(await readFile(join(ROOT, `examples/verified-${scenario}.json`), 'utf8')); return path.endsWith('/export') ? download(res,data) : send(res,200,data); }
      catch { return send(res, 404, { error: '尚无已验证历史样例。它不是实时模型输出。' }); }
    }
    if (req.method === 'POST' && path === '/api/runs') {
      if (busy) return send(res, 409, { error: '已有任务运行，请等待或取消，避免重复付费调用。' });
      const data = await body(req); validateInput(data.input, data.scenario, data.synthetic);
      if (data.acceptCost !== true) return send(res, 400, { error: '请确认实际调用会产生 API 费用。' });
      if (busy) return send(res,409,{error:'已有任务运行，请勿重复提交。'});
      busy = true;
      const id = crypto.randomUUID();
      const job = { id, scenario:data.scenario, createdAt:new Date().toISOString(), status: 'running', events: [], outcome: null, error: null, controller: new AbortController() };
      jobs.set(id, job);
      try { await store.save(job); } catch(error) { jobs.delete(id); busy=false; throw error; }
      send(res, 202, { id });
      runWorkflow({ ...data, signal: job.controller.signal, onEvent: event => { job.events.push(event); store.save(job).catch(() => { job.persistenceError = '阶段记录保存失败'; }); } })
        .then(outcome => { job.outcome = outcome; job.status = 'completed'; })
        .catch(error => { job.status = job.controller.signal.aborted ? 'cancelled' : 'failed'; job.error = error.message; })
        .finally(async () => { try { await store.save(job); } catch { job.persistenceError = '任务记录保存失败，请立即导出结果'; } finally { busy = false; } });
      return;
    }
    const match = path.match(/^\/api\/runs\/([0-9a-f-]{36})(?:\/(review|cancel|export))?$/);
    if (match) {
      const job = jobs.get(match[1]); if (!job) return send(res, 404, { error: '任务不存在。' });
      if (req.method === 'GET' && !match[2]) return send(res, 200, { id: job.id, status: job.status, events: job.events, outcome: job.outcome, error: job.error });
      if (req.method === 'GET' && match[2] === 'export') {
        if (job.status !== 'completed') return send(res,409,{error:'只有完成的任务可导出'});
        return download(res,job.outcome);
      }
      if (req.method === 'POST' && match[2] === 'cancel') { await body(req); job.controller?.abort(); return send(res, 200, { cancelled: true }); }
      if (req.method === 'POST' && match[2] === 'review') {
        const data = await body(req);
        if (job.status !== 'completed') return send(res, 409, { error: '只有完成的任务可审核。' });
        if (typeof data.draft !== 'string' || data.draft.length > 6000 || data.approved !== true) return send(res, 400, { error: '请填写草稿并明确确认人工审核。' });
        job.outcome.review = { approved: true, sent: false, approvedAt: new Date().toISOString(), editedDraft: data.draft };
        await mkdir(join(ROOT, '.local/reviews'), { recursive: true });
        await writeFile(join(ROOT, '.local/reviews', `${job.id}.json`), JSON.stringify(job.outcome.review, null, 2));
        await store.save(job);
        return send(res, 200, job.outcome.review);
      }
    }
    send(res, 404, { error: '接口不存在' });
  } catch (error) { send(res, 400, { error: error instanceof SyntaxError ? 'JSON 格式错误' : error.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`体育培训 Multi-Agent 原型：http://127.0.0.1:${port}`));
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { for (const job of jobs.values()) job.controller?.abort(); server.close(() => process.exit(0)); });
