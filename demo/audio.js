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
  sfx: true, bgm: false,          // 音效默认开；音乐默认关，想听的自己点 ♪（玩家定的）
  bgmTimer: null, bgmStep: 0
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

/* 上下文只建一次，且必须在用户手势里建（自动播放策略） */
function audioCtx() {
  if (AU.ctx) { if (AU.ctx.state === "suspended") { try { AU.ctx.resume(); } catch (e) {} } return AU.ctx; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    AU.ctx = new AC();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = 1; AU.master.connect(AU.ctx.destination);
    AU.bgmGain = AU.ctx.createGain(); AU.bgmGain.gain.value = 0.07;    // 有存在感，但仍在人声之下
    const lp = AU.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3400;
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

/* ---------- 背景音乐：每个赛季一首原创主题曲 ----------
   玩家反馈第一版氛围垫「太沉太静，不像电竞」。真 S 赛主题曲有版权、
   进不了公开部署，所以照赛事主题曲的路子自己写：鼓点、贝斯线、
   上行琶音、英雄和弦——S12 到 S16 各一首，调性/速度/动机都不同，
   赛季一换歌就换；打比赛时（step==="match"）叠一层镲片提强度。
   全部 WebAudio 逐小节合成，midi 记谱，一个引擎放五首。 */
const MF = m => 440 * Math.pow(2, (m - 69) / 12);   // midi -> 频率
/* 每首：bpm / 四小节和弦进行（midi 三和音）/ 主题动机（音+拍长，四小节一次） */
const BGM_THEMES = [
  { bpm: 112, name: "S12",                              // A 小调 · 上行的开局之年
    prog: [[57,60,64],[53,57,60],[48,52,55],[55,59,62]],           // Am F C G
    hook: [[76,1],[79,1],[81,2],[79,1],[76,1],[72,2]] },
  { bpm: 120, name: "S13",                              // D 多利亚 · 打野的节奏感
    prog: [[50,53,57],[48,52,55],[55,59,62],[46,50,53]],           // Dm C G Bb
    hook: [[74,0.5],[77,0.5],[79,1],[74,0.5],[72,0.5],[74,2]] },
  { bpm: 100, name: "S14",                              // E 小调 · 沉重的单带
    prog: [[52,55,59],[48,52,55],[50,54,57],[47,50,54]],           // Em C D Bm
    hook: [[76,2],[79,2],[78,1],[74,1],[76,4]] },
  { bpm: 126, name: "S15",                              // 升 F 小调 · 无畏的冲刺
    prog: [[54,57,61],[50,54,57],[57,61,64],[52,56,59]],           // F#m D A E
    hook: [[78,0.5],[81,0.5],[85,1],[83,0.5],[81,0.5],[78,1],[81,2]] },
  { bpm: 116, name: "S16",                              // C 小调 · 最后一年，最重的一首
    prog: [[48,51,55],[44,48,51],[51,55,58],[46,50,53]],           // Cm Ab Eb Bb
    hook: [[84,1],[82,1],[79,1],[75,1],[77,1],[79,3]] }
];
function bgmTheme() {
  try { const i = (typeof S !== "undefined" && S && S.si) || 0; return BGM_THEMES[clampI(i, 0, 4)]; }
  catch (e) { return BGM_THEMES[0]; }
}
function clampI(v, a, b) { return Math.max(a, Math.min(b, v | 0)); }
/* 打击乐：鼓是掉频正弦，镲是高通白噪 */
function kick(t0, peak) {
  const c = AU.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(130, t0);
  o.frequency.exponentialRampToValueAtTime(44, t0 + 0.12);
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
  o.connect(g); g.connect(AU._bgmOut); o.start(t0); o.stop(t0 + 0.2);
}
function hat(t0, peak) {
  const c = AU.ctx;
  if (!AU._noise) {
    const buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AU._noise = buf;
  }
  const src = c.createBufferSource(); src.buffer = AU._noise;
  const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6500;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
  src.connect(hp); hp.connect(g); g.connect(AU._bgmOut); src.start(t0);
}
/* 排一小节（4 拍）：鼓 + 贝斯八分 + 和弦垫 + 琶音；每 4 小节唱一遍动机 */
function bgmBar(t0) {
  const th = bgmTheme(), spb = 60 / th.bpm, bar = AU.bgmStep % 4;
  const tri = th.prog[bar];
  const inMatch = (typeof S !== "undefined" && S && S.step === "match");
  // 鼓：1、3 重踩；比赛中 2、4 补镲
  kick(t0, 0.5); kick(t0 + 2 * spb, 0.42);
  for (let b = 0; b < 4; b++) {
    hat(t0 + b * spb + spb / 2, inMatch ? 0.10 : 0.05);
    if (inMatch) hat(t0 + b * spb, 0.07);
  }
  // 贝斯：根音八分，隔一个跳八度，往前走的感觉就是它给的
  for (let i = 0; i < 8; i++) {
    const f = MF(tri[0] - 12 + (i % 4 === 2 ? 12 : 0));
    tone(f, t0 + i * spb / 2, spb * 0.42, "sawtooth", 0.10);
  }
  // 和弦垫：整小节铺住
  tri.forEach((m, i) => tone(MF(m), t0, spb * 4 * 0.98, i ? "triangle" : "sine", 0.05));
  // 琶音：八分上行循环（三和音+八度），电竞主题曲的闪光层
  const arp = [tri[0] + 12, tri[1] + 12, tri[2] + 12, tri[0] + 24];
  for (let i = 0; i < 8; i++)
    tone(MF(arp[i % 4]), t0 + i * spb / 2, spb * 0.5, "triangle", 0.045);
  // 动机：每四小节的第一小节唱一遍——每个赛季只属于它自己的那句
  if (bar === 0) {
    let tt = t0;
    th.hook.forEach(([m, beats]) => { tone(MF(m), tt, beats * spb * 0.92, "square", 0.035); tt += beats * spb; });
  }
  AU.bgmStep++;
  return spb * 4;
}
function bgmStart() {
  if (AU.bgmTimer || !AU.ctx) return;
  let next = AU.ctx.currentTime + 0.1;
  next += bgmBar(next);
  AU.bgmTimer = setInterval(() => {
    if (!AU.ctx || !AU.bgm) return;
    if (AU.ctx.currentTime > next - 0.8) next += bgmBar(next);
  }, 200);
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
