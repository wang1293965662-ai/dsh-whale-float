window.__ModuleLoader__.load({
	id: "dsh-whale-float",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/* ══════════════════════════════════════════════════════════════
		   小鲸鱼浮窗 v8 —— 锚定不跳 / 平滑展开 / 跳跃字 / 连发气泡
		   · 球（.mini）永远待在用户放的那个点，root 的 left/top 只有拖动才变
		   · 卡片挂在 root 上，用 data-side / data-v 决定朝哪边长（贴着球长出去）
		   · 展开/收起用 Web Animations API（Jev 选的：时序可控、零依赖、可反向）
		   · 字用逐字延迟弹入；气泡从球心冒出，输入/输出间隔 520ms（Jev 给的数）
		   ══════════════════════════════════════════════════════════════ */
		const ID = "dsh-pet-float", ORB = 56, CARD_W = 212;
		const API = "http://127.0.0.1:8902/balance";
		const ART = "http://127.0.0.1:8902/pet-art?v=6";
		const USAGE = "http://127.0.0.1:8903/usage";
		const D_PLACE = "http://127.0.0.1:8903/decide/place";
		const D_BUBBLE = "http://127.0.0.1:8903/decide/bubble";
		const LS_POS = "dsh-pet-pos", LS_FONT = "dshPetFont2", LS_FONTCN = "dshPetFontCN2";
		const TICK = 30000, UPOLL = 900, GAP = 520;      /* GAP = Jev 判的「气泡连发间隔」 */
		const MARGIN = 6;

		/* ── 手写体（编号见 http://127.0.0.1:8903/preview）────────────── */
		const BASE_ = "http://127.0.0.1:8903/font/";
		const FONTS = ["hand.woff2","hand-alt.woff2","hand-zmx.woff2","hand-lc.woff2","digits.woff2","digits-alt.woff2","dancing.ttf","greatvibes.woff2","allura.woff2","parisienne.woff2","italianno.woff2","tangerine.woff2","sacramento.woff2","alexbrush.woff2","pinyon.woff2","liujian.woff2","xiaowei.woff2"];
		const FN = ["站酷快乐体","马善政毛笔楷书","志莽行书","龙藏","Pacifico","Caveat","Dancing Script","Great Vibes","Allura","Parisienne","Italianno","Tangerine","Sacramento","Alex Brush","Pinyon Script","柳建毛草","站酷小薇"];
		const CN_FONTS = [1, 2, 3, 4, 16, 17];
		let FONT_IDX = 5, CN_IDX = 1, FONT = BASE_ + FONTS[FONT_IDX], FONT_CN = BASE_ + FONTS[CN_IDX];
		function setFontVars() {
			const num = FONT_IDX + 1;
			FONT = BASE_ + FONTS[FONT_IDX];
			FONT_CN = BASE_ + FONTS[CN_FONTS.indexOf(num) >= 0 ? FONT_IDX : Math.max(0, CN_IDX)];
		}
		function applyFont() {
			let st = document.getElementById("dshPetFontStyle");
			if (!st) { st = document.createElement("style"); st.id = "dshPetFontStyle"; document.head.appendChild(st); }
			st.textContent = "@font-face{font-family:PetHand;src:url(" + FONT + ") format('woff2');font-display:swap}"
				+ "@font-face{font-family:PetHandCN;src:url(" + FONT_CN + ") format('woff2');font-display:swap}";
		}
		const H = "PetHand,-apple-system,'PingFang SC',sans-serif", HCN = "PetHandCN,-apple-system,'PingFang SC',sans-serif";

		const CSS = [
			/* 容器：只有拖动才改 left/top */
			"#" + ID + "{position:fixed;right:14px;bottom:110px;z-index:2147483600;",
			"font:500 13px/1.45 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#26262b;",
			"-webkit-tap-highlight-color:transparent;user-select:none;touch-action:none}",
			"#" + ID + " *{box-sizing:border-box;margin:0;padding:0;font:inherit;color:inherit}",
			/* 球（保留原样，用户喜欢） */
			"#" + ID + " .mini{position:relative;width:56px;height:56px;border:1px solid rgba(255,168,204,.75);border-radius:50%;padding:0;overflow:visible;cursor:pointer;",
			"background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.96),rgba(255,216,234,.9) 60%,rgba(255,168,204,.8));",
			"box-shadow:0 6px 18px rgba(226,120,170,.45),0 0 0 4px rgba(255,214,232,.35);animation:dshOrbFloat 3.6s ease-in-out infinite;transform-origin:50% 94%}",
			"@keyframes dshOrbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}",
			"#" + ID + " .mini img{width:56px;height:56px;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(226,120,170,.5))}",
			"#" + ID + " .mini .dot{position:absolute;right:5px;top:5px;width:11px;height:11px;border-radius:50%;background:#63d98f;border:2px solid rgba(255,255,255,.92);animation:dshPetPulse 2.2s infinite}",
			"@keyframes dshPetPulse{0%{box-shadow:0 0 0 0 rgba(255,134,184,.6)}70%{box-shadow:0 0 0 9px rgba(255,134,184,0)}100%{box-shadow:0 0 0 0 rgba(255,134,184,0)}}",
			"#" + ID + " .mini{display:block}",
			/* 卡片：干净、留白、克劳德那种克制感 */
			"#" + ID + " .card{position:absolute;left:0;top:0;display:none;width:" + CARD_W + "px;padding:11px 13px 12px;border-radius:18px;",
			"background:rgba(255,255,255,.975);border:1px solid rgba(22,22,28,.07);",
			"box-shadow:0 20px 46px rgba(28,28,38,.16),0 2px 8px rgba(28,28,38,.06);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}",
			"#" + ID + "[data-side=\"left\"] .card{left:auto;right:0}",
			"#" + ID + "[data-side=\"center\"] .card{margin-left:-" + Math.round((CARD_W - ORB) / 2) + "px}",
			"#" + ID + "[data-v=\"up\"] .card{top:auto;bottom:0}",
			"#" + ID + ":not(.mini) .card{display:block}",          /* 展开：只显示卡片 */
			"#" + ID + ".closing .card{display:block}",              /* 收起动画期间卡片还在 */
			"#" + ID + ":not(.mini) .mini{display:none}",            /* 展开时藏球 */
			"#" + ID + ".closing .mini{display:none}",               /* 收起动画期间先不露球 */
			/* 头部 */
			"#" + ID + " .hd{display:flex;align-items:center;gap:7px;padding:0 1px 8px;border-bottom:1px solid rgba(22,22,28,.07)}",
			"#" + ID + " .ttl{font-size:13px;font-weight:600;letter-spacing:.04em;color:#1d1d22}",
			"#" + ID + " .ttl i{display:inline-block;font-style:normal}",
			"#" + ID + " .sp{flex:1}",
			"#" + ID + " .bt{width:23px;height:23px;border:1px solid rgba(22,22,28,.09);border-radius:9px;background:#fbfbfc;color:#6a6a72;",
			"font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}",
			"#" + ID + " .bt:active{background:#f0f0f3}",
			/* 鲸鱼 */
			"#" + ID + " .fig{display:flex;justify-content:center;align-items:flex-end;height:126px;margin:7px 0 3px}",
			"#" + ID + " .fig img{height:126px;width:auto;object-fit:contain;filter:drop-shadow(0 12px 20px rgba(150,150,200,.22))}",
			/* 余额 */
			"#" + ID + " .amt{display:flex;align-items:baseline;gap:4px;padding:0 1px}",
			"#" + ID + " .cur{font-size:13px;color:#9a9aa2}",
			"#" + ID + " .num{font:400 31px/1.05 " + H + ";letter-spacing:.01em;color:#1d1d22;font-variant-numeric:tabular-nums}",
			"#" + ID + " .bar{height:3px;border-radius:999px;background:rgba(22,22,28,.07);margin:7px 1px 8px;overflow:hidden}",
			"#" + ID + " .bar i{display:block;height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#c9c9d4,#8e8ea0);transition:width 1s linear}",
			"#" + ID + " .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 1px}",
			"#" + ID + " .badge{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid rgba(22,22,28,.08);background:#f7f7f9;color:#6a6a72}",
			"#" + ID + " .badge.off{color:#18845f;border-color:rgba(24,132,95,.25);background:rgba(24,132,95,.07)}",
			"#" + ID + " .badge.on{color:#a86a12;border-color:rgba(168,106,18,.25);background:rgba(168,106,18,.07)}",
			"#" + ID + " .cd{font-size:10.5px;color:#a9a9b2;font-variant-numeric:tabular-nums}",
			/* 用量 */
			"#" + ID + " .use{margin-top:9px;padding-top:9px;border-top:1px solid rgba(22,22,28,.07)}",
			"#" + ID + " .ur{display:flex;align-items:baseline;gap:6px;padding:0 1px}",
			"#" + ID + " .ul{font-size:11px;color:#9a9aa2}",
			"#" + ID + " .uc{font:400 22px/1.1 " + H + ";font-variant-numeric:tabular-nums;color:#1d1d22}",
			"#" + ID + " .uc.hit{color:#18845f}",
			"#" + ID + " .uc.miss{color:#d8443c}",
			"#" + ID + " .chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;padding:0 1px}",
			"#" + ID + " .chip{font-size:10px;color:#8a8a93;padding:3px 7px;border-radius:8px;background:#f7f7f9;border:1px solid rgba(22,22,28,.06);font-variant-numeric:tabular-nums}",
			"#" + ID + " .chip b{color:#4a4a52;font-weight:600}",
			"#" + ID + " .tip{padding:8px 1px 0;font-size:10.5px;color:#b3b3bb}",
			/* 气泡：从球心冒出、摇摆上升、先胀后缩 */
			"#" + ID + " .bub{position:absolute;left:" + ORB / 2 + "px;top:" + ORB / 2 + "px;width:0;height:0;pointer-events:none;z-index:9}",
			"#" + ID + " .bubble{position:absolute;left:0;top:0;display:flex;align-items:baseline;gap:5px;white-space:nowrap;padding:2px 10px 3px;border-radius:999px;",
			"background:rgba(255,255,255,.92);box-shadow:0 6px 18px rgba(28,28,38,.14),inset 0 0 0 1px rgba(22,22,28,.05);",
			"transform:translate(-50%,-50%);animation:dshBub var(--dur,3600ms) cubic-bezier(.22,.75,.3,1) forwards;will-change:transform,opacity}",
			"#" + ID + " .bubble .blab{font:600 11px/1 " + HCN + ";opacity:.85}",
			"#" + ID + " .bubble .bnum{font:400 24px/1 " + H + ";font-variant-numeric:tabular-nums}",
			"#" + ID + " .bubble.hit .blab,#" + ID + " .bubble.hit .bnum{color:#18845f}",
			"#" + ID + " .bubble.miss .blab,#" + ID + " .bubble.miss .bnum{color:#d8443c}",
			"@keyframes dshBub{0%{opacity:0;transform:translate(-50%,-50%) scale(.45,.4)}10%{opacity:1;transform:translate(calc(-50% + var(--dx,0px)*.12),calc(-50% - var(--dy,80px)*.06)) scale(1,1)}",
			"38%{transform:translate(calc(-50% + var(--dx,0px)*.55 + var(--sx,0px)),calc(-50% - var(--dy,80px)*.34)) scale(var(--sc,1.28),calc(var(--sc,1.28)*.96))}",
			"64%{transform:translate(calc(-50% + var(--dx,0px)*.42 - var(--sx,0px)),calc(-50% - var(--dy,80px)*.62)) scale(calc(var(--sc,1.28)*1.02),var(--sc,1.28))}",
			"84%{transform:translate(calc(-50% + var(--dx,0px)*.86),calc(-50% - var(--dy,80px)*.86)) scale(calc(var(--sc,1.28)*.92))}",
			"100%{opacity:0;transform:translate(calc(-50% + var(--dx,0px)),calc(-50% - var(--dy,80px))) scale(.7,.78)}}",
			/* 状态色（沿用） */
			"#" + ID + "[data-st=\"offline\"] .num{color:#b9b9c0}",
			"#" + ID + "[data-st=\"low\"] .num{color:#a86a12}",
		].join("");

		/* 图挂了（后端没起）也别留个裂图：退回内置小鲸鱼 SVG */
		const FALLBACK = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0ff"/><stop offset="1" stop-color="#4c9fe8"/></linearGradient></defs>'
			+ '<path d="M40 118c0-38 32-66 78-66 30 0 52 10 66 26 6 6 12 8 20 6-4 10-12 16-24 18 2 6 2 12 0 18-16 26-46 40-80 40-34 0-60-18-60-42z" fill="url(#b)"/>'
			+ '<circle cx="96" cy="104" r="7" fill="#25324a"/><circle cx="99" cy="101" r="2.4" fill="#fff"/><circle cx="140" cy="104" r="7" fill="#25324a"/><circle cx="143" cy="101" r="2.4" fill="#fff"/>'
			+ '<path d="M108 124c6 6 16 6 22 0" stroke="#25324a" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="82" cy="118" r="7" fill="#ffb3c6" opacity=".75"/><circle cx="154" cy="118" r="7" fill="#ffb3c6" opacity=".75"/></svg>');
		const WHALE = '<img alt="鲸鱼娘" src="' + ART + '" onerror="this.onerror=null;this.src=' + '\'' + FALLBACK + '\'">';

		function boot() {
			/* 只允许一个浮窗：重复注入就把旧的清掉 */
			const dup = document.querySelectorAll("#" + ID);
			for (let i = 0; i < dup.length - 1; i++) { try { dup[i].remove(); } catch (e) {} }
			if (document.getElementById(ID)) return;

			applyFont();
			const style = document.createElement("style");
			style.textContent = CSS;
			document.head.appendChild(style);

			const root = document.createElement("div");
			root.id = ID; root.className = "mini";
			root.setAttribute("data-side", "right"); root.setAttribute("data-v", "down");
			root.innerHTML =
				'<div class="bub"></div>'
				+ '<div class="card">'
				+ '<div class="hd"><span class="ttl"></span><span class="sp"></span>'
				+ '<button class="bt" data-act="font" title="换字体">字</button>'
				+ '<button class="bt" data-act="min" title="收起">–</button>'
				+ '<button class="bt" data-act="ref" title="刷新">⟳</button></div>'
				+ '<div class="fig">' + WHALE + '</div>'
				+ '<div class="bd">'
				+ '<div class="amt"><span class="cur">¥</span><span class="num">--</span></div>'
				+ '<div class="bar"><i></i></div>'
				+ '<div class="row"><span class="badge">…</span><span class="cd"></span></div>'
				+ '<div class="use">'
				+ '<div class="ur"><span class="ul">本次</span><span class="uc">--</span></div>'
				+ '<div class="chips"><span class="chip">输入 <b>--</b></span><span class="chip">输出 <b>--</b></span>'
				+ '<span class="chip">缓存 <b>--</b></span><span class="chip">累计 <b>--</b></span></div>'
				+ '</div>'
				+ '<div class="tip">按住拖我 · 点我说话 · 长按收起</div>'
				+ '</div></div>'
				+ '<button class="mini" title="展开">' + WHALE + '<i class="dot"></i></button>';
			document.body.appendChild(root);

			const card = root.querySelector(".card");
			const num = root.querySelector(".num");
			const badge = root.querySelector(".badge");
			const cd = root.querySelector(".cd");
			const bub = root.querySelector(".bub");
			const uCost = root.querySelector(".uc");
			const cIn = root.querySelector(".chips .chip b");
			const chips = root.querySelectorAll(".chips .chip b");
			const ttl = root.querySelector(".ttl");

			/* 标题逐字（跳跃出现用） */
			const TITLE = "小鲸鱼";
			ttl.innerHTML = TITLE.split("").map((c) => "<i>" + c + "</i>").join("");

			/* ── 位置：root 的 left/top = 球的左上角，只有拖动才改 ── */
			let anchor = null;
			function clampOrb(x, y) {
				const W = window.innerWidth, H2 = window.innerHeight;
				return { x: Math.max(MARGIN, Math.min(W - ORB - MARGIN, x)), y: Math.max(MARGIN, Math.min(H2 - ORB - MARGIN, y)) };
			}
			function setRootPos(x, y) { root.style.left = Math.round(x) + "px"; root.style.top = Math.round(y) + "px"; root.style.right = "auto"; root.style.bottom = "auto"; }
			try { const p = JSON.parse(localStorage.getItem(LS_POS) || "null"); if (p && typeof p.x === "number") anchor = { x: p.x, y: p.y }; } catch (e) {}
			function savePos() { if (!anchor) return; try { localStorage.setItem(LS_POS, JSON.stringify({ x: Math.round(anchor.x), y: Math.round(anchor.y) })); } catch (e) {} }

			/* ── 方向：只挑「整块卡片放得下」的那一边；球的位置不被它改 ── */
			let placeCfg = null;
			async function askPlace(space) {
				try {
					const q = Object.keys(space).map((k) => k + "=" + Math.round(space[k])).join("&");
					const r = await fetch(D_PLACE + "?" + q, { cache: "no-store" });
					const d = await r.json();
					if (d && d.ok) placeCfg = d;
				} catch (e) {}
			}
			function decideDir() {
				const W = window.innerWidth, H2 = window.innerHeight;
				if (!anchor) anchor = clampOrb(W - ORB - 14, H2 - 300);
				anchor = clampOrb(anchor.x, anchor.y);
				const cardH = Math.max(280, card.offsetHeight || 300);
				const ax = anchor.x, ay = anchor.y;
				const fitRight = ax + CARD_W <= W - MARGIN, fitLeft = ax + ORB - CARD_W >= MARGIN;
				const fitCenter = (ax + ORB / 2 - CARD_W / 2 >= MARGIN) && (ax + ORB / 2 + CARD_W / 2 <= W - MARGIN);
				let side = fitCenter ? "center" : (fitRight ? "right" : (fitLeft ? "left" : (W - ax > ax + ORB ? "right" : "left")));
				const fitDown = ay + cardH <= H2 - MARGIN, fitUp = ay + ORB - cardH >= MARGIN;
				let v = fitDown ? "down" : (fitUp ? "up" : (H2 - ay > ay + ORB ? "down" : "up"));
				/* Jev 的建议只在「放得下」时采纳，否则用能放下的那个方向 —— 绝不为放卡片去挪球 */
				if (placeCfg && placeCfg.side && placeCfg.v) {
					const okSide = (placeCfg.side === "center" && fitCenter) || (placeCfg.side === "right" && fitRight) || (placeCfg.side === "left" && fitLeft);
					const okV = (placeCfg.v === "down" && fitDown) || (placeCfg.v === "up" && fitUp);
					if (okSide) side = placeCfg.side;
					if (okV) v = placeCfg.v;
				}
				root.setAttribute("data-side", side);
				root.setAttribute("data-v", v);
				setRootPos(anchor.x, anchor.y);       /* 球永远在锚点 */
				return { side, v };
			}

			/* ── 开 / 合：状态机 + class 驱动显示 + 超时兜底（绝不依赖动画回调才能收起来）── */
			let state = "closed", anim = null, closeTimer = null;
			function originFor(side, v) {
				const x = side === "left" ? "100%" : side === "center" ? "50%" : "0%";
				const y = v === "up" ? "100%" : "0%";
				return x + " " + y;
			}
			function staggerIn() {
				const items = [root.querySelector(".fig")].concat(Array.prototype.slice.call(ttl.querySelectorAll("i")))
					.concat(Array.prototype.slice.call(root.querySelectorAll(".amt,.bar,.row,.use,.tip")));
				items.forEach((el, i) => {
					if (!el || !el.animate) return;
					el.animate(
						[{ opacity: 0, transform: "translateY(9px) scale(.94)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
						{ duration: 340, delay: 150 + i * 55, easing: "cubic-bezier(.22,1.2,.36,1)", fill: "both" }
					);
				});
			}
			function cancelAnim() { if (anim) { try { anim.cancel(); } catch (e) {} anim = null; } }
			function openCard() {
				if (state === "open") return;
				if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
				state = "open";
				root.classList.remove("closing");
				const { side, v } = decideDir();
				card.style.transformOrigin = originFor(side, v);
				root.classList.remove("mini");                 /* ← class 决定显示，见 CSS */
				cancelAnim();
				if (card.animate) anim = card.animate(
					[{ transform: "scale(.16) rotate(-9deg)", opacity: 0 }, { transform: "scale(1.05) rotate(1.5deg)", opacity: 1, offset: .72 }, { transform: "scale(1) rotate(0deg)", opacity: 1 }],
					{ duration: 460, easing: "cubic-bezier(.22,1.1,.36,1)" });
				staggerIn();
				refresh();
			}
			function closeCard() {
				if (state === "closed") return;
				state = "closed";
				const side = root.getAttribute("data-side"), v = root.getAttribute("data-v");
				card.style.transformOrigin = originFor(side, v);
				root.classList.add("closing");                 /* 卡片继续显示、球先不露 */
				cancelAnim();
				if (card.animate) anim = card.animate(
					[{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.2) rotate(-6deg)", opacity: 0 }],
					{ duration: 260, easing: "cubic-bezier(.4,0,.7,.3)", fill: "both" });
				const finish = () => {                            /* 幂等收尾：动画回调 + 超时双保险 */
					if (state !== "closed") return;               /* 已经又被打开了 → 不动作 */
					root.classList.remove("closing");
					root.classList.add("mini");
					cancelAnim();
				};
				if (closeTimer) clearTimeout(closeTimer);
				closeTimer = setTimeout(() => { closeTimer = null; finish(); }, 300);
				if (anim && anim.finished && anim.finished.then) anim.finished.then(finish).catch(finish);
			}

			/* ── 拖动（整卡可拖）＋长按收起 ── */
			const LINES = ["干嘛呀～", "在的。", "余额我盯着呢", "摸摸头可以，别把我弄丢", "快去写代码", "低谷时段记得跑任务", "我是小鲸鱼，不是丑八怪"];
			let sayTimer = null, longPressed = false, pressTimer = null, drag = null;
			function say(t) { sayBox.textContent = t; sayBox.classList.add("on"); clearTimeout(sayTimer); sayTimer = setTimeout(() => sayBox.classList.remove("on"), 2200); }
			const sayBox = root.querySelector(".say") || (function () { const d = document.createElement("div"); d.className = "say"; card.appendChild(d); return d; })();
			function clearPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
			function pt(ev) { const t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev; return { x: t.clientX, y: t.clientY }; }
			function onDown(ev) {
				if (ev.target.closest && ev.target.closest("[data-act]")) return;
				const p = pt(ev), r = root.getBoundingClientRect();
				drag = { ox: p.x - r.left, oy: p.y - r.top, moved: 0 };
				clearPress();
				pressTimer = setTimeout(() => { pressTimer = null; longPressed = true; if (state === "open") closeCard(); else openCard(); say(state === "open" ? "我回来啦～" : "那我缩起来啦～"); }, 620);
			}
			function onMove(ev) {
				if (!drag) return;
				const p = pt(ev), r = root.getBoundingClientRect();
				drag.moved = 1; clearPress();
				anchor = clampOrb(p.x - drag.ox, p.y - drag.oy);
				setRootPos(anchor.x, anchor.y);
				if (ev.cancelable) ev.preventDefault();
				ev.stopPropagation();
			}
			function onUp(ev) { clearPress(); if (drag && drag.moved) { savePos(); if (state === "closed") decideDir(); if (ev && ev.stopPropagation) ev.stopPropagation(); } drag = null; }
			root.addEventListener("touchstart", onDown, { passive: true });
			root.addEventListener("touchmove", onMove, { passive: false });
			root.addEventListener("touchend", onUp);
			root.addEventListener("touchcancel", onUp);
			root.addEventListener("mousedown", onDown);
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			window.addEventListener("resize", () => decideDir());

			/* ── 点击：球 → 展开；卡内按钮 ── */
			root.addEventListener("click", (ev) => {
				ev.stopPropagation();
				if (longPressed) { longPressed = false; return; }
				const act = ev.target.closest("[data-act]");
				if (act) {
					const a = act.getAttribute("data-act");
					if (a === "min") { closeCard(); return; }
					if (a === "ref") { refresh(); say("刷新好啦～"); return; }
					if (a === "font") {
						FONT_IDX = (FONT_IDX + 1) % FONTS.length;
						try { localStorage.setItem(LS_FONT, String(FONT_IDX + 1)); } catch (e) {}
						setFontVars(); applyFont();
						say("字体 " + (FONT_IDX + 1) + " · " + FN[FONT_IDX]);
						return;
					}
				}
				if (ev.target.closest(".mini")) { openCard(); say(LINES[Math.floor(Math.random() * LINES.length)]); return; }
			});

			/* ── 余额 ── */
			let offline = false, lowBalance = false, sinceMs = null, untilMs = null;
			function setBadge(p) {
				if (!p) { badge.textContent = "—"; badge.className = "badge"; cd.textContent = ""; untilMs = null; return; }
				badge.textContent = (p.offPeak ? "空闲时段" : "高峰时段");
				badge.className = "badge " + (p.offPeak ? "off" : "on");
				untilMs = p.until ? Date.parse(p.until) : null;
				tick();
			}
			function tick() {
				const barEl = root.querySelector(".bar i");
				if (barEl && untilMs && sinceMs) {
					const total = untilMs - sinceMs;
					barEl.style.width = (Math.max(0, Math.min(1, (Date.now() - sinceMs) / (total || 1))) * 100).toFixed(1) + "%";
				} else if (barEl) barEl.style.width = "0%";
				if (!untilMs) { cd.textContent = ""; return; }
				const left = untilMs - Date.now();
				if (left <= 0) { cd.textContent = "正在切换…"; return; }
				cd.textContent = "距切换 " + (Math.floor(left / 3600000) ? Math.floor(left / 3600000) + "时" : "") + Math.floor((left % 3600000) / 60000) + "分" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0") + "秒";
			}
			async function refresh() {
				try {
					const r = await fetch(API, { cache: "no-store" });
					const d = await r.json();
					if (!d.ok) throw new Error(d.error || "查询失败");
					num.textContent = Number(d.total || 0).toFixed(2);
					offline = false; lowBalance = Number(d.total || 0) < 5;
					sinceMs = d.peak && d.peak.since ? Date.parse(d.peak.since) : null;
					setBadge(d.peak);
				} catch (e) {
					offline = true; num.textContent = "离线"; cd.textContent = "后端 8902 没响应"; untilMs = null;
					badge.textContent = "—"; badge.className = "badge";
				}
				syncState();
			}

			/* ── 用量气泡：从球心冒出，输入/输出间隔 520ms（Jev） ── */
			function money(v) { const n = Number(v || 0); if (!(n > 0)) return "0"; if (n < 0.001) return n.toFixed(6); if (n < 0.1) return n.toFixed(4); return n.toFixed(2); }
			function kfmt(n) { n = Number(n || 0); if (n < 1000) return String(n); if (n < 1e6) return (n / 1000).toFixed(1) + "k"; return (n / 1e6).toFixed(2) + "M"; }
			let bubCfg = null;
			async function loadBubCfg() {
				try {
					const rx = Math.max(30, Math.round((window.innerWidth - 120) / 2));
					const r = await fetch(D_BUBBLE + "?rx=" + rx + "&ry=120", { cache: "no-store" });
					const d = await r.json(); if (d && d.ok) bubCfg = d;
				} catch (e) {}
			}
			function spawnBubble(item) {
				if (!bub) return;
				const el = document.createElement("div");
				el.className = "bubble " + (item.hit ? "hit" : "miss");
				el.innerHTML = '<span class="blab">' + item.tag + '</span><span class="bnum">¥' + money(item.cost) + '</span>';
				const rect = root.getBoundingClientRect();
				const roomX = Math.max(30, Math.min(96, (window.innerWidth - rect.width) / 2 + 34));
				const drift = (bubCfg && bubCfg.drift ? bubCfg.drift : 60) * (0.55 + 0.45 * Math.random());
				const dur = (bubCfg && bubCfg.dur ? bubCfg.dur : 3400) * (0.95 + 0.35 * Math.random());
				const dy = (bubCfg && bubCfg.rise ? bubCfg.rise : 70) * (0.95 + 0.5 * Math.random());
				const dx = Math.max(-roomX, Math.min(roomX, (Math.random() * 2 - 1) * drift));
				el.style.setProperty("--dx", dx.toFixed(1) + "px");
				el.style.setProperty("--dy", Math.round(dy) + "px");
				el.style.setProperty("--sc", ((bubCfg && bubCfg.scale ? bubCfg.scale : 1.28) * (0.94 + 0.12 * Math.random())).toFixed(3));
				el.style.setProperty("--sx", Math.round((Math.random() * 2 - 1) * 16) + "px");
				el.style.setProperty("--dur", Math.round(dur) + "ms");
				bub.appendChild(el);
				setTimeout(() => { try { el.remove(); } catch (e) {} }, Math.round(dur) + 300);
			}
			function spawnForEvent(ev) {
				const p = ev.price || {};
				const items = [];
				if (ev.hit > 0 || ev.miss > 0) items.push({ cost: (ev.hit * (p.hit || 0) + ev.miss * (p.miss || 0)) / 1e6, hit: !!ev.cached, tag: "输入" });
				if (ev.out > 0) items.push({ cost: (ev.out * (p.out || 0)) / 1e6, hit: !!ev.cached, tag: "输出" });
				items.forEach((it, i) => setTimeout(() => spawnBubble(it), i * GAP));   /* 连发，不叠在一起 */
			}
			let lastId = 0, ready = false;
			function renderUsage(d) {
				const s = d.session || {}, ev = d.last;
				if (ev) {
					const hit = !!ev.cached;
					uCost.textContent = "¥" + money(ev.cost);
					uCost.className = "uc " + (hit ? "hit" : "miss");
					chips[0].textContent = kfmt(ev.miss); chips[1].textContent = kfmt(ev.out);
					chips[2].textContent = kfmt(ev.hit); chips[3].textContent = "¥" + money(s.cost);
				}
			}
			async function pollUsage() {
				try {
					const r = await fetch(USAGE + "?since=" + lastId, { cache: "no-store" });
					const d = await r.json();
					if (!d.ok) throw new Error("bad");
					if (!ready) { ready = true; lastId = d.lastId || 0; renderUsage(d); return; }
					for (const ev of (d.newEvents || [])) { if (Number(ev.id) <= lastId) continue; lastId = Number(ev.id); spawnForEvent(ev); }
					renderUsage(d);
				} catch (e) { if (uCost) uCost.textContent = "--"; }
			}

			/* ── 状态感（干活中 / 等你回答）── */
			let stNow = "";
			function syncState() {
				let k = "idle";
				if (offline) k = "offline";
				else if (lowBalance) k = "low";
				else { try { if (document.querySelector('[data-state="running"]') || document.querySelector('button[aria-label*="停止"]')) k = "working"; } catch (e) {} }
				if (k !== stNow) { stNow = k; root.setAttribute("data-st", k); }
			}

			decideDir();
			setInterval(tick, 1000);
			setInterval(() => { refresh(); syncState(); }, TICK);
			setInterval(pollUsage, UPOLL);
			refresh(); pollUsage(); loadBubCfg();
		}

		function apply() {
			const go = () => { try { boot(); } catch (e) { console.warn("[dsh-client-ui-pet]", e); } };
			if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
			else go();
		}

		exports.apply = apply;
		return module.exports;
	}
});
