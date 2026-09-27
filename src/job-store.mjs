import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
export class JobStore {
  constructor(directory) { this.directory = directory; this.pending = Promise.resolve(); }
  save(job) {
    const { controller, ...record } = job;
    const text = JSON.stringify(record, null, 2);
    const operation = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const file = join(this.directory, `${job.id}.json`);
      await writeFile(`${file}.tmp`, text);
      await rename(`${file}.tmp`, file);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  async load() {
    await mkdir(this.directory, { recursive: true });
    const records = [];
    for (const name of await readdir(this.directory)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      try {
        const job = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
        if (name !== `${job.id}.json` || !Array.isArray(job.events)) continue;
        if (job.status === 'running') {
          job.status = 'interrupted';
          job.error = '服务重启中断了任务。已保留阶段证据；未自动重试或继续付费调用。';
          await this.save(job);
        }
        records.push(job);
      } catch { console.error(`历史记录读取失败：${name}（原文件保留）`); }
    }
    return records;
  }
}
