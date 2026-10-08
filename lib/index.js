// host 半边：① 出现在 host 树里 ② 引擎启动 4 秒后把两个本地后端拉起来
//   · pet-lite.mjs   127.0.0.1:8902  余额 + 鲸鱼图（自包含，图兜底用内置 SVG）
//   · 用量服务.mjs    127.0.0.1:8903  实时花销（增量读会话文件，零 token）
// 全都 try/catch + 延迟：起不来只影响浮窗观感，绝不影响引擎。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '../server');
const PET = path.resolve(SERVER, 'pet');   /* 原始 pet-server + pet-art.png（从官方备份恢复） */

function findHome() {
  try {
    const env = process.env.DSH_HOME;
    if (env && fs.existsSync(path.join(env, 'sessions'))) return env;
    let d = HERE;
    for (let i = 0; i < 6; i++) { d = path.resolve(d, '..'); if (fs.existsSync(path.join(d, 'sessions'))) return d; }
  } catch (e) {}
  return null;
}
function startPet() {
  try {
    const f = path.join(PET, 'pet-server.mjs');
    if (!fs.existsSync(f)) return;
    const home = findHome();
    const child = spawn(process.execPath, [f], { cwd: PET, env: { ...process.env, ...(home ? { DSH_HOME: home } : {}) }, detached: true, stdio: 'ignore' });
    if (child && typeof child.unref === 'function') child.unref();
  } catch (e) {}
}
function start(file, port) {
  try {
    const f = path.join(SERVER, file);
    if (!fs.existsSync(f)) return;
    const home = findHome();
    const child = spawn(process.execPath, [f], {
      cwd: SERVER,
      env: { ...process.env, ...(home ? { DSH_HOME: home } : {}) },
      detached: true, stdio: 'ignore',
    });
    if (child && typeof child.unref === 'function') child.unref();
  } catch (e) {}
}
export function apply(ctx) {
  try {
    const t = setTimeout(() => { try { startPet(); start('用量服务.mjs', 8903); } catch (e) {} }, 4000);
    if (t && typeof t.unref === 'function') t.unref();
  } catch (e) {}
}
