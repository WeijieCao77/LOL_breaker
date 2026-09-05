import { CHANGELOG, GAME_VER, SUPPORT_QR, SUPPORT_URL } from "./main";
import { saveGame } from "./save";
import { S } from "./state";
import { statEvent } from "./stats";

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

export const AUDIO_KEY = "pjz_audio";
export const AU: any = {
  ctx: null, master: null,
  sfx: true, bgm: false,          // 音效默认开；音乐默认关，想听的自己点 ♪（玩家定的）
  el: null,                       // <audio> 元素
  order: [], oi: -1,              // 洗好的播放顺序、当前走到第几个
  playing: false,                 // 是否正在放（给浮窗的播放/暂停按钮看）
  missing: {}, panelOpen: false   // 已知缺失的曲目下标；浮窗是否展开
};

export function audioPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    // bgm 用 === true：没存过偏好的一律当「关」，和上面的默认值一致
    if (raw) { const p = JSON.parse(raw); AU.sfx = p.sfx !== false; AU.bgm = p.bgm === true; }
  } catch (e) {}
}
export function audioSave() {
  try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ sfx: AU.sfx, bgm: AU.bgm })); } catch (e) {}
}

/* 上下文只建一次，且必须在用户手势里建（自动播放策略）。只给音效用 */
export function audioCtx() {
  if (AU.ctx) { if (AU.ctx.state === "suspended") { try { AU.ctx.resume(); } catch (e) {} } return AU.ctx; }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = 1; AU.master.connect(AU.ctx.destination);
  } catch (e) { AU.ctx = null; }
  return AU.ctx;
}

/* 一个音：freq，起止时刻，波形，峰值。全部指数衰减，不留尾巴 */
export function tone(freq, t0, dur, type, peak, dest?) {
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
export function sfxPlay(kind) {
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
export const BGM_DIR = "bgm/";
export const BGM_VOL = 0.35;                             // 真歌母带都很响，压到人声之下
export const BGM_TRACKS = [
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
  { f:"numb",               t:"Numb — Linkin Park" },
  /* 赛季主题曲位：文件名就叫 s12.mp3 … s16.mp3（作者自备）。
     赛季一换，如果那一年的文件在，就先切到它；没有的就继续随机歌单。
     原来更新日志写「赛季一换就换歌」、代码却只有随机循环（外部测评抓的对不上）。 */
  { f:"s12", t:"S12 赛季主题曲（自备 s12.mp3）", season:0 },
  { f:"s13", t:"S13 赛季主题曲（自备 s13.mp3）", season:1 },
  { f:"s14", t:"S14 赛季主题曲（自备 s14.mp3）", season:2 },
  { f:"s15", t:"S15 赛季主题曲（自备 s15.mp3）", season:3 },
  { f:"s16", t:"S16 赛季主题曲（自备 s16.mp3）", season:4 }
];
/* 当前赛季的主题曲下标（没有 / 已知缺失 → -1） */
export function bgmSeasonIdx(){
  try{
    if (!S || S.si === undefined) return -1;
    const i = BGM_TRACKS.findIndex(t => t.season === S.si);
    return (i >= 0 && !AU.missing[i]) ? i : -1;
  }catch(e){ return -1; }
}
/* render() 每次调一下：赛季变了、音乐开着、那一年的主题曲在，就切过去 */
export function bgmSeasonTick(){
  try{
    if (!S || S.si === undefined) return;
    if (AU.si === S.si) return;
    const first = (AU.si === undefined);
    AU.si = S.si;
    if (first || !AU.bgm || !AU.playing) return;
    const i = bgmSeasonIdx();
    if (i >= 0) { AU.oi = AU.order.indexOf(i); bgmLoad(i, true); }
  }catch(e){}
}

export function bgmShuffle() {
  AU.order = BGM_TRACKS.map((_, i) => i);
  for (let i = AU.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [AU.order[i], AU.order[j]] = [AU.order[j], AU.order[i]];
  }
  AU.oi = 0;
}
export function bgmCur() { return (AU.order && AU.oi >= 0 && AU.oi < AU.order.length) ? AU.order[AU.oi] : -1; }
export function bgmPlayable() { return BGM_TRACKS.filter((_, i) => !AU.missing[i]).length; }
export function bgmEl() {
  if (AU.el) return AU.el;
  if (typeof Audio === "undefined") return null;
  const el = new Audio();
  el.loop = false; el.preload = "none"; el.volume = BGM_VOL;
  el.addEventListener("ended", () => { if (AU.bgm) bgmAdvance(1); });
  el.addEventListener("error", () => {            // 404 / 解码失败：这首标记缺失，跳到下一首
    const c = bgmCur(); if (c >= 0) AU.missing[c] = true;
    if (AU.bgm && bgmPlayable() > 0) bgmAdvance(1);
    else if (bgmPlayable() <= 0) bgmUnavailable();   // 一首都放不了：♪ 收掉、开关复位（原来按钮还亮着「已开启」）
    else { AU.playing = false; bgmPaint(); }
  });
  AU.el = el;
  return el;
}
/* 装载并播放歌单里第 idx 首（BGM_TRACKS 下标） */
export function bgmLoad(idx, autoplay) {
  const el = bgmEl(); if (!el || idx < 0) return;
  const tr = BGM_TRACKS[idx]; if (!tr) return;
  el.src = BGM_DIR + tr.f + ".mp3";
  if (autoplay) { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  AU.playing = autoplay && AU.bgm;
  bgmPaint();
}
/* 沿洗好的顺序走 dir（+1 下一首 / −1 上一首），跳过缺失；一轮走完重新洗牌 */
export function bgmAdvance(dir) {
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
export function bgmPickTrack(idx) {
  if (AU.missing[idx]) return;
  if (!AU.order || !AU.order.length) bgmShuffle();
  const pos = AU.order.indexOf(idx);
  if (pos >= 0) AU.oi = pos;
  AU.bgm = true; audioSave();
  bgmLoad(idx, true);
  bgmPanelPaint();
}
/* 开始 / 续播：还没装曲就从洗好的顺序挑第一首能放的；已装就续播 */
export function bgmStart() {
  if (!AU.bgm) return;
  const el = bgmEl(); if (!el) return;
  if (!AU.order || !AU.order.length) bgmShuffle();
  if (!el.src) { AU.oi = -1; bgmAdvance(1); }
  else if (el.paused) { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} AU.playing = true; }
  bgmPaint();
}
export function bgmStop() {
  if (AU.el && !AU.el.paused) { try { AU.el.pause(); } catch (e) {} }
  AU.playing = false;
  bgmPaint();
}
export function bgmToggle() {
  AU.bgm = !AU.bgm; audioSave();
  if (AU.bgm) { if (bgmCur() < 0) bgmAdvance(1); else bgmStart(); }
  else bgmStop();
  bgmPanelPaint();
}
/* ♪ 浮窗触发钮的样子：关 = ♪ 灰；开 = ♫ 亮 */
export function bgmPaint() {
  try {
    const m = document.getElementById("aud-bgm"); if (!m) return;
    m.textContent = AU.bgm ? "♫" : "♪";
    m.classList.toggle("off", !AU.bgm);
    m.title = "背景音乐（点开浮窗）";
    bgmPanelPaint();
  } catch (e) {}
}

/* ---------- 歌单探测 ----------
   仓库不带任何 mp3（.gitignore），干净部署上 demo/bgm/ 只有 README；原来只看浏览器支不支持 <audio>，
   ♪ 钮永远在，点播放连吃 21 个 404 之后按钮还亮着「已开启」（外部审计 P2）。
   有服务端就先问一声 /api/bgm，谁在谁不在一次说清：不在的直接置灰，一首都没有就把 ♪ 钮藏掉。
   单文件发布（Toy）没有这个接口：请求失败就保持原来的「点了才知道」，全都放不了也会收掉。 */
export function bgmProbe() {
  try {
    if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return;
    fetch("api/bgm", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("bad"); return r.json(); })
      .then(j => {
        if (!j || !Array.isArray(j.tracks)) return;
        const have = new Set(j.tracks.map(String));
        BGM_TRACKS.forEach((tr, i) => { if (!have.has(tr.f)) AU.missing[i] = true; });
        if (bgmPlayable() <= 0) bgmUnavailable(); else bgmPanelPaint();
      }).catch(() => {});
  } catch (e) {}
}
/* 一首都放不了：♪ 钮拿掉、面板收起、偏好复位为关——不然按钮一直亮着「♫ 已开启」却没声 */
export function bgmUnavailable() {
  try {
    if (AU.bgm) { AU.bgm = false; audioSave(); }
    AU.playing = false;
    const m = document.getElementById("aud-bgm"); if (m) m.remove();
    const p = document.getElementById("bgm-panel"); if (p) { p.hidden = true; AU.panelOpen = false; }
    bgmPanelPaint();
  } catch (e) {}
}

/* ---------- 挂钩 ----------
   事件委托一只耳朵听全场：按「按钮长什么样」决定响不响——
   .act/.opt 是花点数和做选择（嗒），.btn 是推进和签字（确认）。
   .tab/.rt-x 这类小件不配拥有声音。
   每次点击顺便 bgmStart()：手势里续播，被自动播放策略拦过的也能在下一次点击接上。 */
export function audioClickHandler(ev) {
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
export function audioMoment(sig, last) {
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
/* 更新日志的未读点：版本戳变了、还没点开过 📜 就亮；点开即已读（记 localStorage） */
export const LOG_SEEN_KEY = "poxiao_log_seen";
export function logBadge() {
  try {
    const b = document.getElementById("aud-log"); if (!b) return;
    const seen = localStorage.getItem(LOG_SEEN_KEY);
    const fresh = seen !== GAME_VER;
    b.classList.toggle("new", fresh);
    const m = document.getElementById("aud-more"); if (m) m.classList.toggle("new", fresh);   // 手机上折叠着，红点亮在「⋯」上
  } catch (e) {}
}
export function showChangelog() {
  try {
    try { localStorage.setItem(LOG_SEEN_KEY, GAME_VER); } catch (e) {}
    logBadge();
    if (document.getElementById("chlog")) return;
    const log = CHANGELOG;
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
    wrap.querySelector<HTMLElement>("#chlogok").onclick = () => wrap.remove();
    wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  } catch (e) {}
}

/* ---------- 支持作者（爱发电）----------
   右下角 ♥ 随时可手动打开；首次进入一次自动提示。
   「不用了，别再提示」只关闭自动提示，不会藏掉 ♥，玩家以后仍可主动打开。
   链接在模板的 SUPPORT_URL；为空时整套入口都不渲染。 */
export const SUPPORT_HIDE_KEY = "poxiao_support_hide_v1";
export const SUPPORT_SESSION_KEY = "poxiao_support_seen_session_v1";
export function supportUrl() { try { return (typeof SUPPORT_URL === "string" && SUPPORT_URL.trim()) ? SUPPORT_URL.trim() : ""; } catch (e) { return ""; } }
export function supportAutoHidden() {
  try { return localStorage.getItem(SUPPORT_HIDE_KEY) === "1"; } catch (e) { return false; }
}
export function showSupport(source?) {
  try {
    const url = supportUrl();
    if (!url || document.getElementById("suplove") || (source === "auto" && supportAutoHidden())) return;
    const qr = (typeof SUPPORT_QR === "string" && SUPPORT_QR.trim()) ? SUPPORT_QR.trim() : "";
    const wrap = document.createElement("div");
    wrap.id = "suplove";
    wrap.className = "rankup support-overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "support-title");
    wrap.innerHTML = `<section class="support-card">
      <header class="support-head">
        <div>
          <div class="support-kicker">支持独立创作</div>
          <h2 id="support-title">游戏是免费的，以后也是</h2>
        </div>
        <button type="button" class="support-close" id="suplove-x" aria-label="关闭支持作者浮窗">关闭 <span aria-hidden="true">×</span></button>
      </header>
      <p class="support-lead">《破晓》会继续免费更新，<strong>所有内容永久免费，不卖数值、不卖抽卡。</strong>
        如果它曾让你开心，欢迎请作者喝杯咖啡；不支持也完全没关系，继续反馈 bug 和建议就是最大的帮助。</p>
      <div class="support-main${qr ? "" : " no-qr"}">
        ${qr ? `<div class="support-qrbox"><img id="support-qr" alt="爱发电主页二维码"></div>` : ""}
        <div class="support-copy">
          <a class="support-link" id="support-link" target="_blank" rel="noopener noreferrer">打开爱发电 <span aria-hidden="true">↗</span></a>
          <p>手机扫码，或直接点击上面的按钮。</p>
          <p>金额随意。选择赞助 1 个月即可作为一次支持，不会自动续费。</p>
        </div>
      </div>
      <footer class="support-foot">
        <button type="button" class="support-never" id="suplove-never">不用了，别再提示</button>
        <span>《破晓》为程序模拟作品，与现实选手、战队和赛事无关</span>
      </footer>
    </section>`;
    const link: any = wrap.querySelector<HTMLElement>("#support-link");
    if (link) link.href = url;
    const qrImg: any = wrap.querySelector<HTMLElement>("#support-qr");
    if (qrImg) qrImg.src = qr;

    const close = (never) => {
      if (never) { try { localStorage.setItem(SUPPORT_HIDE_KEY, "1"); } catch (e) {} }
      document.removeEventListener("keydown", onKey);
      wrap.remove();
    };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    wrap.querySelector<HTMLElement>("#suplove-x").onclick = () => close(false);
    wrap.querySelector<HTMLElement>("#suplove-never").onclick = () => close(true);
    wrap.onclick = (e) => { if (e.target === wrap) close(false); };
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);
    setTimeout(() => { try { wrap.querySelector<HTMLElement>("#suplove-x").focus(); } catch (e) {} }, 0);
    statEvent("support");
  } catch (e) {}
}
/* 自动提示的时机（玩家 2026-09-06 定的：打开网页不弹，只有通关、或者这一次玩够 10 分钟才弹）：
   · 通关：S.step 变成 "end" 时（render 末尾调 supportNudge("end")），等 5 秒让人先看结局；
   · 玩够 10 分钟：只数标签页可见、且不在建档页的时间，每 30 秒记一次。
   每个浏览器会话最多弹一次；点过「别再提示」永远不弹。右下角 ♥ 随时能主动打开。 */
export const SUPPORT_PLAY_MS = 10 * 60 * 1000;
export function supportSeen() {
  try { return sessionStorage.getItem(SUPPORT_SESSION_KEY) === "1"; } catch (e) { return false; }
}
export function supportNudge(reason) {
  try {
    if (!supportUrl() || supportAutoHidden() || supportSeen()) return;
    try { sessionStorage.setItem(SUPPORT_SESSION_KEY, "1"); } catch (e) {}
    setTimeout(() => showSupport("auto"), reason === "end" ? 5000 : 0);   // 通关：先让人看完结局
  } catch (e) {}
}
export function scheduleSupport() {
  try {
    if (!supportUrl() || supportAutoHidden() || supportSeen()) return;
    let played = 0;                                   // 这一次会话真正在玩的毫秒数
    const tick = () => {
      try {
        if (supportAutoHidden() || supportSeen()) return;
        const inGame = (S && S.step !== "create");
        const visible = (typeof document === "undefined") || document.visibilityState !== "hidden";
        if (inGame && visible) played += 30000;
        if (played >= SUPPORT_PLAY_MS) { supportNudge("time"); return; }
      } catch (e) {}
      setTimeout(tick, 30000);
    };
    setTimeout(tick, 30000);
  } catch (e) {}
}

/* ---------- 更新提示（玩家点名，照 vctgames：「游戏更新了 → 刷新 / 稍后」）----------
   页面打开时记下服务器的版本戳（/api/version 返回 career.html 的 ETag），之后每 5 分钟、以及切回标签页时再问一次；
   变了就在右上角弹一条。「刷新」先自动存档再 reload；「稍后」这一版不再提示，再有新版本才提。
   单文件发布（Toy）没有这个接口，请求失败就静默。 */
export const UPD = { v0: null, timer: null, shown: false };
export function updFetch() {
  return fetch("api/version", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("bad"); return r.json(); }).then(j => j && j.v);
}
export function updInit() {
  try {
    if (typeof fetch !== "function" || typeof location === "undefined" || location.protocol === "file:") return;
    updFetch().then(v => {
      if (!v) return;
      UPD.v0 = v;
      UPD.timer = setInterval(updCheck, 5 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") updCheck(); });
    }).catch(() => {});
  } catch (e) {}
}
export function updCheck() {
  if (!UPD.v0 || UPD.shown) return;
  updFetch().then(v => { if (v && v !== UPD.v0) updShow(v); }).catch(() => {});
}
export function updShow(v) {
  try {
    if (UPD.shown || document.getElementById("updbar")) return;
    if (document.getElementById("tour")) return;   // 导览正在走：别插进来（下一次检查或导览结束时再提）
    let later = ""; try { later = sessionStorage.getItem("poxiao_upd_later") || ""; } catch (e) {}
    if (later && later === v) return;
    UPD.shown = true;
    const el = document.createElement("div");
    el.id = "updbar"; el.className = "updbar"; el.setAttribute("role", "status");
    el.innerHTML = `<div class="ub-t"><b>游戏更新了</b><span>刷新一下页面就能用上新版本，存档不受影响。</span></div>
      <div class="ub-b"><button type="button" class="btn primary sm" id="upd-go">刷新</button><button type="button" class="btn ghost sm" id="upd-later">稍后</button></div>`;
    document.body.appendChild(el);
    el.querySelector<HTMLElement>("#upd-go").onclick = () => {
      try { if (S && S.step !== "create") saveGame("更新前"); } catch (e) {}
      location.reload();
    };
    el.querySelector<HTMLElement>("#upd-later").onclick = () => {
      try { sessionStorage.setItem("poxiao_upd_later", v); } catch (e) {}
      el.remove(); UPD.shown = false; UPD.v0 = v;
    };
  } catch (e) {}
}

/* ---------- 背景音乐浮窗 ----------
   ♪ 钮点开一个小面板：开关、上一首/播放暂停/下一首、当前曲目、可滚动的歌单（点谁放谁）。
   缺文件的曲目置灰、不可点。面板挂 body，render() 重写 stage 不影响它。 */
export function bgmPanel() {
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
  p.querySelector<HTMLElement>("#bp-x").onclick = (e) => { e.stopPropagation(); AU.panelOpen = false; p.hidden = true; };
  p.querySelector<HTMLElement>("#bp-pow").onclick = (e) => { e.stopPropagation(); bgmToggle(); };
  p.querySelector<HTMLElement>("#bp-prev").onclick = (e) => { e.stopPropagation(); AU.bgm = true; audioSave(); bgmAdvance(-1); bgmPanelPaint(); };
  p.querySelector<HTMLElement>("#bp-next").onclick = (e) => { e.stopPropagation(); AU.bgm = true; audioSave(); bgmAdvance(1); bgmPanelPaint(); };
  p.querySelector<HTMLElement>("#bp-play").onclick = (e) => {
    e.stopPropagation();
    if (AU.playing) { bgmStop(); }
    else { AU.bgm = true; audioSave(); if (bgmCur() < 0) bgmAdvance(1); else bgmStart(); }
    bgmPanelPaint();
  };
  // 歌单一次性铺好，点哪首放哪首
  const list = p.querySelector<HTMLElement>("#bp-list");
  list.innerHTML = BGM_TRACKS.map((tr, i) =>
    `<button class="bp-row" data-i="${i}"><span class="bp-dot"></span><span class="bp-rt">${tr.t}</span></button>`).join("");
  list.querySelectorAll(".bp-row").forEach((b: any) => b.onclick = (e) => {
    e.stopPropagation(); bgmPickTrack(+b.dataset.i);
  });
  return p;
}
export function bgmPanelPaint() {
  try {
    const p = document.getElementById("bgm-panel"); if (!p) return;
    const cur = bgmCur();
    const title = p.querySelector<HTMLElement>("#bp-title");
    if (title) title.textContent = cur >= 0 ? BGM_TRACKS[cur].t : "未开始";
    const pow = p.querySelector<HTMLElement>("#bp-pow");
    if (pow) { pow.textContent = AU.bgm ? "开" : "关"; pow.classList.toggle("off", !AU.bgm); }
    const play = p.querySelector<HTMLElement>("#bp-play");
    if (play) play.textContent = AU.playing ? "⏸" : "▶";
    const none = bgmPlayable() <= 0;
    const hint = p.querySelector<HTMLElement>("#bp-hint");
    if (hint) hint.textContent = none ? "没有可播放的音频文件" : "随机循环";
    p.querySelectorAll(".bp-row").forEach((b: any) => {
      const i = +b.dataset.i;
      b.classList.toggle("miss", !!AU.missing[i]);
      b.classList.toggle("on", i === cur);
    });
  } catch (e) {}
}

/* ---------- 右下角浮窗按钮 ----------
   挂在 #stage 外面：render() 每次重写 stage，浮窗不能跟着死。
   📜 更新日志永远在；🔊 只在浏览器支持 WebAudio 时出现，♪ 只在支持 <audio> 时出现。 */
export function audioFab(hasSfx, hasBgm) {
  const fab = document.createElement("div");
  fab.className = "audiofab";
  // 手机（≤560px）：四颗横排会压住卡片右下角的文字，收成一颗「⋯」，点开再展开（列表倒排：它在最下面，其余往上叠）
  fab.innerHTML = `
    <button id="aud-more" aria-label="更多工具" aria-expanded="false" title="声音 / 更新日志 / 支持作者">⋯</button>` + (hasSfx ? `
    <button id="aud-sfx" aria-label="音效开关" title="按键音效"></button>` : "") + (hasBgm ? `
    <button id="aud-bgm" aria-label="背景音乐" title="背景音乐"></button>` : "") + `
    <button id="aud-log" aria-label="更新日志" title="更新日志">📜</button>` + (supportUrl() ? `
    <button id="aud-love" aria-label="支持作者" title="支持作者（爱发电）">♥</button>` : "");
  document.body.appendChild(fab);
  const more: any = fab.querySelector<HTMLElement>("#aud-more");
  const foldSet = () => {
    try {
      const m = window.innerWidth <= 560;
      fab.classList.toggle("fold", m);
      if (!m) { fab.classList.remove("open"); more.setAttribute("aria-expanded", "false"); }
    } catch (e) {}
  };
  const foldClose = () => { fab.classList.remove("open"); more.setAttribute("aria-expanded", "false"); };
  more.onclick = (e) => {
    e.stopPropagation();
    const open = !fab.classList.contains("open");
    fab.classList.toggle("open", open); more.setAttribute("aria-expanded", open ? "true" : "false");
  };
  // 展开后点了任意一颗就收回；点浮窗外面也收回（捕获阶段，不受各按钮 stopPropagation 影响）
  fab.addEventListener("click", (e) => { const t = e.target as HTMLElement; const b = t && t.closest ? t.closest("button") : null; if (b && b !== more && fab.classList.contains("fold")) setTimeout(foldClose, 0); }, true);
  document.addEventListener("click", (e) => { if (fab.classList.contains("open") && !(e.target && fab.contains(e.target as Node))) foldClose(); }, true);
  foldSet(); window.addEventListener("resize", foldSet);
  fab.querySelector<HTMLElement>("#aud-log").onclick = (e) => { e.stopPropagation(); showChangelog(); };
  logBadge();
  const lv: any = fab.querySelector<HTMLElement>("#aud-love"); if (lv) lv.onclick = (e) => { e.stopPropagation(); showSupport(); };
  // 页脚也给一个入口
  try {
    const cr = document.querySelector<HTMLElement>("footer.credits");
    if (cr && supportUrl() && !document.getElementById("credit-love")) {
      const a = document.createElement("a"); a.id = "credit-love"; a.href = supportUrl(); a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "支持作者 ♥"; a.style.marginLeft = "10px"; a.style.color = "var(--gold)";
      cr.appendChild(a);
    }
  } catch (e) {}
  const paintSfx = () => {
    const s = fab.querySelector<HTMLElement>("#aud-sfx"); if (!s) return;
    s.textContent = AU.sfx ? "🔊" : "🔇";
    s.classList.toggle("off", !AU.sfx);
  };
  if (hasSfx) fab.querySelector<HTMLElement>("#aud-sfx").onclick = (e) => {
    e.stopPropagation();
    AU.sfx = !AU.sfx; audioSave(); paintSfx();
    if (AU.sfx) sfxPlay("confirm");               // 开的瞬间给一声，立刻知道开了
  };
  if (hasBgm) {
    bgmPanel();                                   // 先建好面板（隐藏）
    fab.querySelector<HTMLElement>("#aud-bgm").onclick = (e) => {
      e.stopPropagation();
      const p = bgmPanel();
      AU.panelOpen = !AU.panelOpen; p.hidden = !AU.panelOpen;
      if (AU.panelOpen) bgmPanelPaint();
    };
  }
  paintSfx(); bgmPaint();
}

export function audioInit() {
  try {
    if (typeof window === "undefined" || !document.body || !document.body.appendChild) return;
    // 作者栏版本号
    const cv = document.getElementById("credit-ver");
    if (cv && true) cv.textContent = GAME_VER;
    const hasSfx = !!(window.AudioContext || (window as any).webkitAudioContext);
    const hasBgm = typeof Audio !== "undefined";
    audioPrefs();
    audioFab(hasSfx, hasBgm);
    if (hasBgm) bgmProbe();                       // 服务器上一首都没有就把 ♪ 收掉
    scheduleSupport();
    bgmSeasonTick();
    updInit();                                    // 新版本上线时提示刷新
    if (hasSfx || hasBgm) document.addEventListener("click", audioClickHandler, true);
  } catch (e) {}
}
