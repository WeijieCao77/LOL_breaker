/* ================= 存档 =================

   一局 80–140 分钟，刷新一下就没了是不可接受的。

   几个要点：
   · 带版本号。改了存档结构就换号，旧档不会把新代码搞崩，而是提示重开
   · 待处理的弹窗（际遇 / 更衣室 / 报名）里挂着函数，序列化不了——
     存档时剔除，读档后回到「本周」界面，那次弹窗算跳过
   · 存档失败（隐私模式、容量满）不能影响游戏，一律 try/catch 吞掉
   · 提供手动导出/导入，方便测试者把坏档发回来                        */

const SAVE_KEY = "pojuzhe_save_v1";
const SAVE_VER = 4;                 // 存档结构版本；改结构就 +1

/* 这些字段挂着函数或临时 UI 状态，不进存档 */
const SAVE_SKIP = ["locker", "rndEv", "signup", "rankUp", "rndResult",
                   "cupResult", "cupMatch", "showStart", "match", "confirm"];

function saveGame(reason) {
  try {
    if (!S || S.step === "create") return false;
    const data = {};
    Object.keys(S).forEach(k => { if (!SAVE_SKIP.includes(k)) data[k] = S[k]; });
    const blob = { ver: SAVE_VER, at: Date.now(), reason: reason || "", S: data };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    return true;
  } catch (e) {
    // 隐私模式 / 容量满 / 循环引用——都不该影响正在进行的这局
    return false;
  }
}
/* 老存档的迁移。
   能升就升，别动不动让人重开——正在玩的人不该为我改数值付代价。
   v3 -> v4：年龄语义从「出道年龄」改成「当前年龄」。
   v3 的职业前存档里 age 比选的小一岁（签约时才 +1），而新代码
   不再 +1，直接读会让整个生涯小一岁。所以职业前的档补回这一岁；
   已经签约的档当年就已经是正确年龄，不用动。 */
function migrate(blob) {
  // 全年连续周数是后加的字段。老存档没有它，读回来会又显示「第 1 周」，
  // 看着像时间倒流——正是这个改动要解决的问题。
  // 已经签约的档推不出当年在职业前用掉几周，按整年估（多数人打满），
  // 这个值纯粹用于显示，不影响任何机制。
  if (blob.S && blob.S.career && blob.S.yearBase === undefined) {
    blob.S.yearBase = (typeof PRE_YEAR !== "undefined") ? PRE_YEAR : 20;
  }
  if (blob.ver === 3) {
    const s = blob.S;
    if (s.step === "pre" && typeof s.age === "number") s.age += 1;
    blob.ver = 4;
  }
  return blob;
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    let blob = JSON.parse(raw);
    if (!blob || typeof blob !== "object" || !blob.S) return { bad: "格式不对" };
    blob = migrate(blob);
    if (blob.ver !== SAVE_VER) return { bad: "版本不符（存档 v" + blob.ver + "，当前 v" + SAVE_VER + "）" };
    if (!blob.S.step || !blob.S.attrs) return { bad: "内容缺失" };
    return blob;
  } catch (e) {
    return { bad: "读取失败" };
  }
}
function hasSave() { const b = readSave(); return !!(b && !b.bad); }
function dropSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

function loadGame() {
  const blob = readSave();
  if (!blob || blob.bad) return false;
  try {
    S = blob.S;
    // 存档时被剔除的弹窗字段补回空值，避免到处 undefined
    SAVE_SKIP.forEach(k => { if (S[k] === undefined) S[k] = null; });
    S.tab = "act";
    // 读档落在比赛中途会尴尬——回到本周界面
    if (S.step === "match") S.step = S.pre && !S.career ? "pre" : "season";
    render();
    return true;
  } catch (e) {
    return false;
  }
}

/* 存档时间的人话 */
function saveAgeText(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + " 分钟前";
  const h = Math.round(m / 60);
  if (h < 24) return h + " 小时前";
  return Math.round(h / 24) + " 天前";
}
/* 存档里的进度摘要，让玩家确认是不是自己那一局 */
function saveSummary(s) {
  try {
    const sea = (typeof SEASONS !== "undefined" && SEASONS[s.si]) ? SEASONS[s.si].tag : "S12";
    const who = (s.name || "无名") + " · " + (POSN[s.pos] || "");
    if (!s.career) return `${who} · ${sea} 职业前 第 ${s.pre ? s.pre.week : 1} 周`;
    const t = (s.career.titles || []).length;
    return `${who} · ${sea} · ${s.team || "无队"}${t ? " · 冠军 " + t : ""}`;
  } catch (e) { return "存档"; }
}

/* ---------- 界面 ---------- */
/* 捏人页顶部：有档就先问要不要继续 */
function continueCard() {
  const blob = readSave();
  if (!blob) return "";
  if (blob.bad) {
    return `<div class="card savebad"><h2>发现一个读不了的存档</h2>
      <p class="note" style="margin:0">${blob.bad}。可能是游戏更新过，或者存档损坏了。<br>
      重新开一局就好——旧档不会影响新的一局。</p>
      <div class="row"><button class="btn ghost sm" id="savedrop">清掉它</button></div></div>`;
  }
  return `<div class="card savecont"><h2>上次的存档<em>${saveAgeText(blob.at)}</em></h2>
    <h3>${saveSummary(blob.S)}</h3>
    <div class="row">
      <button class="btn" id="savecont">继续上次</button>
      <button class="btn ghost" id="savenew">重新开一局</button>
    </div>
    <p class="note">重新开局会覆盖上面这个存档。</p></div>`;
}
/* 设置类操作：手动存、导出、导入 */
function saveBar() {
  if (!S || S.step === "create") return "";
  const b = readSave();
  return `<div class="savebar">
    <span class="sb-t">存档 ${b && !b.bad ? saveAgeText(b.at) : "尚未保存"}</span>
    <button class="rt-x" id="savenow">立即保存</button>
    <button class="rt-x" id="saveexp">导出</button>
    <button class="rt-x" id="saveimp">导入</button>
    <button class="rt-x" id="saverst">重开</button>
  </div>`;
}
function exportSave() {
  saveGame("手动导出");
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    a.download = "破局者存档.json";
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {}
}
function importSave() {
  try {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          let blob = JSON.parse(rd.result);
          if (!blob || !blob.S) { alert("这个文件不像是存档。"); return; }
          blob = migrate(blob);
          if (blob.ver !== SAVE_VER) { alert("存档版本不符，读不了。"); return; }
          localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
          loadGame();
        } catch (e) { alert("读取失败。"); }
      };
      rd.readAsText(f);
    };
    inp.click();
  } catch (e) {}
}


/* ================= 两个到处都要用的小东西 ================= */

/* 玩家名字是唯一一处玩家能写进 innerHTML 的文本。
   自己玩当然无所谓，但存档能导出导入、以后还可能有分享——
   一个叫 <img onerror=...> 的选手不该能执行代码。 */
function escapeHtml(v){
  if(v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
/* 玩家名字的统一出口：空名字有兜底，且一定转义 */
function meName(){ return escapeHtml(S && S.name ? S.name : "你"); }
/* 名字会被存进队伍名单、再被十几个地方拼进 innerHTML。
   与其追着每个显示点转义，不如在唯一的入口就把危险字符挡掉——
   这是比赛服 ID，本来也不该有尖括号。 */
function safeName(v){
  // 白名单比黑名单省心：ID 本来就只该是字母、数字、汉字和几个连接符
  return String(v == null ? "" : v)
    .replace(/[^\w一-龥぀-ヿ .\-]/g, "")
    .trim().slice(0, 12);
}

/* 通用确认框。用在那些「按下去就回不来」的操作上：
   自动推进、重开档、覆盖存档。 */
function askConfirm(title, body, okText, fn, alt){
  // alt 可选：{t:"按钮字", fn:()=>{}}，用在「同一件事、两种力度」的场合
  S.confirm = { title, body, ok: okText || "确定", fn, alt };
  render();
}
function confirmCard(){
  const c = S.confirm; if(!c) return "";
  return `<div class="rankup"><div class="ru-inner" style="max-width:430px">
    <div class="ru-eyebrow">请确认</div>
    <div class="ru-tier" style="font-size:23px">${c.title}</div>
    <div class="ru-txt">${c.body}</div>
    <div class="row" style="justify-content:center">
      <button class="btn" id="cfmOk">${c.ok}</button>
      ${c.alt?`<button class="btn" id="cfmAlt">${c.alt.t}</button>`:""}
      <button class="btn ghost" id="cfmNo">取消</button>
    </div></div></div>`;
}
