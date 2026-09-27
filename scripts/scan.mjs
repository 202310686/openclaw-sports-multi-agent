import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT } from '../src/runtime.mjs';
const excluded=new Set(['.git','.local','node_modules']);
const findings=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(/\.(?:mjs|js|json|md|txt|cmd|html|css|yml|example)$/.test(e.name)||e.name==='.gitignore'){
  const s=await readFile(p,'utf8');
  if(/sk-[a-zA-Z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s))findings.push(relative(ROOT,p));
  if(p!==join(ROOT,'scripts/scan.mjs') && /C:[\\/]+Users[\\/]+z1593|13812345678/.test(s) && !relative(ROOT,p).startsWith('tests'))findings.push(`${relative(ROOT,p)}: local personal path/contact`);
}}}
await walk(ROOT);
if(findings.length){console.error(findings.join('\n'));process.exitCode=1;}else console.log('公开项目文件未发现常见密钥格式或当前用户绝对路径。此为启发式扫描，不替代人工检查。');
