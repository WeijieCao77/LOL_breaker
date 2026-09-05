import { DIMS, GAME_VER, LDL_ROSTER, POSN, PRE_YEAR, REGION_SYN, SEASONS, anchorLeague, capOf, clamp, leagueBaseline, q1, rankFull, render, teamCode } from "./main";
import { initLedger } from "./shop";
import { S, setS } from "./state";

/* ================= 存档 =================

   一局 80–140 分钟，刷新一下就没了是不可接受的。

   几个要点：
   · 带版本号。改了存档结构就换号，旧档不会把新代码搞崩，而是提示重开
   · 待处理的弹窗（际遇 / 更衣室 / 报名）里挂着函数，序列化不了——
     存档时剔除，读档后回到「本周」界面，那次弹窗算跳过
   · 存档失败（隐私模式、容量满）不能影响游戏，一律 try/catch 吞掉
   · 提供手动导出/导入，方便测试者把坏档发回来                        */

export const SAVE_KEY = "pojuzhe_save_v1";
export const SAVE_VER = 4;                 // 存档结构版本；改结构就 +1

/* 这些字段挂着函数或临时 UI 状态，不进存档 */
export const SAVE_SKIP = ["locker", "rndEv", "signup", "rankUp", "rndResult",
                   "cupResult", "cupMatch", "showStart", "match", "confirm"];

export function saveGame(reason) {
  try {
    if (!S || S.step === "create") return false;
    const data = {};
    Object.keys(S).forEach(k => { if (!SAVE_SKIP.includes(k)) data[k] = S[k]; });
    const blob = { ver: SAVE_VER, at: Date.now(), reason: reason || "",
                   gameVer: GAME_VER, S: data };
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
export function migrate(blob) {
  // 全年连续周数是后加的字段。老存档没有它，读回来会又显示「第 1 周」，
  // 看着像时间倒流——正是这个改动要解决的问题。
  // 已经签约的档推不出当年在职业前用掉几周，按整年估（多数人打满），
  // 这个值纯粹用于显示，不影响任何机制。
  if (blob.S && blob.S.career && blob.S.yearBase === undefined) {
    blob.S.yearBase = PRE_YEAR;
  }
  if (blob.ver === 3) {
    const s = blob.S;
    if (s.step === "pre" && typeof s.age === "number") s.age += 1;
    blob.ver = 4;
  }
  return blob;
}
export function readSave() {
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
export function hasSave() { const b = readSave(); return !!(b && !b.bad); }
export function dropSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

/* 老存档里攒下的浮点尾巴（47.60402559999999 这种）一次性抹平。
   新代码在写入处已经 q1 了，这里只为已经存坏的档做一次清洗。 */
export function scrubFloats(s) {
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
export function fixLegacyAcad(s) {
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
export function fixStaleRank(s) {
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
export function loadGame() {
  const blob = readSave();
  if (!blob || blob.bad) return false;
  try {
    setS(blob.S);
    // 存档时被剔除的弹窗字段补回空值，避免到处 undefined
    SAVE_SKIP.forEach(k => { if (S[k] === undefined) S[k] = null; });
    scrubFloats(S);
    fixLegacyAcad(S);
    fixStaleRank(S);
    if (!S.ledger && true) initLedger();   // 老档没有流水：从下一笔开始记
    fixLegacyFame(S);
    fixLegacyForeignAch(S);
    fixLegacyAcadTier(S);
    fixScaleV2(S);
    fixSeasonAttr0(S);
    fixLdlNames(S);
    fixWl(S);
    fixScaleV3(S);
    fixScaleV4(S);
    relinkMe(S);
    // 老档进新版本不再弹「本次更新」（玩家 2026-09-06 实锤：它盖住了教程导览）——
    // 只在右下角 📜 上打个点，玩家自己点开才看（见 audio.js 的 logBadge）
    S.patchSeen = GAME_VER;
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
export function fixLdlNames(s) {
  try {
    if (!s.world || !s.world.LDL) return;
    s.world.LDL.forEach(t => {
      const R = LDL_ROSTER[teamCode(t.parent || "")];
      if (!R) return;
      (t.players || []).forEach(p => {
        if (p.me || !/^新秀/.test(String(p.id))) return;
        const real = R.find(q => q.pos === p.pos);
        if (real) p.id = real.id;
      });
    });
  } catch (e) {}
}

/* 统一实力尺（v20260905c）：试训的「你现在」从操作加权换成五维均值，同一个人低 2 左右，
   各档 expect 同步 −2。老档里已经发出的邀请/正在进行的试训/挂着的报价还带着旧 expect，
   这里补齐——否则老玩家正在走的那次试训会平白难 2 分。属性、世界、天梯读数都不动。 */
export function fixScaleV3(s) {
  try {
    if (!s || s.scaleV3) return;
    s.scaleV3 = 1;
    const adj = o => { if (o && typeof o.expect === "number") o.expect = Math.max(40, o.expect - 2); };
    if (s.pre) adj(s.pre.invite);
    adj(s.tryout); adj(s.deal);
  } catch (e) {}
}

/* 名单里的「你」重新挂回 S.attrs。代码里到处是 {me:true, r:S.attrs}——同一个对象的引用，
   但存档一 JSON 化就变成两份拷贝，读回来之后名单里那份永远停在存档那一刻：
   队伍页显示 53、我的页 61（玩家实锤），战力也按旧数算。读档后统一重挂。 */
export function relinkMe(s) {
  try {
    if (!s || !s.attrs) return;
    [s.world, s.pre && s.pre.world].filter(Boolean).forEach(w => Object.keys(w).forEach(lg =>
      (w[lg] || []).forEach(t => (t.players || []).forEach(p => { if (p && p.me) p.r = s.attrs; }))));
  } catch (e) {}
}

/* 全体系 +5（v20260905d，玩家拍板「LPL 首发整体进国服前 100、明星 85-90、玩家极限 95+」）：
   世界、你的属性、替补对位、车队路人、在途期望值一起 +5——所有差值不变，老档读回来胜率一分不动；
   上限由 capOf（新公式 60+4t）管，属性不会超过它。 */
export function fixScaleV4(s) {
  try {
    if (!s || s.scaleV4) return;
    s.scaleV4 = 1;
    const up = (r, hi?) => { if (!r) return; DIMS.forEach(d => { if (typeof r[d] === "number") r[d] = q1(Math.min(r[d] + 5, hi || 99)); }); };
    [s.world, s.pre && s.pre.world].filter(Boolean).forEach(w => Object.keys(w).forEach(lg =>
      (w[lg] || []).forEach(t => (t.players || []).forEach(p => { if (!p.me && p.r) up(p.r); }))));
    if (s.attrs) up(s.attrs, 200);
    if (s.seasonAttr0) up(s.seasonAttr0, 200);
    if (s.understudy && s.understudy.r) up(s.understudy.r);
    if (s.pre && Array.isArray(s.pre.mates)) s.pre.mates.forEach(m => m && up(m.r));
    const adj = o => { if (o && typeof o.expect === "number") o.expect += 5; };
    if (s.pre) adj(s.pre.invite);
    adj(s.tryout); adj(s.deal);
    if (s.attrs && true)
      DIMS.forEach(d => { try { s.attrs[d] = Math.min(s.attrs[d], capOf(d)); } catch (e) {} });
    if (s.career && s.world && true) s.baseline = leagueBaseline(s.world);
    (s.events = s.events || []).push({ s: "版本", w: s.week || 0, tone: "info", tag: "版本",
      text: "<b>实力尺顶端拉开</b>：全世界与你的属性整体 +5——LPL 首发整体进国服前 100、明星 85-90、你的上限抬到 95+。所有差值不变，比赛胜率一分没动。" });
  } catch (e) {}
}

/* 世界线张力（v20260902 系）：老档没有 S.wl。
   粗估当前联赛的张力 = 打过的赛段数 × 0.21（周注入的近似），其余联赛 0——
   老玩家在自己联赛留下的痕迹不该被读档抹掉。 */
export function fixWl(s) {
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
export function fixLegacyFame(s) {
  if (s.fans === undefined) s.fans = s.fame || 0;
  delete s.fame;
  if (s.heat === undefined) s.heat = Math.min(260, (s.fans || 0) * 0.12);
}

/* 「远走他乡」误发回收：旧判定把 LDL 当成外赛区，签国内青训也发这个成就。
   证据法回收——现在人在国内（LPL/LDL），且转会轨迹里从没出现过跨赛区标记
   （txNote 只在联赛变化时写「（LCK）」这类括号），就判为误发。
   徽章收回、奖励不追（几十万就当误发的签约红包），以后真出国还能重新拿。 */
export function fixLegacyForeignAch(s) {
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
export function fixLegacyAcadTier(s) {
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
/* 世界是不是已经在新标尺上：新标尺的 LPL 五维均值锚在 65 附近（+成长），
   旧标尺的世界是数据原值 ~53、五年成长后也不过 ~58。61 是一条干净的分界。 */
export function worldOnNewScale(s) {
  try {
    const w = (s.world && s.world.LPL) || (s.pre && s.pre.world && s.pre.world.LPL);
    if (!w || !w.length) return false;
    const ps = []; w.forEach(t => (t.players || []).forEach(p => { if (!p.me && p.r) ps.push(p); }));
    if (!ps.length) return false;
    const m = ps.reduce((a, p) => a + DIMS.reduce((x, d) => x + (p.r[d] || 50), 0) / DIMS.length, 0) / ps.length;
    return m >= 61;
  } catch (e) { return false; }
}
export function fixScaleV2(s) {
  try {
    if (s.scaleVer >= 2) return;
    /* 审计 P0（2026-09-02）：v20260902a 之后新开的局没写 scaleVer，第一次读档被当成
       老档整体 +15、世界重新定锚——每个新档都中招。新档现在自带 scaleVer/born；
       没有这两个字段的档再看世界本身：已经在新标尺上的一律不迁移。 */
    if (s.born || worldOnNewScale(s)) { s.scaleVer = 2; return; }
    s.scaleVer = 2;
    [s.world, s.pre && s.pre.world].filter(Boolean).forEach(w => {
      Object.keys(w).forEach(lg => {
        if (lg !== "LDL" && true) {
          (w[lg] || []).forEach(t => {
            t.syn = (t.syn === undefined ? 50 : t.syn) + (REGION_SYN[lg] || 0);
            t.tac = (t.tac === undefined ? 50 : t.tac) + (REGION_SYN[lg] || 0);
          });
        }
        // LDL 没有赛区锚，按「LPL−6」的位置钉住
        anchorLeague(lg, w[lg], lg === "LDL" ? 64 : undefined);   // 全体系 +5 后的 LDL 位置
      });
    });
    // 世界已按 +5 后的新锚定位，玩家侧这里一次到位（+15 旧迁移 +5 本轮），V4 不再重复
    s.scaleV4 = 1;
    if (s.attrs) DIMS.forEach(d => { s.attrs[d] = q1((s.attrs[d] || 40) + 20); });
    if (s.understudy && s.understudy.r) DIMS.forEach(d => { s.understudy.r[d] = q1(clamp((s.understudy.r[d] || 50) + 18, 35, 99)); });
    if (s.seasonAttr0) DIMS.forEach(d => { if (s.seasonAttr0[d] !== undefined) s.seasonAttr0[d] = q1(s.seasonAttr0[d] + 20); });
    // 属性压回新天花板（capOf 读的是 s——loadGame 里 S 已指向它）
    if (s.attrs && true) {
      DIMS.forEach(d => { try { s.attrs[d] = Math.min(s.attrs[d], capOf(d)); } catch (e) {} });
    }
    if (s.career && s.world && true) s.baseline = leagueBaseline(s.world);
    (s.events = s.events || []).push({ s: "更正", w: s.week || 0, tone: "info", tag: "版本",
      text: `<b>数值标尺统一</b>：全世界与你的属性整体 +15，赛区分层落地（LCK 66.5 / LPL 65 / 外卡 54-58），
        天梯换算改用新曲线（钻石45 · 大师55 · 宗师60 · 王者65）。你的相对实力没变，数字更像人话了。` });
  } catch (e) {}
}

/* 被误迁移过的档：seasonAttr0 可能高于当前属性，赛季成长显示成负数。只修显示基线。 */
export function fixSeasonAttr0(s) {
  try {
    if (!s.seasonAttr0 || !s.attrs) return;
    DIMS.forEach(d => { if (typeof s.seasonAttr0[d] === "number" && s.seasonAttr0[d] > s.attrs[d]) s.seasonAttr0[d] = s.attrs[d]; });
  } catch (e) {}
}

/* ---------- 导入存档的消毒 ----------
   存档里的日志、事件本来就是带 HTML 的字符串，读回来直接 innerHTML。
   别人给的文件可能夹带 <img onerror=…> 这类东西——CSP 已经不让它跑，
   这里再把明显的脚本载体剥掉一遍，两道闸。 */
/* 存档里的文字会被拼进 innerHTML（战报、新闻、试训日志……游戏自己写的只有 div / span / b 和 class="hi|w|l"、
   color:var(--xx) 这一种内联色）。原来是黑名单——script / iframe / on* 去掉，别的都放行，
   一份恶意存档仍能塞 <a href> / 外链 <img> / 任意 style 把界面盖掉（外部审计）。改成白名单：
   只留几个排版标签，属性只留 class（字母数字）和 color:var(--…) 这一种 style；
   <img> 单独放行——段位徽章、队标、像素头像都是游戏自己写进战报的 data:image/…;base64 内嵌图，
   只认这种 src（外链、javascript: 一律整个去掉），属性只留 class / width / height / alt。 */
export const SAVE_TAGS = /^(div|span|b|i|em|strong|small|br|u|s|p|sub|sup)$/;
export const SAVE_IMG_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;
export function attrOf(attrs, name) {
  const m = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(attrs);
  return m ? (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || "") : "";
}
export function sanitizeTag(m, close, tag, attrs) {
  tag = tag.toLowerCase();
  if (tag === "img") {
    if (close) return "";
    const src = attrOf(attrs, "src").trim();
    if (!SAVE_IMG_SRC.test(src)) return "";
    let out = "<img";   // 属性按游戏自己写的顺序（class, src, width, height, alt）输出：自己导出的存档导回来一字不改
    const cv = attrOf(attrs, "class"); if (cv && /^[\w -]{1,80}$/.test(cv)) out += ' class="' + cv + '"';
    out += ' src="' + src + '"';
    ["width", "height"].forEach(k => { const v = attrOf(attrs, k); if (/^\d{1,4}$/.test(v)) out += " " + k + '="' + v + '"'; });
    const alt = attrOf(attrs, "alt"); if (/^[^"'<>\\&]{0,80}$/.test(alt)) out += ' alt="' + alt + '"';
    const sv = attrOf(attrs, "style").trim();   // 像素头像那一种内联样式（avatar.js）原样放行，别的不要
    if (/^vertical-align:middle;border-radius:50%;image-rendering:pixelated;border:1px solid var\(--(gold|line)\);?$/.test(sv)) out += ' style="' + sv + '"';
    return out + ">";
  }
  if (!SAVE_TAGS.test(tag)) return "";
  if (close) return "</" + tag + ">";
  let out = "<" + tag;
  const cv = attrOf(attrs, "class");
  if (cv && /^[\w -]{1,80}$/.test(cv)) out += ' class="' + cv + '"';
  const sv = attrOf(attrs, "style").trim();
  if (sv && /^color:\s*var\(--[a-z0-9-]{1,32}\);?$/.test(sv)) out += ' style="' + sv + '"';
  return out + ">";
}
export function sanitizeSave(v, depth?) {
  depth = depth || 0;
  if (depth > 40) return null;
  if (typeof v === "string") {
    if (v.length > 200000) v = v.slice(0, 200000);
    return v
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")   // 脚本 / 样式块连内容一起去掉
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[!?][^>]*>/g, "")
      .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, sanitizeTag);
  }
  if (Array.isArray(v)) return v.map(x => sanitizeSave(x, depth + 1));
  if (v && typeof v === "object") {
    const o = {};
    Object.keys(v).forEach(k => { if (k !== "__proto__" && k !== "constructor" && k !== "prototype") o[k] = sanitizeSave(v[k], depth + 1); });
    return o;
  }
  return v;
}

/* ---------- 老域名存档接力 ----------
   正式地址统一成 www.poxiao.lol 之后，裸域名 / Railway 域名上的 localStorage 存档
   不能就这么丢。www 页面加载时用隐藏 iframe 打开老域名的 /xfer，那边把存档
   postMessage 过来（server.js 只让 www 嵌它）；谁新用谁，一个会话只拉一次。 */
export const XFER_FROM = ["https://poxiao.lol", "https://lol-breaker-production.up.railway.app"];
export function xferPull() {
  try {
    if (location.protocol !== "https:" || location.hostname !== "www.poxiao.lol") return;
    if (sessionStorage.getItem("pojuzhe_xfer_done")) return;
    const localAt = () => { const b = readSave(); return (b && !b.bad && typeof b.at === "number") ? b.at : 0; };
    let pending = XFER_FROM.length, got = false;
    const frames = [];
    const finish = () => {
      frames.forEach(f => { try { f.remove(); } catch (e) {} });
      window.removeEventListener("message", onMsg);
      try { sessionStorage.setItem("pojuzhe_xfer_done", "1"); } catch (e) {}
      if (got && S && S.step === "create") render();
    };
    const onMsg = ev => {
      if (!XFER_FROM.includes(ev.origin) || !ev.data || ev.data.t !== "poxiao-xfer") return;
      pending--;
      const raw = ev.data.raw;
      if (typeof raw === "string" && raw.length < 8e6) {
        try {
          let blob = JSON.parse(raw);
          if (blob && blob.S && typeof blob.at === "number") {
            blob = migrate(sanitizeSave(blob));
            if (blob.ver === SAVE_VER && blob.S.step && blob.S.attrs && blob.at > localAt()) {
              localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
              got = true;
            }
          }
        } catch (e) {}
      }
      if (pending <= 0) finish();
    };
    window.addEventListener("message", onMsg);
    XFER_FROM.forEach(o => {
      const f = document.createElement("iframe");
      f.style.display = "none"; f.setAttribute("aria-hidden", "true");
      f.setAttribute("sandbox", "allow-scripts allow-same-origin");
      f.src = o + "/xfer";
      document.body.appendChild(f); frames.push(f);
    });
    setTimeout(finish, 8000);
  } catch (e) {}
}

/* 存档时间的人话 */
export function saveAgeText(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + " 分钟前";
  const h = Math.round(m / 60);
  if (h < 24) return h + " 小时前";
  return Math.round(h / 24) + " 天前";
}
/* 存档里的进度摘要，让玩家确认是不是自己那一局 */
export function saveSummary(s) {
  try {
    const sea = (SEASONS[s.si]) ? SEASONS[s.si].tag : "S12";
    const who = (s.name || "无名") + " · " + (POSN[s.pos] || "");
    if (!s.career) return `${who} · ${sea} 职业前 第 ${s.pre ? s.pre.week : 1} 周`;
    const t = (s.career.titles || []).length;
    return `${who} · ${sea} · ${s.team || "无队"}${t ? " · 冠军 " + t : ""}`;
  } catch (e) { return "存档"; }
}

/* ---------- 界面 ---------- */
/* 捏人页顶部：有档就先问要不要继续 */
export function continueCard() {
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
export function saveBar() {
  if (!S || S.step === "create") return "";
  const b = readSave();
  return `<div class="savebar">
    <span class="sb-t">存档 ${b && !b.bad ? saveAgeText(b.at) : "尚未保存"}</span>
    <button class="rt-x" id="savenow">立即保存</button>
    <button class="rt-x" id="saveexp">导出</button>
    <button class="rt-x" id="saveimp">导入</button>
    <button class="rt-x" id="saverst">重开</button>
    <span class="sb-t" style="margin-left:auto;opacity:.65" title="对不上这个号，说明你开的是旧版本页面">${
      GAME_VER}</span>
  </div>`;
}
export function exportSave() {
  saveGame("手动导出");
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    a.download = "破晓存档.json";
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {}
}
/* 导入前先看大小：一整局跑完的存档约 0.5 MB，8 MB 以上不是存档——超大 JSON 一 parse 整页冻住 */
export const IMPORT_MAX = 8 * 1024 * 1024;
export const SAVE_STEPS = ["create", "pre", "offer", "season", "prep", "match", "offseason", "end"];
/* 结构校验：阶段得是认识的，五维得是 0–100 的数——消毒只管标签，管不了「attrs 是个字符串」这种 */
export function saveShapeOk(blob) {
  try {
    const s = blob.S;
    if (!s || typeof s !== "object" || SAVE_STEPS.indexOf(s.step) < 0) return false;
    if (!s.attrs || typeof s.attrs !== "object") return false;
    const dims = (DIMS) ? DIMS : Object.keys(s.attrs);
    return dims.every(d => { const v = s.attrs[d]; return typeof v === "number" && isFinite(v) && v >= 0 && v <= 100; });
  } catch (e) { return false; }
}
export function importSave() {
  try {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (typeof f.size === "number" && f.size > IMPORT_MAX) { alert("文件太大，不像是存档。"); return; }
      const rd = new FileReader();
      rd.onload = () => {
        try {
          if (typeof rd.result === "string" && rd.result.length > IMPORT_MAX) { alert("文件太大，不像是存档。"); return; }
          let blob = JSON.parse(rd.result as string);
          if (!blob || typeof blob !== "object" || !blob.S || typeof blob.S !== "object") { alert("这个文件不像是存档。"); return; }
          blob = migrate(sanitizeSave(blob));
          if (blob.ver !== SAVE_VER) { alert("存档版本不符，读不了。"); return; }
          if (!saveShapeOk(blob)) { alert("存档内容缺失或异常。"); return; }
          if (typeof blob.at !== "number") blob.at = Date.now();
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
export function escapeHtml(v){
  if(v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
/* 玩家名字的统一出口：空名字有兜底，且一定转义 */
export function meName(){ return escapeHtml(S && S.name ? S.name : "你"); }
/* 名字会被存进队伍名单、再被十几个地方拼进 innerHTML。
   与其追着每个显示点转义，不如在唯一的入口就把危险字符挡掉——
   这是比赛服 ID，本来也不该有尖括号。 */
export function safeName(v){
  // 白名单比黑名单省心：ID 本来就只该是字母、数字、汉字和几个连接符
  return String(v == null ? "" : v)
    .replace(/[^\w一-龥぀-ヿ .\-]/g, "")
    .trim().slice(0, 12);
}

/* 通用确认框。用在那些「按下去就回不来」的操作上：
   自动推进、重开档、覆盖存档。 */
export function askConfirm(title, body, okText, fn, alt?, tag?){
  // alt 可选：{t:"按钮字", fn:()=>{}}，用在「同一件事、两种力度」的场合
  // tag 可选：给托管认领用的。托管只接管打了标记的确认框——
  //           「重开存档」这种也自动点掉就出大事了。
  S.confirm = { title, body, ok: okText || "确定", fn, alt, tag };
  render();
}
export function confirmCard(){
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
