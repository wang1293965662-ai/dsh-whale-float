#!/usr/bin/env node
/**
 * 用量服务.mjs —— 给「小鲸鱼浮窗」实时供数：这一步花了多少钱、命中没命中缓存、入/出多少 token
 *
 * 为什么这么做：
 *   引擎的会话文件 `session.v3.jsonl.zstd` 是**追加写**的（每追加一条就压一帧，一帧一 JSONL 行），
 *   里面每条 `assistant/message` 都带 `data.usage = { inputTokens, cacheReadTokens, outputTokens, reasoningTokens, totalTokens }`。
 *   其中 inputTokens = 缓存未命中的输入，cacheReadTokens = 缓存命中的输入，outputTokens = 输出（含思考）。
 *   → 只要**增量**读这个文件（记住字节偏移，只解新帧），就能拿到真正在变的 token 数，零 token 成本。
 *
 * 计价（DeepSeek 官方中文价目表 · 模型 deepseek-flash · 元/百万 tokens）：
 *   缓存命中输入  空闲 0.02  高峰 0.04
 *   缓存未命中输入 空闲 1     高峰 2
 *   输出          空闲 4     高峰 8
 *   高峰 = 北京时间 周一至周五 9:00-12:00、14:00-18:00（不含法定节假日）；其余含周末/节假日全天都算空闲。
 *   ⚠️ 法定节假日本地判不了 → 节假日按高峰算（会**略微高估**，宁可多算不装少算）。
 *
 * 用法：
 *   node 用量服务.mjs              # 监听 127.0.0.1:8903
 *   node 用量服务.mjs --port 8904
 *
 * 接口：
 *   GET /usage[?since=<事件id>]   实时用量 + 花费（新事件用 newEvents 返回）
 *   GET /health                   活着吗
 *   GET /font/hand.woff2          手写体（给前端 @font-face 用；文件不在就 404，前端自动回退）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number((process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 0)) || 8903;
const HOME = process.env.DSH_HOME || '/data/user/0/com.deepseek.harness.beta/files/payload/dshhome';
const SESS = path.join(HOME, 'sessions');
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '字体');
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/* 价目表：元 / 百万 tokens */
const PRICES = {
  'deepseek-flash': { peak: { hit: 0.04, miss: 2, out: 8 }, off: { hit: 0.02, miss: 1, out: 4 } },
  'deepseek-v4-pro': { peak: { hit: 0.30, miss: 9, out: 27 }, off: { hit: 0.15, miss: 4.5, out: 13.5 } },
};
const MODEL = process.env.DSH_PRICE_MODEL || 'deepseek-flash';

/* 高峰判定：北京时间周一至周五 9-12、14-18（节假日按高峰算 = 保守高估） */
function isPeak(ms) {
  const d = new Date(ms + 8 * 3600e3);           // 直接挪到北京时间再看 UTC 字段
  const w = d.getUTCDay();                        // 0=周日
  if (w === 0 || w === 6) return { peak: false, why: '周末=空闲' };
  const h = d.getUTCHours();
  const peak = (h >= 9 && h < 12) || (h >= 14 && h < 18);
  return { peak, why: peak ? '工作日高峰时段' : '非高峰=空闲' };
}

function priceFor(model, peak) {
  const t = PRICES[model] || PRICES['deepseek-flash'];
  return peak ? t.peak : t.off;
}
function costOf(u, model, peak) {
  const p = priceFor(model, peak);
  return (Number(u.cacheReadTokens || 0) * p.hit + Number(u.inputTokens || 0) * p.miss + Number(u.outputTokens || 0) * p.out) / 1e6;
}

/* ---------------- 会话文件增量读取 ---------------- */
const S = {
  file: null, offset: 0, pending: Buffer.alloc(0), lineBuf: '',
  events: [], nextId: 1,
  session: { miss: 0, hit: 0, out: 0, reasoning: 0, cost: 0, events: 0 },
  total: { miss: 0, hit: 0, out: 0, reasoning: 0, cost: 0, events: 0 },
  last: null, files: 0,
};

function newestSessionFile() {
  let best = null, bestM = -1;
  try {
    for (const ws of fs.readdirSync(SESS, { withFileTypes: true })) {
      if (!ws.isDirectory()) continue;
      const wd = path.join(SESS, ws.name);
      for (const sd of fs.readdirSync(wd, { withFileTypes: true })) {
        if (!sd.isDirectory()) continue;
        const f = path.join(wd, sd.name, 'session.v3.jsonl.zstd');
        try { const m = fs.statSync(f).mtimeMs; if (m > bestM) { bestM = m; best = f; } } catch {}
      }
    }
  } catch {}
  return best;
}

function addEvent(rec) {
  const u = rec.data.usage;
  const ms = Number(rec.time) || Date.now();
  const { peak, why } = isPeak(ms);
  const p = priceFor(MODEL, peak);
  const ev = {
    id: S.nextId++, seq: rec.seq, time: ms, turn: rec.data.turn, step: rec.data.step,
    miss: Number(u.inputTokens || 0), hit: Number(u.cacheReadTokens || 0), out: Number(u.outputTokens || 0),
    reasoning: Number(u.reasoningTokens || 0), total: Number(u.totalTokens || 0),
    cached: Number(u.cacheReadTokens || 0) > 0,
    peak, why, price: p,
  };
  ev.cost = costOf(u, MODEL, peak);
  S.events.push(ev);
  if (S.events.length > 400) S.events.splice(0, S.events.length - 400);
  S.last = ev;
  for (const t of [S.session, S.total]) {
    t.miss += ev.miss; t.hit += ev.hit; t.out += ev.out; t.reasoning += ev.reasoning;
    t.cost = Number((t.cost + ev.cost).toFixed(6)); t.events += 1;
  }
}

function handleLine(line) {
  if (!line || line[0] !== '{') return;
  let rec; try { rec = JSON.parse(line); } catch { return; }
  if (rec.type === 'assistant/message' && rec.data && rec.data.usage) addEvent(rec);
}

function pump() {
  const f = newestSessionFile();
  if (!f) return;
  if (f !== S.file) {                       // 换会话了：重置偏移，会话计数归零（总计数留着）
    S.file = f; S.offset = 0; S.pending = Buffer.alloc(0); S.lineBuf = '';
    S.session = { miss: 0, hit: 0, out: 0, reasoning: 0, cost: 0, events: 0 };
    S.events = []; S.files++;
  }
  let buf;
  try {
    const st = fs.statSync(S.file);
    if (st.size <= S.offset && S.pending.length === 0) return;
    const fd = fs.openSync(S.file, 'r');
    const len = Math.max(0, st.size - S.offset);
    buf = Buffer.alloc(len);
    if (len) fs.readSync(fd, buf, 0, len, S.offset);
    fs.closeSync(fd);
    S.offset = st.size;
  } catch { return; }
  buf = Buffer.concat([S.pending, buf]);
  S.pending = Buffer.alloc(0);
  /* 找出所有帧头，逐帧解；最后一帧可能还没写完 → 留作 pending */
  const cuts = [];
  let i = 0;
  while ((i = buf.indexOf(MAGIC, i)) !== -1) { cuts.push(i); i += 4; }
  if (!cuts.length) { S.pending = buf; return; }
  let consumed = 0;
  for (let k = 0; k < cuts.length; k++) {
    const start = cuts[k];
    const end = k + 1 < cuts.length ? cuts[k + 1] : buf.length;
    const slice = buf.subarray(start, end);
    let txt;
    try { txt = zlib.zstdDecompressSync(slice).toString('utf8'); }
    catch { if (k === cuts.length - 1) { consumed = start; break; } else continue; }   // 半帧 → 留到下次
    consumed = end;
    S.lineBuf += txt;
    let nl;
    while ((nl = S.lineBuf.indexOf('\n')) !== -1) { handleLine(S.lineBuf.slice(0, nl)); S.lineBuf = S.lineBuf.slice(nl + 1); }
  }
  const tail = buf.subarray(consumed);
  S.pending = tail.length ? Buffer.from(tail) : Buffer.alloc(0);
}

/* ---------------- Jev 决策层（懒加载；没有就退化为本地兜底） ---------------- */
let jev = undefined, m = null;
async function getJev() {
  if (jev !== undefined) return jev;
  try {
    m = await import(pathToFileURL(path.join(HOME, 'jev-local/本地判定.mjs')).href);
    jev = m.createDecider({ mode: 'local' });
  } catch (e) { jev = null; }
  return jev;
}

/* ---------------- HTTP ---------------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Cache-Control': 'no-store',
};
function json(res, obj, code = 200) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
  res.end(b);
}
const fmtMB = (n) => Number((n / 1e6).toFixed(6));

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (u.pathname === '/health') return json(res, { ok: true, pid: process.pid, file: S.file, events: S.nextId - 1 });

  if (u.pathname.startsWith('/font/')) {
    const name = path.basename(decodeURIComponent(u.pathname.slice(6)));
    if (!/^[A-Za-z0-9._-]+\.(woff2|ttf|otf)$/.test(name)) return json(res, { ok: false, error: '名字不合法' }, 400);
    try {
      const b = fs.readFileSync(path.join(FONT_DIR, name));
      const type = name.endsWith('.ttf') ? 'font/ttf' : name.endsWith('.otf') ? 'font/otf' : 'font/woff2';
      res.writeHead(200, { ...CORS, 'Content-Type': type, 'Content-Length': b.length, 'Cache-Control': 'public, max-age=86400' });
      return res.end(b);
    } catch { return json(res, { ok: false, error: '没有这个字体文件' }, 404); }
  }

  /* 位置判定：该往哪边展开（信号 = 四个方向的可用空间，交给 Jev 选） */
  if (u.pathname === '/decide/place') {
    const n = (k) => Math.max(0, Number(u.searchParams.get(k) || 0));
    const left = n('left'), right = n('right'), up = n('up'), down = n('down');
    const tot = (left + right + up + down) || 1;
    let side = left < 20 ? 'right' : right < 20 ? 'left' : 'center';
    let v = down < 20 ? 'up' : 'down';
    let by = 'fallback';
    try {
      const j = await getJev();
      if (j) {
        const qs = m.choice({ instructions: '浮窗卡片往哪边横向展开，才不会被屏幕边挡住' },
          { right: '贴左上角向右展开', left: '贴右上角向左展开', center: '在中间，横向居中就好' });
        qs.scores = { right: right / tot, left: left / tot, center: Math.min(left, right) / tot };
        const qv = m.choice({ instructions: '浮窗卡片向下还是向上展开，才不会超出屏幕' },
          { down: '下面有地方，向下展开', up: '下面不够，向上展开' });
        qv.scores = { down: down / tot, up: up / tot };
        const out = await j.ask({ state: { left, right, up, down }, questions: { side: qs, v: qv } });
        side = out.answers.side.choice;
        v = out.answers.v.choice;
        by = 'jev';
      }
    } catch (e) { /* 兜底 */ }
    return json(res, { ok: true, side, v, by, space: { left, right, up, down } });
  }

  /* 气泡参数：该飘多远/多久/多大（交给 Jev 打分，前端再乘随机浮点） */
  if (u.pathname === '/decide/bubble') {
    const rx = Math.max(0, Number(u.searchParams.get('rx') || 60));
    const ry = Math.max(0, Number(u.searchParams.get('ry') || 90));
    let drift = 46, dur = 2600, scale = 1.22, rise = 46, by = 'fallback';
    try {
      const j = await getJev();
      if (j) {
        const sc = m.score({ instructions: '气泡该飘多远的程度' }, ['原地不动', '飘一点点', '飘一小段', '飘得明显', '飘得很远']);
        sc.signals = { roomX: Math.min(1, rx / 90), roomY: Math.min(1, ry / 140) };
        const out = await j.ask({ state: { rx, ry }, questions: { far: sc } });
        const val = out.answers.far.score;                       // 0..1
        drift = Math.round(22 + val * 62);
        rise = Math.round(28 + val * 56);
        dur = Math.round(2200 + val * 900);
        scale = Number((1.1 + val * 0.32).toFixed(3));
        by = 'jev';
      }
    } catch (e) { /* 兜底 */ }
    return json(res, { ok: true, drift, dur, scale, rise, by });
  }

  if (u.pathname === '/preview') {
    const LIST = [["hand.woff2","站酷快乐体","圆润可爱"],["hand-alt.woff2","马善政毛笔楷书","手写毛笔"],["hand-zmx.woff2","志莽行书","随性手写"],["hand-lc.woff2","龙藏","细笔清秀"],["digits.woff2","Pacifico","西文可爱连笔"],["digits-alt.woff2","Caveat","西文马克笔"],["dancing.ttf","Dancing Script","西文优雅连笔"],["greatvibes.woff2","Great Vibes","优雅连笔"],["allura.woff2","Allura","优雅连笔"],["parisienne.woff2","Parisienne","法式优雅"],["italianno.woff2","Italianno","纤细意式"],["tangerine.woff2","Tangerine","纤细花体"],["sacramento.woff2","Sacramento","细笔手写"],["alexbrush.woff2","Alex Brush","毛笔连笔"],["pinyon.woff2","Pinyon Script","古典铜版"],["liujian.woff2","柳建毛草","中文草书·很草"],["xiaowei.woff2","站酷小薇","清雅中文"]];
    const rows = LIST.map(([f, name, desc], i) => `
      <style>@font-face{font-family:F${i};src:url(/font/${f})}</style>
      <div class="row"><div class="hd"><span class="no">${i + 1}</span><span class="nm">${name}</span><span class="ds">${desc}</span></div>
        <div class="big" style="font-family:F${i}">¥0.0157</div>
        <div class="lbl" style="font-family:F${i}">缓存命中 · 入800 出500 · 累计¥0.34</div></div>`).join('');
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>小鲸鱼字体候选</title><style>
body{margin:0;padding:12px;background:linear-gradient(158deg,#fff8fc,#ffe1f0);color:#7a3b57;font-family:-apple-system,'PingFang SC',sans-serif}
h1{font-size:15px;margin:2px 0 4px}
.sub{font-size:11px;color:#bb8ba4;margin-bottom:10px}
.row{background:rgba(255,255,255,.78);border:1px solid rgba(255,168,204,.6);border-radius:18px;padding:7px 12px 9px;margin-bottom:8px}
.hd{display:flex;align-items:baseline;gap:6px}
.no{font-weight:800;color:#fff;background:#ff86b8;border-radius:999px;font-size:11px;padding:1px 7px}
.nm{font-size:12px;font-weight:700;color:#c26a95}
.ds{font-size:10px;color:#c9a0b6;margin-left:auto}
.big{font-size:30px;line-height:1.2;color:#12a06a}
.lbl{font-size:14px;color:#e0353c;margin-top:-2px}
</style></head><body><h1>小鲸鱼浮窗字体候选 · 报个数字给我就换</h1>
<div class="sub">西文连笔体只有拉丁字母和数字，中文那行会回退成系统字（看每行红字就知道差异）</div>${rows}</body></html>`;
    const b = Buffer.from(html);
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': b.length });
    return res.end(b);
  }

  if (u.pathname === '/usage') {
    try { pump(); } catch (e) { /* 读文件出问题也不能把接口打挂 */ }
    const since = Number(u.searchParams.get('since') || 0);
    const newEvents = S.events.filter((e) => e.id > since);
    const nowPeak = isPeak(Date.now());
    return json(res, {
      ok: true,
      model: MODEL,
      file: S.file,
      prices: PRICES[MODEL],
      peak: { now: nowPeak.peak, why: nowPeak.why, rule: '北京时间 周一至周五 9:00-12:00、14:00-18:00 为高峰（节假日按高峰保守算）' },
      session: { ...S.session, missMB: fmtMB(S.session.miss), hitMB: fmtMB(S.session.hit), outMB: fmtMB(S.session.out) },
      total: { ...S.total },
      last: S.last,
      lastId: S.nextId - 1,
      newEvents,
    });
  }
  return json(res, { ok: false, error: '用法：GET /usage[?since=id] · /health · /font/hand.woff2' }, 404);
});
srv.on('error', (e) => { if (e && e.code === 'EADDRINUSE') { console.log('8903 已经有人占了，我退出'); process.exit(0); } console.log('用量服务出错: ' + e.message); process.exit(1); });   /* 重复拉起就安静退出 */
srv.listen(PORT, '127.0.0.1', () => {
  pump();
  console.log('用量服务跑起来了 → http://127.0.0.1:' + PORT + '/usage  (会话: ' + S.file + ')');
});
