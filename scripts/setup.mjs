import { readFile, writeFile, mkdir, copyFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, AGENTS, locateCLI } from '../src/runtime.mjs';
const base = join(homedir(), '.openclaw/sports-prototype');
const config = join(homedir(), '.openclaw/openclaw.json');
const manifest = join(base, 'setup-manifest.json');
const displayNames = { coordinator:'运营主管', admissions:'招生顾问', course:'课程顾问', coach:'教练助手' };
await mkdir(base, { recursive: true });
if (process.argv.includes('--rollback')) {
  if (!existsSync(manifest)) throw new Error('没有本项目安装记录。');
  const record = JSON.parse(await readFile(manifest, 'utf8'));
  const current = JSON.parse(await readFile(config, 'utf8'));
  for (const id of record.created) {
    if (JSON.stringify(current.agents.entries[id]) !== JSON.stringify(record.entries[id])) throw new Error(`Agent ${id} 在安装后被修改；保留配置，请手动审核。`);
  }
  await copyFile(config, join(base, `before-rollback-${Date.now()}.json`));
  for (const id of record.created) delete current.agents.entries[id];
  await writeFile(config, JSON.stringify(current, null, 2));
  record.rolledBack = true;
  await writeFile(manifest, JSON.stringify(record, null, 2));
  console.log('已撤销本项目 Agent 注册；main、模型密钥、工作区和运行记录均保留。');
  process.exit(0);
}
if (existsSync(manifest)) {
  const record = JSON.parse(await readFile(manifest, 'utf8'));
  const current = JSON.parse(await readFile(config, 'utf8'));
  if (record.rolledBack) await rename(manifest, `${manifest}.archived-${Date.now()}`);
  else {
    if (record.created.length === Object.keys(AGENTS).length && record.created.every(id => current.agents.entries[id])) { console.log('本项目 Agent 已注册，不重复初始化。'); process.exit(0); }
    throw new Error('存在旧安装记录但注册不完整。请先审核或回滚，不覆盖。');
  }
}
const original = await readFile(config);
const before = JSON.parse(original);
if (Object.values(AGENTS).some(id => before.agents.entries[id])) throw new Error('发现同名 Agent，保留原配置。');
const backup = join(base, `openclaw-before-${Date.now()}.json`);
await writeFile(backup, original);
const record = { created: [], entries: {}, backup, baselineSHA256: createHash('sha256').update(original).digest('hex') };
await writeFile(manifest, JSON.stringify(record, null, 2));
try {
  for (const [role, id] of Object.entries(AGENTS)) {
    const workspace = join(base, 'workspaces', role);
    await mkdir(workspace, { recursive: true });
    const out = spawnSync(process.execPath, [locateCLI(), 'agents', 'add', id, '--workspace', workspace, '--model', 'deepseek/deepseek-v4-pro', '--non-interactive', '--json'], { encoding: 'utf8', timeout: 120000, windowsHide: true });
    if (out.status !== 0) throw new Error(`注册 ${id} 失败（退出码 ${out.status}）。检查本机 OpenClaw 日志。`);
    await copyFile(join(ROOT, 'agents', role, 'SOUL.md'), join(workspace, 'SOUL.md'));
    await writeFile(join(workspace, 'AGENTS.md'), '# 项目工作规则\n只执行当前明确的模拟业务任务。知识资料由应用注入。禁止外部发送、系统操作和私有数据读取。不需要初始化身份或修改工作区。\n');
    record.created.push(id);
    const c = JSON.parse(await readFile(config, 'utf8'));
    c.agents.entries[id].tools = { deny: ['*'] };
    c.agents.entries[id].skills = [];
    c.agents.entries[id].identity = { ...c.agents.entries[id].identity, name:`${id}（${displayNames[role]}）` };
    await writeFile(config, JSON.stringify(c, null, 2));
    record.entries[id] = c.agents.entries[id];
    await writeFile(manifest, JSON.stringify(record, null, 2));
    console.log(`已注册 ${id}（工具禁用，独立工作区）`);
  }
} catch (error) { console.error(error.message); console.error('已有变更记录在本机 manifest，可运行 npm run rollback 撤销。'); process.exitCode = 1; }
