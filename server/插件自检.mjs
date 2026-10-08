#!/usr/bin/env node
/**
 * 插件自检.mjs —— 不开浏览器、不动主屏，用 DOM 桩把「小鲸鱼浮窗」真跑一遍
 * 检：① 加载不炸 + 只能有一个浮窗 ② 字体 ③ 展开/收起时球的位置一寸不动（不乱跳）
 *     ④ 气泡：输入/输出**错开**出现、标签在数字左、颜色区分命中/未命中
 */
import fs from 'node:fs';
const CLI = process.env.PET_CLIENT || '/sdcard/工作区Lite/dsh-whale-float/lib/client.js';
const TMP = '/data/user/0/com.deepseek.harness.beta/files/Lite/_selftest.mjs';
fs.copyFileSync(CLI, TMP);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class El {
  constructor(t) { this.tagName = t; this.style = { _v: {}, setProperty(k, v) { this._v[k] = v; } }; this.children = []; this._html = ''; this._sel = new Map(); this._all = new Map(); this.textContent = ''; this.className = ''; this.parentNode = null; this._attrs = {}; this._h = {}; this.offsetHeight = 240; }
  set innerHTML(v) { this._html = v; } get innerHTML() { return this._html; }
  setAttribute(k, v) { this._attrs[k] = v; } getAttribute(k) { return this._attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) doc._byId[c.id] = c; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); else if (this.id) delete doc._byId[this.id]; }
  addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); }
  closest() { return null; }
  animate() { return globalThis.__animNever ? { finished: new Promise(() => {}), cancel() {} } : { finished: Promise.resolve(), cancel() {} }; }
  getAnimations() { return []; }
  getBoundingClientRect() { const l = parseFloat(this.style.left), t = parseFloat(this.style.top), mini = this.className.indexOf('mini') >= 0; return { left: isNaN(l) ? 330 : l, top: isNaN(t) ? 500 : t, width: mini ? 56 : 212, height: mini ? 56 : 240 }; }
  querySelector(s) {
    if (s === ".fig img" || s === ".mini img") { if (!this._whale) this._whale = new El("img"); return this._whale; }
    if (!this._sel.has(s)) this._sel.set(s, new El("div"));
    return this._sel.get(s);
  }
  querySelectorAll(s) {
    if (s === ".chips .chip b") return [new El("b"), new El("b"), new El("b"), new El("b")];
    if (s === ".ttl i") return [new El("i"), new El("i"), new El("i")];
    if (!this._all.has(s)) this._all.set(s, []);
    return this._all.get(s);
  }
  get classList() { const s = this; return { add(c) { if (!s.className.includes(c)) s.className = (s.className + ' ' + c).trim(); }, remove(c) { s.className = s.className.replace(c, '').trim(); }, toggle(c) { this.contains(c) ? this.remove(c) : this.add(c); }, contains: (c) => s.className.includes(c) }; }
}
const doc = {
  _byId: {}, readyState: 'complete',
  createElement: (t) => new El(t),
  getElementById: (i) => doc._byId[i] || null,
  querySelector: () => null,
  querySelectorAll: (s) => (s === '#' + 'dsh-pet-float' ? Object.keys(doc._byId).filter((k) => k === 'dsh-pet-float').map((k) => doc._byId[k]) : []),
  addEventListener() {}, head: new El('head'), body: new El('body'),
};
globalThis.document = doc;
globalThis.window = { __ModuleLoader__: { load: (o) => { globalThis.__cap = o; } }, innerWidth: 400, innerHeight: 800, _h: {}, addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); } };
globalThis.localStorage = { _d: { 'dsh-pet-pos': JSON.stringify({ x: 100, y: 700 }) }, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
globalThis.MutationObserver = class { observe() {} };
let poll = 0;
globalThis.fetch = async (u) => {
  const U = String(u), J = (o) => ({ json: async () => o });
  if (U.includes(':8902')) return J({ ok: true, total: 11.01, available: true, peak: { offPeak: false, label: '高峰' } });
  if (U.includes('/decide/place')) return J({ ok: true, side: 'right', v: 'down' });
  if (U.includes('/decide/bubble')) return J({ ok: true, drift: 60, dur: 3400, scale: 1.28, rise: 80 });
  poll++;
  if (poll === 1) return J({ ok: true, lastId: 0, session: {}, last: null, newEvents: [] });
  if (poll === 2) return J({ ok: true, lastId: 9, session: { cost: 0.44 }, last: { id: 9, cached: true, hit: 12000, miss: 40, out: 300, cost: 0.001, price: { hit: 0.04, miss: 2, out: 8 } }, newEvents: [{ id: 9, cached: true, hit: 12000, miss: 40, out: 300, cost: 0.001, price: { hit: 0.04, miss: 2, out: 8 } }] });
  return J({ ok: true, lastId: 9, session: { cost: 0.44 }, last: null, newEvents: [] });
};

await import('file://' + TMP);
globalThis.__cap.factory(() => { throw new Error('no require'); }).apply();
await sleep(200);
globalThis.__cap.factory(() => { throw new Error('no require'); }).apply();   /* 模拟重复注入 */
await sleep(200);
let pass = 0, fail = 0;
const chk = (n, ok, extra = '') => { console.log((ok ? '✅ ' : '❌ ') + n + (extra ? '  ' + extra : '')); ok ? pass++ : fail++; };
const floats = doc.body.children.filter((c) => c.id === 'dsh-pet-float');
const root = floats[0];
chk('只能有一个浮窗（重复注入被去重）', floats.length === 1, '数量 ' + floats.length);
const st = doc._byId['dshPetFontStyle'] || { textContent: '' };
const num = (st.textContent.match(/PetHand;src:url\(([^)]+)\)/) || [])[1] || '';
const cn = (st.textContent.match(/PetHandCN;src:url\(([^)]+)\)/) || [])[1] || '';
chk('字体：数字 + 中文都注入', !!num && !!cn, num.split('/').pop() + ' / ' + cn.split('/').pop());
const click = (sel, act) => root._h.click[0]({ target: { closest: (s) => (s === sel ? (act ? { getAttribute: () => act } : {}) : null) }, stopPropagation() {} });

/* ① 先采样气泡：新用量在第 2 次轮询（~0.9s）到，之后每 60ms 记一次数量 → 应看到「1 颗 → 2 颗」 */
const bub = root._sel.get(".bub");
const seen = [];
const t0ms = Date.now();
while (Date.now() - t0ms < 2400) { seen.push(bub.children.length); await sleep(60); }
const uniq = seen.filter((v, i, arr) => v !== arr[i - 1]);
const firstOne = seen.indexOf(1), firstTwo = seen.indexOf(2, firstOne + 1);
chk("气泡连发：先一颗、隔一会儿再来第二颗（不是一起弹）", firstOne >= 0 && firstTwo > firstOne, "数量序列 " + uniq.join(" → "));
const kids = bub.children;
chk("标签在数字左边、不写命中文字", kids.length === 2 && kids.every((k) => k.innerHTML.indexOf('<span class="blab">') === 0) && kids.map((k) => k.innerHTML).join("").indexOf("命中") < 0, kids[0] ? kids[0].innerHTML : "");
chk("命中=绿（hit 类）+ 慢慢飘", kids.length === 2 && kids.every((k) => k.className.indexOf("hit") >= 0 && parseInt(k.style._v["--dur"]) > 2800), kids.map((k) => k.className).join(" , "));

/* ② 再验位置：展开/收起，球必须一寸不动 */
const home = { l: root.style.left, t: root.style.top };
click(".mini"); await sleep(220);
const open = { l: root.style.left, t: root.style.top, side: root.getAttribute("data-side"), v: root.getAttribute("data-v") };
chk("展开：球的位置一寸没动（不乱跳）", open.l === home.l && open.t === home.t && !root.classList.contains("mini"), home.l + "," + home.t + " → " + open.l + "," + open.t);
chk("展开：定了方向（贴边换边）", !!open.side && !!open.v, open.side + "/" + open.v);
click("[data-act]", "min"); await sleep(220);
chk("收起：回到同一个点", root.style.left === home.l && root.style.top === home.t && root.classList.contains("mini"), root.style.left + "," + root.style.top);

/* ③ 开合健壮性：收起不能靠动画回调才能完成、不能残留状态、不能多出浮窗 */
const sideB = root.getAttribute("data-side"), vB = root.getAttribute("data-v");
globalThis.__animNever = true;                    /* 模拟「动画回调永远不来」——就是他遇到的关不掉 */
click(".mini"); await sleep(120);
click("[data-act]", "min"); await sleep(420);
chk("动画回调不来也能收起（超时兜底）", root.classList.contains("mini") && !root.classList.contains("closing"), "class=" + root.className);
globalThis.__animNever = false;
for (let i = 0; i < 5; i++) { click(".mini"); await sleep(120); click("[data-act]", "min"); await sleep(380); }
chk("连开连关 5 轮：状态干净、只有一个浮窗", root.classList.contains("mini") && !root.classList.contains("closing") && doc.body.children.filter((c) => c.id === "dsh-pet-float").length === 1, "class=" + root.className);
chk("收起过程没有乱改方向", sideB === root.getAttribute("data-side") && vB === root.getAttribute("data-v"), root.getAttribute("data-side") + "/" + root.getAttribute("data-v"));
click(".mini"); await sleep(300);
chk("再打开：卡片在、球藏起来（class 驱动）", !root.classList.contains("mini") && !root.classList.contains("closing"), "class=" + root.className);
click("[data-act]", "min"); await sleep(380);
try { fs.rmSync(TMP, { force: true }); } catch (e) {}
console.log("\n通过 " + pass + " · 失败 " + fail);
process.exit(fail ? 1 : 0);
