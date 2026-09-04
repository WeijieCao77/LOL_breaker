/* ================= 声音 =================
   2026-09-01 玩家要的：按键反馈音 + 很轻的背景音乐 + 右下角开关浮窗。
   2026-09-04 玩家定的：背景音乐不再合成，换成外置音频文件（历年 S 赛主题曲，
   S12–S16 各一首），赛季一换就换歌。曲子文件不进 career.html，
   放 demo/bgm/ 下按名字读（见 demo/bgm/README.md）。

   约束与取舍：
   · 发行物是单文件，音效仍用 WebAudio 现场合成——零资产、零请求，
     Hextech 的「叮」本来就该是合成器味。
   · 背景音乐走 <audio>：路径用相对的 bgm/…（Toy 跑在 /toy/<slug>/ 子路径，
     绝对路径会 404）；preload=none，没点 ♪ 一个字节都不下。
   · 音效不是每个按钮都响：只挂三类——花行动点的动作卡（轻嗒）、
     推进周期的主按钮（双音确认）、庆祝弹窗出现的瞬间（三音琶音）。
     标签栏、小工具按钮一概不响，响多了就是噪音。
   · 浏览器要求用户先有手势才准出声：AudioContext 和 audio.play() 都在点击里做。
   · 开关存 localStorage（不进存档）——音量偏好是设备的事，不是生涯的事。 */

const AUDIO_KEY = "pjz_audio";
const AU = {
  ctx: null, master: null,
  sfx: true, bgm: false,          // 音效默认开；音乐默认关，想听的自己点 ♪（玩家定的）
  el: null,                       // <audio> 元素
  order: [], oi: -1,              // 洗好的播放顺序、当前走到第几个
  playing: false,                 // 是否正在放（给浮窗的播放/暂停按钮看）
  missing: {}, panelOpen: false   // 已知缺失的曲目下标；浮窗是否展开
};

function audioPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    // bgm 用 === true：没存过偏好的一律当「关」，和上面的默认值一致
    if (raw) { const p = JSON.parse(raw); AU.sfx = p.sfx !== false; AU.bgm = p.bgm === true; }
  } catch (e) {}
}
function audioSave() {
  try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ sfx: AU.sfx, bgm: AU.bgm })); } catch (e) {}
}

/* 上下文只建一次，且必须在用户手势里建（自动播放策略）。只给音效用 */
function audioCtx() {
  if (AU.ctx) { if (AU.ctx.state === "suspended") { try { AU.ctx.resume(); } catch (e) {} } return AU.ctx; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = 1; AU.master.connect(AU.ctx.destination);
  } catch (e) { AU.ctx = null; }
  return AU.ctx;
}

/* 一个音：freq，起止时刻，波形，峰值。全部指数衰减，不留尾巴 */
function tone(freq, t0, dur, type, peak, dest) {
  const c = AU.ctx; if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || AU.master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

/* 三种音效：tick 轻嗒 / confirm 双音确认 / chime 庆祝琶音 */
function sfxPlay(kind) {
  if (!AU.sfx) return;
  const c = audioCtx(); if (!c) return;
  const t = c.currentTime;
  if (kind === "tick") {
    tone(720, t, 0.06, "triangle", 0.05);
  } else if (kind === "confirm") {
    tone(523, t, 0.09, "sine", 0.07);
    tone(784, t + 0.07, 0.12, "sine", 0.06);
  } else if (kind === "chime") {
    tone(523, t, 0.5, "sine", 0.07);
    tone(659, t + 0.09, 0.5, "sine", 0.06);
    tone(988, t + 0.18, 0.7, "sine", 0.05);
    tone(1976, t + 0.18, 0.35, "sine", 0.02);   // 一点泛音，才有「叮」的金属感
  }
}

/* ---------- 背景音乐：随机循环歌单 + 浮窗播放器 ----------
   玩家 2026-09-04 定的：一整个歌单随机顺序循环播放，右下角做成浮窗，可开关、可手动选曲。
   歌单只是文件名清单——音频文件本身不进仓库、也不进 career.html，由作者自己放进 demo/bgm/
   （ascii 小写名，见 README 的对照表）。缺的文件（404 / 解码失败）自动跳过，在列表里置灰。
   一首播完 onended 自动下一首；一轮放完重新洗牌再循环。
   同一个 <audio> 元素被手势解锁一次后，换 src 再 play() 就不会被自动播放策略拦。 */
const BGM_DIR = "bgm/";
const BGM_VOL = 0.35;                             // 真歌母带都很响，压到人声之下
const BGM_TRACKS = [
  { f:"warriors",           t:"Warriors — Imagine Dragons" },
  { f:"star-walkin",        t:"STAR WALKIN' — Lil Nas X" },
  { f:"legends-never-die",  t:"Legends Never Die — Against the Current" },
  { f:"phoenix",            t:"Phoenix — Cailin Russo & Chrissy Costanza" },
  { f:"rise",               t:"RISE — Mako & The Word Alive" },
  { f:"take-over",          t:"Take Over 所向无前 — YUKIri" },
  { f:"gods",               t:"登神 GODS — noli" },
  { f:"heavy-is-the-crown", t:"Heavy Is the Crown — Linkin Park" },
  { f:"worlds-collide",     t:"Worlds Collide — Nicki Taylor" },
  { f:"ignite",             t:"Ignite — Zedd" },
  { f:"burn-it-all-down",   t:"Burn It All Down — PVRIS" },
  { f:"sacrifice",          t:"Sacrifice — G.E.M. 邓紫棋" },
  { f:"hybrid-worlds",      t:"Hybrid — 英雄联盟" },
  { f:"silver-scrapes",     t:"Silver Scrapes — Danny McCarthy" },
  { f:"crawling",           t:"Crawling — Linkin Park" },
  { f:"numb",               t:"Numb — Linkin Park" }
];

function bgmShuffle() {
  AU.order = BGM_TRACKS.map((_, i) => i);
  for (let i = AU.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [AU.order[i], AU.order[j]] = [AU.order[j], AU.order[i]];
  }
  AU.oi = 0;
}
function bgmCur() { return (AU.order && AU.oi >= 0 && AU.oi < AU.order.length) ? AU.order[AU.oi] : -1; }
function bgmPlayable() { return BGM_TRACKS.filter((_, i) => !AU.missing[i]).length; }
function bgmEl() {
  if (AU.el) return AU.el;
  if (typeof Audio === "undefined") return null;
  const el = new Audio();
  el.loop = false; el.preload = "none"; el.volume = BGM_VOL;
  el.addEventListener("ended", () => { if (AU.bgm) bgmAdvance(1); });
  el.addEventListener("error", () => {            // 404 / 解码失败：这首标记缺失，跳到下一首
    const c = bgmCur(); if (c >= 0) AU.missing[c] = true;
    if (AU.bgm && bgmPlayable() > 0) bgmAdvance(1); else { AU.playing = false; bgmPaint(); }
  });
  AU.el = el;
  return el;
}
/* 装载并播放歌单里第 idx 首（BGM_TRACKS 下标） */
function bgmLoad(idx, autoplay) {
  const el = bgmEl(); if (!el || idx < 0) return;
  const tr = BGM_TRACKS[idx]; if (!tr) return;
  el.src = BGM_DIR + tr.f + ".mp3";
  if (autoplay) { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  AU.playing = autoplay && AU.bgm;
  bgmPaint();
}
/* 沿洗好的顺序走 dir（+1 下一首 / −1 上一首），跳过缺失；一轮走完重新洗牌 */
function bgmAdvance(dir) {
  if (!AU.order || !AU.order.length) bgmShuffle();
  if (bgmPlayable() <= 0) { AU.playing = false; bgmPaint(); return; }
  for (let step = 0; step < BGM_TRACKS.length; step++) {
    AU.oi += dir;
    if (AU.oi >= AU.order.length) { bgmShuffle(); }        // 放完一轮，重洗再循环
    else if (AU.oi < 0) { AU.oi = AU.order.length - 1; }
    if (!AU.missing[bgmCur()]) break;
  }
  bgmLoad(bgmCur(), true);
}
/* 手动选曲：点歌单里某一首，直接跳过去放 */
function bgmPickTrack(idx) {
  if (AU.missing[idx]) return;
  if (!AU.order || !AU.order.length) bgmShuffle();
  const pos = AU.order.indexOf(idx);
  if (pos >= 0) AU.oi = pos;
  AU.bgm = true; audioSave();
  bgmLoad(idx, true);
  bgmPanelPaint();
}
/* 开始 / 续播：还没装曲就从洗好的顺序挑第一首能放的；已装就续播 */
function bgmStart() {
  if (!AU.bgm) return;
  const el = bgmEl(); if (!el) return;
  if (!AU.order || !AU.order.length) bgmShuffle();
  if (!el.src) { AU.oi = -1; bgmAdvance(1); }
  else if (el.paused) { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} AU.playing = true; }
  bgmPaint();
}
function bgmStop() {
  if (AU.el && !AU.el.paused) { try { AU.el.pause(); } catch (e) {} }
  AU.playing = false;
  bgmPaint();
}
function bgmToggle() {
  AU.bgm = !AU.bgm; audioSave();
  if (AU.bgm) { if (bgmCur() < 0) bgmAdvance(1); else bgmStart(); }
  else bgmStop();
  bgmPanelPaint();
}
/* ♪ 浮窗触发钮的样子：关 = ♪ 灰；开 = ♫ 亮 */
function bgmPaint() {
  try {
    const m = document.getElementById("aud-bgm"); if (!m) return;
    m.textContent = AU.bgm ? "♫" : "♪";
    m.classList.toggle("off", !AU.bgm);
    m.title = "背景音乐（点开浮窗）";
    bgmPanelPaint();
  } catch (e) {}
}

/* ---------- 挂钩 ----------
   事件委托一只耳朵听全场：按「按钮长什么样」决定响不响——
   .act/.opt 是花点数和做选择（嗒），.btn 是推进和签字（确认）。
   .tab/.rt-x 这类小件不配拥有声音。
   每次点击顺便 bgmStart()：手势里续播，被自动播放策略拦过的也能在下一次点击接上。 */
function audioClickHandler(ev) {
  try {
    const b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
    audioCtx();                                    // 第一次手势顺便把上下文建了
    if (AU.bgm) bgmStart();
    if (!b || b.disabled) return;
    const cl = b.classList;
    if (!cl) return;
    if (cl.contains("act") || cl.contains("opt")) sfxPlay("tick");
    else if (cl.contains("btn") && !cl.contains("ghost")) sfxPlay("confirm");
  } catch (e) {}
}
/* 庆祝时刻：render 的阻塞签名里第一次出现这些键，就叮一声。
   （升段 ru / 国际赛夺冠 ic / 成就 ap / 升队调令 pd） */
function audioMoment(sig, last) {
  try {
    if (!AU.sfx || !AU.ctx) return;
    ["ru", "ic", "ap", "pd"].forEach(k => {
      if (sig.indexOf(k) >= 0 && (last || "").indexOf(k) < 0) sfxPlay("chime");
    });
  } catch (e) {}
}

/* ---------- 更新日志浮窗 ----------
   点 📜 弹全部历史（CHANGELOG 在模板里维护，每次上线加一条）。
   遮罩直接挂 body，不走 render——创建页也能看。 */
function showChangelog() {
  try {
    if (document.getElementById("chlog")) return;
    const log = (typeof CHANGELOG !== "undefined") ? CHANGELOG : [];
    const wrap = document.createElement("div");
    wrap.id = "chlog"; wrap.className = "rankup";
    wrap.innerHTML = `<div class="ru-inner" style="max-width:560px;text-align:left;max-height:86vh;overflow-y:auto">
      <div class="ru-eyebrow" style="text-align:center">更新日志</div>
      ${log.map(e => `<h3 style="margin:14px 0 4px">${e.v}<span class="note" style="font-weight:400">　上线：${e.at}</span></h3>
        ${e.items.map(x => `<p class="note" style="margin:4px 0">· ${x}</p>`).join("")}`).join("")}
      <p class="note" style="color:var(--ink-3);margin-top:12px">从 v20260901b 起记录，此前的更新不补。</p>
      <div class="row" style="justify-content:center;margin-top:10px">
        <button class="btn" id="chlogok">关闭</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#chlogok").onclick = () => wrap.remove();
    wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  } catch (e) {}
}

/* ---------- 支持作者（爱发电）----------
   玩家 2026-09-05 点名，仿 VAL Manager：右下角 ♥ 弹一张卡——一句话、去爱发电的按钮、可选二维码。
   链接在模板的 SUPPORT_URL；为空时按钮和页脚入口都不渲染。 */
function supportUrl() { try { return (typeof SUPPORT_URL === "string" && SUPPORT_URL.trim()) ? SUPPORT_URL.trim() : ""; } catch (e) { return ""; } }
function showSupport() {
  try {
    const url = supportUrl(); if (!url || document.getElementById("suplove")) return;
    const qr = (typeof SUPPORT_QR === "string" && SUPPORT_QR) ? SUPPORT_QR : "";
    const wrap = document.createElement("div");
    wrap.id = "suplove"; wrap.className = "rankup";
    wrap.innerHTML = `<div class="ru-inner" style="max-width:440px;text-align:center">
      <div class="ru-eyebrow">支持作者</div>
      <div class="ru-tier" style="font-size:22px;margin:6px 0 10px">破晓是免费的同人作品</div>
      <p class="note" style="margin:0 0 14px">一个人写的：世界、数值、一千多条文案。觉得它值一杯奶茶，可以去爱发电请作者喝一杯——
        不解锁任何内容，游戏永远免费。</p>
      ${qr ? `<img src="${qr}" alt="爱发电二维码" style="width:180px;height:180px;border:1px solid var(--line);margin:0 auto 12px;display:block">` : ""}
      <div class="row" style="justify-content:center;gap:10px">
        <a class="btn" href="${url}" target="_blank" rel="noopener noreferrer">去爱发电 →</a>
        <button class="btn ghost" id="suplove-x">下次一定</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#suplove-x").onclick = () => wrap.remove();
    wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
    if (typeof statEvent === "function") statEvent("support");
  } catch (e) {}
}

/* ---------- 背景音乐浮窗 ----------
   ♪ 钮点开一个小面板：开关、上一首/播放暂停/下一首、当前曲目、可滚动的歌单（点谁放谁）。
   缺文件的曲目置灰、不可点。面板挂 body，render() 重写 stage 不影响它。 */
function bgmPanel() {
  let p = document.getElementById("bgm-panel");
  if (p) return p;
  p = document.createElement("div");
  p.id = "bgm-panel"; p.className = "bgmpanel"; p.hidden = true;
  p.innerHTML = `
    <div class="bp-head">
      <b>背景音乐</b>
      <button class="bp-pow" id="bp-pow" title="开 / 关"></button>
      <button class="bp-x" id="bp-x" title="收起" aria-label="收起">×</button>
    </div>
    <div class="bp-now"><span class="bp-title" id="bp-title">—</span></div>
    <div class="bp-ctrl">
      <button id="bp-prev" title="上一首" aria-label="上一首">⏮</button>
      <button id="bp-play" title="播放 / 暂停" aria-label="播放/暂停">▶</button>
      <button id="bp-next" title="下一首" aria-label="下一首">⏭</button>
      <span class="bp-hint" id="bp-hint"></span>
    </div>
    <div class="bp-list" id="bp-list"></div>`;
  document.body.appendChild(p);
  p.querySelector("#bp-x").onclick = (e) => { e.stopPropagation(); AU.panelOpen = false; p.hidden = true; };
  p.querySelector("#bp-pow").onclick = (e) => { e.stopPropagation(); bgmToggle(); };
  p.querySelector("#bp-prev").onclick = (e) => { e.stopPropagation(); AU.bgm = true; audioSave(); bgmAdvance(-1); bgmPanelPaint(); };
  p.querySelector("#bp-next").onclick = (e) => { e.stopPropagation(); AU.bgm = true; audioSave(); bgmAdvance(1); bgmPanelPaint(); };
  p.querySelector("#bp-play").onclick = (e) => {
    e.stopPropagation();
    if (AU.playing) { bgmStop(); }
    else { AU.bgm = true; audioSave(); if (bgmCur() < 0) bgmAdvance(1); else bgmStart(); }
    bgmPanelPaint();
  };
  // 歌单一次性铺好，点哪首放哪首
  const list = p.querySelector("#bp-list");
  list.innerHTML = BGM_TRACKS.map((tr, i) =>
    `<button class="bp-row" data-i="${i}"><span class="bp-dot"></span><span class="bp-rt">${tr.t}</span></button>`).join("");
  list.querySelectorAll(".bp-row").forEach(b => b.onclick = (e) => {
    e.stopPropagation(); bgmPickTrack(+b.dataset.i);
  });
  return p;
}
function bgmPanelPaint() {
  try {
    const p = document.getElementById("bgm-panel"); if (!p) return;
    const cur = bgmCur();
    const title = p.querySelector("#bp-title");
    if (title) title.textContent = cur >= 0 ? BGM_TRACKS[cur].t : "未开始";
    const pow = p.querySelector("#bp-pow");
    if (pow) { pow.textContent = AU.bgm ? "开" : "关"; pow.classList.toggle("off", !AU.bgm); }
    const play = p.querySelector("#bp-play");
    if (play) play.textContent = AU.playing ? "⏸" : "▶";
    const none = bgmPlayable() <= 0;
    const hint = p.querySelector("#bp-hint");
    if (hint) hint.textContent = none ? "没有可播放的音频文件" : "随机循环";
    p.querySelectorAll(".bp-row").forEach(b => {
      const i = +b.dataset.i;
      b.classList.toggle("miss", !!AU.missing[i]);
      b.classList.toggle("on", i === cur);
    });
  } catch (e) {}
}

/* ---------- 右下角浮窗按钮 ----------
   挂在 #stage 外面：render() 每次重写 stage，浮窗不能跟着死。
   📜 更新日志永远在；🔊 只在浏览器支持 WebAudio 时出现，♪ 只在支持 <audio> 时出现。 */
function audioFab(hasSfx, hasBgm) {
  const fab = document.createElement("div");
  fab.className = "audiofab";
  fab.innerHTML = (hasSfx ? `
    <button id="aud-sfx" aria-label="音效开关" title="按键音效"></button>` : "") + (hasBgm ? `
    <button id="aud-bgm" aria-label="背景音乐" title="背景音乐"></button>` : "") + `
    <button id="aud-log" aria-label="更新日志" title="更新日志">📜</button>` + (supportUrl() ? `
    <button id="aud-love" aria-label="支持作者" title="支持作者（爱发电）">♥</button>` : "");
  document.body.appendChild(fab);
  fab.querySelector("#aud-log").onclick = (e) => { e.stopPropagation(); showChangelog(); };
  const lv = fab.querySelector("#aud-love"); if (lv) lv.onclick = (e) => { e.stopPropagation(); showSupport(); };
  // 页脚也给一个入口
  try {
    const cr = document.querySelector("footer.credits");
    if (cr && supportUrl() && !document.getElementById("credit-love")) {
      const a = document.createElement("a"); a.id = "credit-love"; a.href = supportUrl(); a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "支持作者 ♥"; a.style.marginLeft = "10px"; a.style.color = "var(--gold)";
      cr.appendChild(a);
    }
  } catch (e) {}
  const paintSfx = () => {
    const s = fab.querySelector("#aud-sfx"); if (!s) return;
    s.textContent = AU.sfx ? "🔊" : "🔇";
    s.classList.toggle("off", !AU.sfx);
  };
  if (hasSfx) fab.querySelector("#aud-sfx").onclick = (e) => {
    e.stopPropagation();
    AU.sfx = !AU.sfx; audioSave(); paintSfx();
    if (AU.sfx) sfxPlay("confirm");               // 开的瞬间给一声，立刻知道开了
  };
  if (hasBgm) {
    bgmPanel();                                   // 先建好面板（隐藏）
    fab.querySelector("#aud-bgm").onclick = (e) => {
      e.stopPropagation();
      const p = bgmPanel();
      AU.panelOpen = !AU.panelOpen; p.hidden = !AU.panelOpen;
      if (AU.panelOpen) bgmPanelPaint();
    };
  }
  paintSfx(); bgmPaint();
}

function audioInit() {
  try {
    if (typeof window === "undefined" || !document.body || !document.body.appendChild) return;
    // 作者栏版本号
    const cv = document.getElementById("credit-ver");
    if (cv && typeof GAME_VER !== "undefined") cv.textContent = GAME_VER;
    const hasSfx = !!(window.AudioContext || window.webkitAudioContext);
    const hasBgm = typeof Audio !== "undefined";
    audioPrefs();
    audioFab(hasSfx, hasBgm);
    if (hasSfx || hasBgm) document.addEventListener("click", audioClickHandler, true);
  } catch (e) {}
}
