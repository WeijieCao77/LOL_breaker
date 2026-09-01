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

/* 老存档里攒下的浮点尾巴（47.60402559999999 这种）一次性抹平。
   新代码在写入处已经 q1 了，这里只为已经存坏的档做一次清洗。 */
function scrubFloats(s) {
  const q = v => Math.round(v * 10) / 10;
  const fix = o => { if (o) Object.keys(o).forEach(k => { if (typeof o[k] === "number") o[k] = q(o[k]); }); };
  try {
    fix(s.staff); fix(s.trust); fix(s.rel); fix(s.squad);
    if (typeof s.form === "number") s.form = q(s.form);
    if (typeof s.fatigue === "number") s.fatigue = q(s.fatigue);
  } catch (e) {}
}
/* 老档修补：LDL 拆分上线之前签的青训合同，人是直接进 LPL 一队打的。
   世界回不去了——按现实处理：你本来就一直在打一队，合同就地转正，
   薪资和违约金按一队标准上调（同 checkPromote 的口径）。 */
function fixLegacyAcad(s) {
  try {
    if (!s || !s.career || !s.contract) return;
    if (s.contract.tier !== "acad") return;
    if ((s.homeLeague || "LPL") === "LDL") return;    // 真在二队打，没问题
    s.contract.tier = "sub";
    s.contract.salary = Math.round((s.contract.salary || 20) * 2.4);
    s.contract.buyout = Math.round((s.contract.buyout || 60) * 3);
    if (s.contract.clubTier === "acad") s.contract.clubTier = "low";
    (s.events = s.events || []).push({
      s: "合同", w: 0, tone: "good", tag: "合同",
      text: "俱乐部把你的<b>青训合同转正</b>了——你本来就一直在一队打比赛。薪资和违约金按一队标准上调。"
    });
  } catch (e) {}
}
/* 老档天梯结算：段位分远高于当前实力能守住的位置（运气峰值 + 冻结太久），
   读档时先结算掉一截，之后每赛段还会继续向实力线回落（见 endSeason）。 */
function fixStaleRank(s) {
  try {
    if (!s || !s.career || !s.pre || typeof s.pre.rank !== "number") return;
    if (!s.attrs) return;
    const sk = s.attrs.操作 * 0.5 + s.attrs.运营 * 0.3 + s.attrs.心态 * 0.2;
    const hold = clamp((sk - 40) / 0.38 + 6, 0, 100);
    if (s.pre.rank > hold + 18) {
      const before = s.pre.rank;
      s.pre.rank = Math.round(hold + 10);
      (s.events = s.events || []).push({
        s: "天梯", w: 0, tone: "info", tag: "排位",
        text: "天梯结算：之前的段位是手感最好那阵冲上去的<b>峰值</b>，挂着不打是守不住的。" +
              "按你现在的实力重定到 <b>" + rankFull(s.pre.rank) + "</b>——想回去，用排位一分一分打回去。"
      });
    }
  } catch (e) {}
}
function loadGame() {
  const blob = readSave();
  if (!blob || blob.bad) return false;
  try {
    S = blob.S;
    // 存档时被剔除的弹窗字段补回空值，避免到处 undefined
    SAVE_SKIP.forEach(k => { if (S[k] === undefined) S[k] = null; });
    scrubFloats(S);
    fixLegacyAcad(S);
    fixStaleRank(S);
    if (!S.ledger && typeof initLedger === "function") initLedger();   // 老档没有流水：从下一笔开始记
    fixLegacyFame(S);
    fixLegacyForeignAch(S);
    fixLegacyAcadTier(S);
    fixScaleV2(S);
    fixLdlNames(S);
    fixWl(S);
    // 老档第一次进新版本：弹一张「本次更新」清单，指路新功能在哪。
    // 玩家原话「p0 的改动我根本没看到」——没有版本戳和更新说明，看不到是应该的。
    if (typeof GAME_VER !== "undefined" && S.patchSeen !== GAME_VER) S.patchNote = true;
    S.tab = "act";
    // 读档落在比赛中途会尴尬——回到本周界面
    if (S.step === "match") S.step = S.pre && !S.career ? "pre" : "season";
    render();
    return true;
  } catch (e) {
    return false;
  }
}

/* LDL 真名迁移（2022 LDL 春季赛真实首发，见模板里的 LDL_ROSTER）：
   老档二队还坐着「新秀林3」这类占位名——只把仍是占位名的位置换成真名，
   玩家自己、已升队/已替换的真名选手一律不碰（改名只是皮肤，数值零变化）。 */
function fixLdlNames(s) {
  try {
    if (typeof LDL_ROSTER === "undefined" || !s.world || !s.world.LDL) return;
    s.world.LDL.forEach(t => {
      const R = LDL_ROSTER[typeof teamCode === "function" ? teamCode(t.parent || "") : ""];
      if (!R) return;
      (t.players || []).forEach(p => {
        if (p.me || !/^新秀/.test(String(p.id))) return;
        const real = R.find(q => q.pos === p.pos);
        if (real) p.id = real.id;
      });
    });
  } catch (e) {}
}

/* 世界线张力（v20260902 系）：老档没有 S.wl。
   粗估当前联赛的张力 = 打过的赛段数 × 0.21（周注入的近似），其余联赛 0——
   老玩家在自己联赛留下的痕迹不该被读档抹掉。 */
function fixWl(s) {
  try {
    if (s.wl || !s.career) return;
    const splits = (s.si || 0) * 2 + (s.split || 0) + 1;
    s.wl = {};
    s.wl[s.homeLeague || "LPL"] = Math.min(1, +(0.21 * splits).toFixed(3));
  } catch (e) {}
}

/* 名气拆成粉丝＋热度之前的老档：只有 S.fame。
   粉丝直接继承那个数（尺度没变，所有门槛照旧成立）；
   热度没法从存档里还原，给一个和粉丝相称的起点，让它自己在几周内回到真实值。 */
function fixLegacyFame(s) {
  if (s.fans === undefined) s.fans = s.fame || 0;
  delete s.fame;
  if (s.heat === undefined) s.heat = Math.min(260, (s.fans || 0) * 0.12);
}

/* 「远走他乡」误发回收：旧判定把 LDL 当成外赛区，签国内青训也发这个成就。
   证据法回收——现在人在国内（LPL/LDL），且转会轨迹里从没出现过跨赛区标记
   （txNote 只在联赛变化时写「（LCK）」这类括号），就判为误发。
   徽章收回、奖励不追（几十万就当误发的签约红包），以后真出国还能重新拿。 */
function fixLegacyForeignAch(s) {
  try {
    if (!s.ach || !s.ach.foreign) return;
    const hl = s.homeLeague || "LPL";
    if (hl !== "LPL" && hl !== "LDL") return;          // 现在就在外赛区，拿得对
    const marks = /（(LCK|LEC|LCS|PCS|VCS|LJL|LLA|CBLOL|LCO|TCL|LPL)）/;
    if ((s.txLog || []).some(x => marks.test(x.text || ""))) return;   // 有跨赛区轨迹，拿得对
    delete s.ach.foreign;
    if (s.achLog) s.achLog = s.achLog.filter(x => x.id !== "foreign");
    (s.events = s.events || []).push({ s: "更正", w: s.week || 0, tone: "info", tag: "成就",
      text: `更正：<b>「远走他乡」</b>发错了——你签的是国内俱乐部的青训体系，LDL 不是外赛区。徽章收回，奖励不追；哪天真去了外赛区，它还会亮。` });
  } catch (e) {}
}

/* 青训合同的档位标签更正：老档里 A+ 试训会把青训约写成「核心首发」，
   和队伍页的「青训生·还没进名单」当面打架。只改标签，钱不动。 */
function fixLegacyAcadTier(s) {
  try {
    const c = s.contract;
    if (!c || c.clubTier !== "acad" || c.tier === "acad") return;
    c.tier = "acad";
    if (s.pendingContract && s.pendingContract.clubTier === "acad") s.pendingContract.tier = "acad";
  } catch (e) {}
}

/* 统一实力标尺迁移（2026-09-02，scaleVer 2）：
   世界整体 +15 并按赛区定锚，玩家属性 +15 保持相对位置。
   旧档的天梯读数会按新曲线自然校正（hold 回落/爬分门槛都走新函数）。
   属性超过新天花板的压回 capOf——老满级档会损失一点，事件里说明白。 */
function fixScaleV2(s) {
  try {
    if (s.scaleVer >= 2) return;
    s.scaleVer = 2;
    [s.world, s.pre && s.pre.world].filter(Boolean).forEach(w => {
      Object.keys(w).forEach(lg => {
        if (lg !== "LDL" && typeof REGION_SYN !== "undefined") {
          (w[lg] || []).forEach(t => {
            t.syn = (t.syn === undefined ? 50 : t.syn) + (REGION_SYN[lg] || 0);
            t.tac = (t.tac === undefined ? 50 : t.tac) + (REGION_SYN[lg] || 0);
          });
        }
        // LDL 没有赛区锚，按「LPL−6」的位置钉住
        if (typeof anchorLeague === "function")
          anchorLeague(lg, w[lg], lg === "LDL" ? 59 : undefined);
      });
    });
    if (s.attrs) DIMS.forEach(d => { s.attrs[d] = q1((s.attrs[d] || 40) + 15); });
    if (s.understudy && s.understudy.r) DIMS.forEach(d => { s.understudy.r[d] = q1(clamp((s.understudy.r[d] || 50) + 13, 30, 96)); });
    if (s.seasonAttr0) DIMS.forEach(d => { if (s.seasonAttr0[d] !== undefined) s.seasonAttr0[d] = q1(s.seasonAttr0[d] + 15); });
    // 属性压回新天花板（capOf 读的是 s——loadGame 里 S 已指向它）
    if (s.attrs && typeof capOf === "function") {
      DIMS.forEach(d => { try { s.attrs[d] = Math.min(s.attrs[d], capOf(d)); } catch (e) {} });
    }
    if (s.career && s.world && typeof leagueBaseline === "function") s.baseline = leagueBaseline(s.world);
    (s.events = s.events || []).push({ s: "更正", w: s.week || 0, tone: "info", tag: "版本",
      text: `<b>数值标尺统一</b>：全世界与你的属性整体 +15，赛区分层落地（LCK 66.5 / LPL 65 / 外卡 54-58），
        天梯换算改用新曲线（钻石45 · 大师55 · 宗师60 · 王者65）。你的相对实力没变，数字更像人话了。` });
  } catch (e) {}
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
    <span class="sb-t" style="margin-left:auto;opacity:.65" title="对不上这个号，说明你开的是旧版本页面">${
      typeof GAME_VER!=="undefined"?GAME_VER:""}</span>
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
function askConfirm(title, body, okText, fn, alt, tag){
  // alt 可选：{t:"按钮字", fn:()=>{}}，用在「同一件事、两种力度」的场合
  // tag 可选：给托管认领用的。托管只接管打了标记的确认框——
  //           「重开存档」这种也自动点掉就出大事了。
  S.confirm = { title, body, ok: okText || "确定", fn, alt, tag };
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
