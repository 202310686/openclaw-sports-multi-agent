import { JobStore } from './job-store.mjs';
export const STATUSES=['待补信息','待联系','待试听','已试听','已结束'];
function text(value,max) {
  if(typeof value!=='string'||value.length>max) throw new Error('台账字段格式或长度无效');
  if(/1[3-9]\d{9}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:手机号|微信|家庭住址)\s*[:：]/.test(value)) throw new Error('仅填写模拟资料，请移除联系方式');
  return value.trim();
}
export class Ledger {
  constructor(directory){this.store=new JobStore(directory);this.records=new Map();this.queue=Promise.resolve();}
  async load(){for(const record of await this.store.load())this.records.set(record.id,record);}
  list(){return [...this.records.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  transaction(action){const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;}
  create(job){return this.transaction(async()=>{
    if(job.status!=='completed'||job.outcome?.scenario!=='admissions')throw new Error('仅完成的招生咨询可加入台账');
    const existing=this.list().find(r=>r.jobId===job.id);if(existing)return existing;
    const now=new Date().toISOString();
    const record={id:crypto.randomUUID(),events:[],jobId:job.id,customerCode:`SIM-${crypto.randomUUID().slice(0,8).toUpperCase()}`,summary:text(job.outcome.outputs.report.summary,5000),owner:'未分配',status:'待联系',nextFollowUp:'',notes:'',synthetic:true,sent:false,createdAt:now,updatedAt:now,revision:1};
    await this.store.save(record);this.records.set(record.id,record);return record;
  });}
  update(id,data){return this.transaction(async()=>{
    const old=this.records.get(id);if(!old)throw new Error('台账记录不存在');
    if(data.revision!==old.revision)throw new Error('记录已被更新，请刷新后再保存');
    if(!STATUSES.includes(data.status))throw new Error('跟进状态无效');
    const date=text(data.nextFollowUp,10);
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('跟进日期无效');
    const record={...old,owner:text(data.owner,80)||'未分配',notes:text(data.notes,2000),nextFollowUp:date,status:data.status,updatedAt:new Date().toISOString(),revision:old.revision+1};
    record.events=[...old.events,{at:record.updatedAt,from:old.status,to:record.status,revision:record.revision}];
    await this.store.save(record);this.records.set(id,record);return record;
  });}
}
