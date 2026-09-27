import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export function locateCLI() {
  const choices = [process.env.OPENCLAW_CLI, join(homedir(), '.openclaw/runtime/node-v26.10.0/node_modules/openclaw/openclaw.mjs'), join(homedir(), 'AppData/Roaming/npm/node_modules/openclaw/openclaw.mjs')].filter(Boolean);
  const cli = choices.find(existsSync);
  if (!cli) throw new Error('未找到 OpenClaw CLI。请设置 OPENCLAW_CLI 为 openclaw.mjs 的绝对路径。');
  return cli;
}
export const AGENTS = { coordinator: 'sports-coordinator', admissions: 'sports-admissions', course: 'sports-course', coach: 'sports-coach' };
