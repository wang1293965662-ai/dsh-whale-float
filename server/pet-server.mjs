// 鲸鱼娘桌宠后端：提供 /pet 页面 + /balance 实时余额接口
import http from 'node:http';
import fs from 'node:fs';

const PORT = 8902;
const CRED = process.env.DSH_HOME + '/.credentials.yaml';

function getKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const t = fs.readFileSync(CRED, 'utf8');
  const m = t.match(/DEEPSEEK_API_KEY:\s*(\S+)/);
  if (!m) throw new Error('no key');
  return m[1];
}

let cache = { at: 0, data: null };

async function balance() {
  if (Date.now() - cache.at < 20000 && cache.data) return cache.data;
  const r = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: 'Bearer ' + getKey() },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const cny = (j.balance_infos || []).find((b) => b.currency === 'CNY') || (j.balance_infos || [])[0] || {};
  const data = {
    ok: true,
    available: j.is_available,
    currency: cny.currency || 'CNY',
    total: parseFloat(cny.total_balance || '0'),
    topped: parseFloat(cny.topped_up_balance || '0'),
    granted: parseFloat(cny.granted_balance || '0'),
    at: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}

/* ───────── TTS（语音合成）— 给「视频通话」用 ─────────
 * 通道优先级：MiniMax（音色最好：御姐/成熟/少女都有）→ GLM cogtts（国内直连兜底）
 * 凭证写在 DSH_HOME/.credentials.yaml：MINIMAX_API_KEY / MINIMAX_GROUP_ID / GLM_API_KEY
 * 没 key 时 /tts?probe=1 返回 ok:false → 前端自动退回浏览器自带的 speechSynthesis。
 */
function cred(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const t = fs.readFileSync(CRED, 'utf8');
    const m = t.match(new RegExp('^\\s*' + name + '\\s*:\\s*(\\S+)', 'm'));
    if (m) return m[1];
  } catch { /* 没凭证文件 */ }
  return '';
}
const TTS_PERSONA = {
  gentle: { minimax: 'female-chengshu', glm: 'tongtong', emotion: 'neutral', label: '知心大姐姐(未选中，备胎)', spd: 5 },
  yujie: { minimax: 'female-yujie', glm: 'chuichu', emotion: 'happy', label: '御姐', spd: 4 },   // ✅ 用户选定 2026-09-19
  loli: { minimax: 'female-shaonv', glm: 'tongtong', emotion: 'happy', label: '小萝莉', spd: 6 },   // ✅ 用户选定 2026-09-19
};
function ttsChain() {
  const c = [];
  if (cred('MINIMAX_API_KEY')) c.push('minimax');
  if (cred('GLM_API_KEY')) c.push('glm');
  c.push('baidu');   // 免 key：百度翻译的 TTS 接口（中文女声，可调语速）
  return c;
}
function ttsProvider() { return ttsChain().join(' → '); }
const ttsCache = new Map();
async function tts(text, persona, voiceOverride) {
  const p = TTS_PERSONA[persona] || TTS_PERSONA.gentle;
  const ckey = persona + '|' + text;
  const hit = ttsCache.get(ckey);
  if (hit) return hit;
  let lastErr = '没有可用通道';
  for (const prov of ttsChain()) {
    try {
      const out = await ttsOne(prov, text, p, voiceOverride);
      if (ttsCache.size > 40) ttsCache.clear();
      ttsCache.set(ckey, out);
      return out;
    } catch (e) { lastErr = prov + ': ' + e.message; }
  }
  throw new Error(lastErr);
}

async function ttsOne(prov, text, p, voiceOverride) {
  let buf; let type;
  if (prov === 'minimax') {
    const gid = cred('MINIMAX_GROUP_ID');
    const r = await fetch('https://api.minimax.chat/v1/t2a_v2' + (gid ? '?GroupId=' + gid : ''), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cred('MINIMAX_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cred('MINIMAX_TTS_MODEL') || 'speech-02-hd',
        text,
        stream: false,
        voice_setting: { voice_id: voiceOverride || p.minimax, speed: 1.0, vol: 1.0, pitch: 0, emotion: p.emotion },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error('HTTP ' + r.status);
    if (j.base_resp && j.base_resp.status_code !== 0) throw new Error(j.base_resp.status_code + ': ' + (j.base_resp.status_msg || ''));
    const hex = j.data && j.data.audio;
    if (!hex) throw new Error('没返回音频');
    buf = Buffer.from(hex, 'hex'); type = 'audio/mpeg';
  } else if (prov === 'glm') {
    const r = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/speech', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cred('GLM_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cred('GLM_TTS_MODEL') || 'cogtts', input: text, voice: voiceOverride || p.glm, response_format: 'wav' }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 100));
    buf = Buffer.from(await r.arrayBuffer()); type = 'audio/wav';
  } else {
    // 百度：零 key。spd 1~7 是有效区间（实测 8 会返回空）
    const spd = Math.max(1, Math.min(7, Number(p.spd) || 5));
    const u = 'https://fanyi.baidu.com/gettts?lan=zh&source=web&spd=' + spd + '&text=' + encodeURIComponent(text);
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/124.0 Mobile Safari/537.36' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 800) throw new Error('返回太小（' + buf.length + ' 字节，可能被限流）');
    type = 'audio/mpeg';
  }
  return { buf, type };
}

/* ───────── 峰谷计价（一律按北京时间算） ─────────
 * 依据（实测查证，别用旧政策）：
 *   2026-08-17 起执行峰谷定价：闲时价 = 高峰价的一半
 *     高峰时段 = 周一~周五 北京时间 09:00–12:00、14:00–18:00
 *     其余时段 = 低谷价
 *   2026-08-23 起：周六/周日 全天不再区分峰谷，统一按低谷价
 * ⚠ 去年那个「00:30–08:30」是旧政策，已失效。
 * 本机时区不是北京，所以自己按 UTC+8 偏移算，不依赖系统时区。
 */
const BJ_OFFSET_MS = 8 * 3600 * 1000;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const pad2 = (n) => String(n).padStart(2, '0');

function beijingOf(date) {
  const d = new Date(date.getTime() + BJ_OFFSET_MS);
  return {
    weekday: d.getUTCDay(),
    weekdayText: WEEKDAYS[d.getUTCDay()],
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    clock: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()),
    dateText: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()),
  };
}

/** 该时刻是否按低谷价计费。 */
function isOffPeak(date) {
  const bj = beijingOf(date);
  if (bj.weekday === 0 || bj.weekday === 6) return true;              // 周末全天低谷
  const m = bj.minutes;
  const peak = (m >= 9 * 60 && m < 12 * 60) || (m >= 14 * 60 && m < 18 * 60);
  return !peak;
}

/** 往后逐分钟找状态翻转点（最多 3 天）—— 笨但绝不会算错时区。 */
function nextSwitch(date) {
  const cur = isOffPeak(date);
  for (let i = 1; i <= 3 * 24 * 60; i += 1) {
    const t = new Date(date.getTime() + i * 60000);
    if (isOffPeak(t) !== cur) return t;
  }
  return null;
}

function prevSwitch(date) {
  const cur = isOffPeak(date);
  for (let i = 1; i <= 3 * 24 * 60; i += 1) {
    const t = new Date(date.getTime() - i * 60000);
    if (isOffPeak(t) !== cur) return t;
  }
  return null;
}

function peakInfo(now = new Date()) {
  const bj = beijingOf(now);
  const off = isOffPeak(now);
  const weekend = bj.weekday === 0 || bj.weekday === 6;
  const sw = nextSwitch(now);
  const swPrev = prevSwitch(now);
  return {
    offPeak: off,
    label: off ? '低谷价' : '高峰价',
    priceNote: off ? '半价计费' : '全价计费',
    reason: weekend
      ? '周末全天按低谷价'
      : off
        ? '工作日非高峰时段'
        : '工作日高峰 09:00–12:00 / 14:00–18:00',
    bjTime: bj.dateText + ' ' + bj.clock + ' ' + bj.weekdayText,
    bjClock: bj.clock,
    since: swPrev ? swPrev.toISOString() : null,
    until: sw ? sw.toISOString() : null,
    untilLabel: off ? '低谷结束' : '高峰结束',
  };
}

const HTML = fs.readFileSync(new URL('./pet.html', import.meta.url), 'utf8');
// 鲸鱼娘立绘（Official/pet-art.jpg，网上下载后本地缓存）：浮窗图标用
let ART = null;
function readArt() {
  const cands = [
    new URL("./pet-art.png", import.meta.url),
    new URL("./pet-art.jpg", import.meta.url),
    "/sdcard/工作区★公共/工具/pet-art.png",
    "/sdcard/工作区★公共/工具/pet-art.jpg",
    (process.env.DSH_HOME || "") + "/../pet-art.png",
  ];
  for (const c of cands) { try { return fs.readFileSync(c); } catch (e) {} }
  return null;
}

http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/pet') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }
  if (url === '/balance') {
    try {
      const d = await balance();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ...d, peak: peakInfo() }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }
  if (url === '/pet.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }
  // 语音合成：/tts?probe=1 探活；/tts?text=...&persona=gentle|yujie|loli[&voice=]
  if (url === '/tts') {
    const q = new URL(req.url || '/', 'http://127.0.0.1').searchParams;
    if (q.get('probe') || !q.get('text')) {
      const prov = ttsProvider();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: !!prov, provider: prov || null, personas: TTS_PERSONA }));
    }
    try {
      const { buf, type } = await tts(String(q.get('text')).slice(0, 300), q.get('persona') || 'gentle', q.get('voice') || '');
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(buf);
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }
  if (url === '/pet-art') {
    ART = readArt();   /* 每次现读，图补上就立刻生效 */
    if (!ART) { res.writeHead(404); return res.end('no art'); }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
    return res.end(ART);
  }
  // ── 开发用（浮窗测试台）：不参与正式功能
  if (url === '/pet-test' || url === '/pet-client.js') {
    const f = url === '/pet-test'
      ? new URL('./产出/pet-test.html', import.meta.url)
      : new URL('./产出/dsh-client-ui-pet/lib/client.js', import.meta.url);
    try {
      const buf = fs.readFileSync(f);
      res.writeHead(200, { 'Content-Type': url === '/pet-test' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(buf);
    } catch { res.writeHead(404); return res.end('no dev file'); }
  }
  // 动画库（真实工具，不手写动画引擎）
  if (url === '/anime.js') {
    try {
      const b = fs.readFileSync(new URL('./anime.min.js', import.meta.url));
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(b);
    } catch { res.writeHead(404); return res.end('no anime'); }
  }
  res.writeHead(404); res.end('not found');
}).listen(PORT, '127.0.0.1', () => console.log('🐋 鲸鱼娘服务: http://127.0.0.1:' + PORT + '/pet'));
