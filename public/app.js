const $ = id => document.getElementById(id);
let cases = [], jobId = null, outcome = null, running = false, replayMode = false;
const names = { plan: ['运营主管 · 制定计划', 'sports-coordinator'], admissions: ['招生顾问 · 分析需求', 'sports-admissions'], course: ['课程顾问 · 推荐课程', 'sports-course'], coach: ['教练助手 · 整理观察', 'sports-coach'], report: ['运营主管 · 汇总审核', 'sports-coordinator'] };
function stages() { return $('scenario').value === 'coach' ? ['plan','coach','report'] : ['plan','admissions','course','report']; }
function timeline() {
  $('timeline').replaceChildren();
  stages().forEach((stage, i) => {
    const row = document.createElement('div'); row.className = 'stage'; row.id = `stage-${stage}`;
    const icon = document.createElement('div'); icon.className = 'stage-icon'; icon.textContent = String(i + 1).padStart(2, '0');
    const info = document.createElement('div'); info.className = 'stage-info';
    const strong = document.createElement('strong'); strong.textContent = names[stage][0];
    const small = document.createElement('small'); small.textContent = names[stage][1]; info.append(strong, small);
    const time = document.createElement('span'); time.className = 'stage-time'; time.textContent = '待执行'; row.append(icon, info, time); $('timeline').append(row);
  });
}
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function api(path, data) {
  const r = await fetch(path, data ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) } : {});
  const b = await r.json(); if (!r.ok) throw new Error(b.error || '请求失败'); return b;
}
function pickCases() {
  $('case').replaceChildren();
  cases.filter(c => c.scenario === $('scenario').value).forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; $('case').append(o); });
  $('input-title').textContent = $('scenario').value === 'coach' ? '输入模拟训练记录' : '输入家长咨询';
  $('nav-coach').classList.toggle('active', $('scenario').value === 'coach'); $('nav-admissions').classList.toggle('active', $('scenario').value === 'admissions');
  loadCase(); timeline();
}
function loadCase() { $('input').value = cases.find(c => c.id === $('case').value)?.input || ''; $('count').textContent = `${$('input').value.length} / 2000`; }
function lock(value) {
  running = value; for (const id of ['run','scenario','case','input','replay','nav-admissions','nav-coach']) $(id).disabled = value;
  $('cancel').disabled = !value;
}
function node(tag, text, cls) { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; }
function listCard(title, lines) { const box = node('div', '', 'output-item'); box.append(node('h3', title)); const ul = document.createElement('ul'); (lines.length ? lines : ['无明确记录 / 待确认']).forEach(s => ul.append(node('li', s))); box.append(ul); return box; }
function renderResult(data) {
  outcome = data; $('empty').hidden = true; $('results').hidden = false; $('output-cards').replaceChildren();
  const out = data.outputs;
  if (out.admissions) {
    const a = out.admissions, box = node('div', '', 'output-item'); box.append(node('h3', '客户画像 · 仅明确事实'));
    const kv = node('div', '', 'key-value');
    Object.entries({ 年龄: a.age === null ? '待确认' : `${a.age}岁`, 篮球基础:a.foundation, 目标:a.goals.join('、'), 模拟区域:a.area, 时间偏好:a.availability, 试听意向:a.trialIntent }).forEach(([k,v]) => kv.append(node('span',k,'key'),node('span',v || '待确认')));
    box.append(kv); $('output-cards').append(box);
    const c = out.course, courseName = { foundation:'基础班', improvement:'提高班', team:'战队班' }[c.courseId] || '先补充信息再评估';
    $('output-cards').append(listCard(`初步课程建议 · ${courseName}`, [...c.reasons, ...c.prerequisites, '价格和排课：待工作人员确认']));
  }
  if (out.coach) { $('output-cards').append(listCard('教练观察与优势', [...out.coach.observations, ...out.coach.strengths]), listCard('下一阶段训练重点', [...out.coach.nextTraining, out.coach.historyLimit])); }
  $('output-cards').append(listCard('主管综合总结', [out.report.summary]),listCard('工作人员下一步', out.report.followUp), listCard('待确认与事实边界', [...out.report.unknown, out.report.evidenceBoundary]));
  $('draft').value = data.review?.editedDraft || out.report.parentReply; $('approved').checked = data.review?.approved === true; $('review').disabled = true;
  $('review-status').textContent = replayMode ? '历史样例 · 不可保存为新审核' : data.review?.approved ? '已人工审核 · 未发送' : '待审核 · 未发送';
  $('export').disabled = false; $('trace').textContent = JSON.stringify({ mode:data.mode, trace:data.trace, review:data.review }, null, 2);
}
function resetResult() { outcome=null; $('results').hidden=true; $('empty').hidden=false; $('export').disabled=true; $('review').disabled=true; $('trace').textContent='等待实际执行证据。'; }
let rendered = 0;
async function poll() {
  try {
    const job = await api(`/api/runs/${jobId}`);
    for (const e of job.events.slice(rendered)) {
      if (e.type === 'stage-start') { const row=$(`stage-${e.stage}`); row?.classList.add('active'); if(row) row.querySelector('.stage-time').textContent='调用中'; status(`${names[e.stage][0]}正在运行。请勿重复提交。`); }
      if (e.type === 'stage-done') { const row=$(`stage-${e.stage}`); row?.classList.remove('active'); row?.classList.add('done'); if(row){row.querySelector('.stage-icon').textContent='✓'; row.querySelector('.stage-time').textContent=`${(e.proof.durationMs/1000).toFixed(1)}s`;} }
    }
    rendered=job.events.length;
    $('trace').textContent=JSON.stringify(job.events.filter(e=>e.type==='stage-done').map(e=>e.proof),null,2);
    if(job.status==='completed'){for(const proof of job.outcome.trace){const row=$(`stage-${proof.stage}`);if(row){row.classList.remove('active');row.classList.add('done');row.querySelector('.stage-icon').textContent='✓';row.querySelector('.stage-time').textContent=`${(proof.durationMs/1000).toFixed(1)}s`;}}lock(false);renderResult(job.outcome);status(`完成 · ${job.outcome.trace.length}次实际 Agent 调用 · ${(job.outcome.durationMs/1000).toFixed(1)}秒。请审核回复草稿。`);return;}
    if(job.status!=='running'){lock(false);document.querySelectorAll('.stage.active').forEach(row=>{row.classList.remove('active');row.querySelector('.stage-time').textContent='已停止';});status(job.error || '任务已停止',true);return;}
    setTimeout(poll,1200);
  } catch(e){lock(false);status(`读取状态失败：${e.message}。后台任务可能仍在运行，请勿立即重复提交。`,true);}
}
$('run').onclick=async()=>{try{lock(true);replayMode=false;resetResult();timeline();rendered=0;$('mode').textContent='实时 · 真实调用';status('提交工作流…');const j=await api('/api/runs',{input:$('input').value,scenario:$('scenario').value,synthetic:$('synthetic').checked,acceptCost:$('cost').checked});jobId=j.id;localStorage.setItem('sports-last-job',JSON.stringify({id:jobId,scenario:$('scenario').value}));poll();}catch(e){lock(false);status(e.message,true);}};
$('cancel').onclick=async()=>{try{await api(`/api/runs/${jobId}/cancel`,{});status('正在取消当前模型任务…');}catch(e){status(e.message,true);}};
$('replay').onclick=async()=>{try{const data=await api(`/api/replay?scenario=${$('scenario').value}`);replayMode=true;jobId=null;$('scenario').value=data.scenario;pickCases();timeline();data.mode='historical-replay';data.trace.forEach(p=>{const row=$(`stage-${p.stage}`);row?.classList.add('done');if(row)row.querySelector('.stage-time').textContent='历史记录';});$('mode').textContent='离线 · 历史回放';renderResult(data);status('这是已保存的真实测试结果，不是当前实时调用；无 API 费用。');}catch(e){status(e.message,true);}};
$('approved').onchange=()=>{$('review').disabled=!$('approved').checked || !outcome || replayMode || running;};
$('review').onclick=async()=>{try{const review=await api(`/api/runs/${jobId}/review`,{approved:true,draft:$('draft').value});outcome.review=review;$('review-status').textContent='已人工审核 · 未发送';$('review').disabled=true;$('export').disabled=false;status('审核已保存在本机。没有向任何客户发送。');}catch(e){status(e.message,true);}};
$('draft').oninput=()=>{if(!outcome)return;$('approved').checked=false;$('review').disabled=true;$('export').disabled=true;$('review-status').textContent=replayMode?'历史样例不可保存修改，请重新加载回放':'草稿已修改 · 审核保存后再导出';};
$('export').onclick=()=>{if(!outcome)return;const a=document.createElement('a');a.href=replayMode?`/api/replay/export?scenario=${outcome.scenario}`:`/api/runs/${jobId}/export`;a.download=`sports-${outcome.runId}.json`;document.body.append(a);a.click();a.remove();};
$('scenario').onchange=()=>{resetResult();pickCases();$('mode').textContent='尚未运行';};$('case').onchange=loadCase;$('input').oninput=()=>{$('count').textContent=`${$('input').value.length} / 2000`;};
for(const [id,scenario] of [['nav-admissions','admissions'],['nav-coach','coach']])$(id).onclick=()=>{$('scenario').value=scenario;$('scenario').onchange();};
async function boot(){try{cases=await api('/api/cases');pickCases();const h=await api('/api/health');$('health').textContent=h.busy?'服务在线 · 有任务运行':'本机服务在线';
  const query=new URLSearchParams(location.search);let saved;
  try{saved=JSON.parse(localStorage.getItem('sports-last-job')||'null');}catch{saved=null;}
  const id=query.get('run')||saved?.id;
  if(id&&/^[0-9a-f-]{36}$/.test(id)){try{const j=await api(`/api/runs/${id}`);jobId=id;const scenario=query.get('scenario')||j.outcome?.scenario||saved?.scenario||'admissions';if(['admissions','coach'].includes(scenario))$('scenario').value=scenario;pickCases();$('mode').textContent='实时记录 · 已恢复';rendered=0;lock(j.status==='running');poll();}catch{localStorage.removeItem('sports-last-job');status('之前的任务已不在服务内存中。请点击刷新历史查看已保存的任务。');}}
}catch(e){status(e.message,true);$('health').textContent='服务未连接';}}boot();

async function history(){try{const records=await api('/api/history');$('history').replaceChildren();if(!records.length)$('history').append(node('p','暂无任务记录'));for(const record of records){const button=node('button',`${record.createdAt || ''} · ${record.scenario === 'coach' ? '教练反馈':'招生咨询'} · ${record.status}${record.approved?' · 已审核':''}`);button.disabled=running;button.onclick=()=>{if(running)return;jobId=record.id;localStorage.setItem('sports-last-job',JSON.stringify({id:jobId,scenario:record.scenario}));replayMode=false;$('scenario').value=record.scenario || 'admissions';pickCases();resetResult();rendered=0;$('mode').textContent='本机历史 · 已恢复';poll();};$('history').append(button);}}catch(e){status(e.message,true);}}
$('refresh-history').onclick=history;history();

async function loadLedger(){try{const records=await api('/api/ledger');$('ledger').replaceChildren();if(!records.length)$('ledger').append(node('p','暂无跟进记录，请先选择已完成的招生咨询。'));for(const r of records){const box=node('div','','output-item');box.append(node('h3',r.customerCode),node('p',r.summary));const fields={};for(const [key,label] of [['owner','负责人（模拟代号）'],['status','跟进状态'],['nextFollowUp','下次跟进日期'],['notes','人工备注']]){const field=document.createElement(key==='status'?'select':key==='notes'?'textarea':'input');if(key==='status')for(const value of ['待补信息','待联系','待试听','已试听','已结束']){const o=node('option',value);o.value=value;field.append(o);}if(key==='nextFollowUp')field.type='date';if(key==='owner')field.maxLength=80;if(key==='notes')field.maxLength=2000;field.value=r[key];const labelNode=node('label',label);labelNode.append(field);box.append(labelNode);fields[key]=field;}const save=node('button','保存人工跟进');save.onclick=async()=>{save.disabled=true;try{await api(`/api/ledger/${r.id}`,{revision:r.revision,...Object.fromEntries(Object.entries(fields).map(([k,f])=>[k,f.value]))});status('跟进已保存到本机；未预约、未发送。');await loadLedger();}catch(e){status(e.message,true);}finally{save.disabled=false;}};box.append(save,node('p',`版本 ${r.revision} · 更新 ${r.updatedAt}`,'muted'));$('ledger').append(box);}}catch(e){status(e.message,true);}}
$('add-ledger').onclick=async()=>{try{if(!jobId||!outcome||replayMode||outcome.scenario!=='admissions')throw new Error('请先打开已完成的招生咨询任务（历史演示不建档）。');await api('/api/ledger',{jobId});await loadLedger();status('咨询已加入模拟跟进台账，同一任务只保留一条记录。');}catch(e){status(e.message,true);}};
$('refresh-ledger').onclick=loadLedger;loadLedger();
