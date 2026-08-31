/* ================= 声音 =================
   2026-09-01 玩家要的：按键反馈音 + 很轻的背景音乐 + 右下角开关浮窗。

   约束与取舍：
   · 发行物是单文件，塞 MP3 体积直接翻倍——全部用 WebAudio 现场合成，
     零资产、零请求，Hextech 的「叮」本来就该是合成器味。
   · 音效不是每个按钮都响：只挂三类——花行动点的动作卡（轻嗒）、
     推进周期的主按钮（双音确认）、庆祝弹窗出现的瞬间（三音琶音）。
     标签栏、小工具按钮一概不响，响多了就是噪音。
   · 浏览器要求用户先有手势才准出声：AudioContext 在第一次点击时才建。
   · 开关存 localStorage（不进存档）——音量偏好是设备的事，不是生涯的事。 */

const AUDIO_KEY = "pjz_audio";
const AU = {
  ctx: null, master: null, bgmGain: null,
  sfx: true, bgm: true,           // 默认都开；音乐本来就压得很轻
  bgmTimer: null, bgmStep: 0
};

function audioPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    if (raw) { const p = JSON.parse(raw); AU.sfx = p.sfx !== false; AU.bgm = p.bgm !== false; }
  } catch (e) {}
}
function audioSave() {
  try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ sfx: AU.sfx, bgm: AU.bgm })); } catch (e) {}
}

/* 上下文只建一次，且必须在用户手势里建（自动播放策略） */
function audioCtx() {
  if (AU.ctx) { if (AU.ctx.state === "suspended") { try { AU.ctx.resume(); } catch (e) {} } return AU.ctx; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = 1; AU.master.connect(AU.ctx.destination);
    AU.bgmGain = AU.ctx.createGain(); AU.bgmGain.gain.value = 0.045;   // 背景乐整体就这么轻
    const lp = AU.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1600;
    AU.bgmGain.connect(lp); lp.connect(AU.master);
    AU._bgmOut = AU.bgmGain;
    if (AU.bgm) bgmStart();
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

/* ---------- 背景音乐：程序生成的氛围垫 ----------
   D 小调四个和弦轮转，每 8 秒一换，柔起柔收；上面偶尔飘一颗五声音阶的拨弦。
   没有节拍、没有鼓点——它是训练室深夜的空调声，不是主角。 */
const BGM_CHORDS = [
  [146.8, 174.6, 220.0],          // Dm
  [116.5, 146.8, 174.6],          // Bb
  [174.6, 220.0, 261.6],          // F
  [130.8, 164.8, 196.0]           // C
];
const BGM_PLUCK = [293.7, 349.2, 392.0, 440.0, 523.3];   // D 小调五声
function bgmChord(t0) {
  const notes = BGM_CHORDS[AU.bgmStep % BGM_CHORDS.length];
  notes.forEach((f, i) => {
    const c = AU.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = i === 0 ? "sine" : "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.30 / (i + 1), t0 + 2.5);   // 慢慢浮起来
    g.gain.linearRampToValueAtTime(0.0001, t0 + 8.4);           // 和下一个和弦交叉
    o.connect(g); g.connect(AU._bgmOut);
    o.start(t0); o.stop(t0 + 8.6);
  });
  if (Math.random() < 0.6) {      // 偶尔一颗拨弦，位置随机
    const f = BGM_PLUCK[Math.floor(Math.random() * BGM_PLUCK.length)];
    tone(f, t0 + 1.5 + Math.random() * 5, 1.6, "triangle", 0.05, AU._bgmOut);
  }
  AU.bgmStep++;
}
function bgmStart() {
  if (AU.bgmTimer || !AU.ctx) return;
  let next = AU.ctx.currentTime + 0.1;
  bgmChord(next); next += 8;
  AU.bgmTimer = setInterval(() => {
    if (!AU.ctx || !AU.bgm) return;
    if (AU.ctx.currentTime > next - 1.5) { bgmChord(next); next += 8; }
  }, 500);
}
function bgmStop() {
  if (AU.bgmTimer) { clearInterval(AU.bgmTimer); AU.bgmTimer = null; }
}

/* ---------- 挂钩 ----------
   事件委托一只耳朵听全场：按「按钮长什么样」决定响不响——
   .act/.opt 是花点数和做选择（嗒），.btn 是推进和签字（确认）。
   .tab/.rt-x 这类小件不配拥有声音。 */
function audioClickHandler(ev) {
  try {
    const b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
    audioCtx();                                    // 第一次手势顺便把上下文建了
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

/* ---------- 右下角浮窗 ----------
   挂在 #stage 外面：render() 每次重写 stage，浮窗不能跟着死。
   📜 更新日志永远在；两个声音钮只在浏览器支持 WebAudio 时出现。 */
function audioFab(hasAudio) {
  const fab = document.createElement("div");
  fab.className = "audiofab";
  fab.innerHTML = (hasAudio ? `
    <button id="aud-sfx" aria-label="音效开关" title="按键音效"></button>
    <button id="aud-bgm" aria-label="音乐开关" title="背景音乐"></button>` : "") + `
    <button id="aud-log" aria-label="更新日志" title="更新日志">📜</button>`;
  document.body.appendChild(fab);
  fab.querySelector("#aud-log").onclick = (e) => { e.stopPropagation(); showChangelog(); };
  if (!hasAudio) return;
  const paint = () => {
    const s = fab.querySelector("#aud-sfx"), m = fab.querySelector("#aud-bgm");
    s.textContent = AU.sfx ? "🔊" : "🔇";
    m.textContent = AU.bgm ? "♫" : "♪";
    s.classList.toggle("off", !AU.sfx);
    m.classList.toggle("off", !AU.bgm);
  };
  fab.querySelector("#aud-sfx").onclick = (e) => {
    e.stopPropagation();
    AU.sfx = !AU.sfx; audioSave(); paint();
    if (AU.sfx) sfxPlay("confirm");               // 开的瞬间给一声，立刻知道开了
  };
  fab.querySelector("#aud-bgm").onclick = (e) => {
    e.stopPropagation();
    AU.bgm = !AU.bgm; audioSave(); paint();
    if (AU.bgm) { audioCtx(); bgmStart(); } else bgmStop();
  };
  paint();
}

function audioInit() {
  try {
    if (typeof window === "undefined" || !document.body || !document.body.appendChild) return;
    // 作者栏版本号
    const cv = document.getElementById("credit-ver");
    if (cv && typeof GAME_VER !== "undefined") cv.textContent = GAME_VER;
    const hasAudio = !!(window.AudioContext || window.webkitAudioContext);
    audioPrefs();
    audioFab(hasAudio);
    if (hasAudio) document.addEventListener("click", audioClickHandler, true);
  } catch (e) {}
}
