import { ACHIEVEMENTS, hasAch } from "./achieve";
import { AGES, POS, SEASONS, ending } from "./main";
import { escapeHtml, safeName } from "./save";
import { S } from "./state";

/* ================= 成就殿堂（跨存档）=================
   作者拍板（2026-09-11，策划稿「A + B」）：成就原来只活在存档里——
   重开、开新档、「放弃并重开」、结局页「再开一局」都把 S.ach 清空，
   打过好几局的人，成就页永远只有一局的量。

   殿堂是存档之外单独的一条 localStorage 记录，新档只继承它：
   · 每一项成就第一次在哪一局、哪个 ID、哪个赛季、哪天解锁，一共几局拿到过
   · 奖励一分不变：照旧在「这一局」解锁时发，新档从零开始、回报再给一次（作者选的「每局都发」）。
     殿堂本身不给任何数值；「收藏家」「打透了」也只数这一局（它们读的还是 S.ach）
   · localStorage 随时可能抛（隐私模式 / 禁用存储 / 容量满）——读不到就当没有殿堂，游戏照跑

   记录格式（HALL_KEY，一段 JSON）：
     { v:1,
       a:    { 成就id: { at 首次解锁的时间戳, who 当时的 ID, s 当时的赛季, n 几局拿到过, ids 拿到过它的存档编号（最近 40 个） } },
       pos:  { 位置: 首次标记 }        签过职业合同的位置（殿堂专属「五个位置」）
       lg:   { 赛区代码: 首次标记 }    自己拿下过联赛冠军的赛区（「走遍三大赛区」）
       end:  { 结局名: 首次标记 }      打出过的结局，ending().n（「两种结局」）
       ages: { 开局年龄: 首次标记 }    打完的生涯是几岁开局的（「少年与老将」）
       x:    { 殿堂专属id: 首次标记 } }
     首次标记 = { at, who, s }。
   「几局」按存档编号去重：同一局读档重来、导入同一份存档，都不会多算一局。 */

export const HALL_KEY = "poxiao_ach_hall_v1";
/* 每项成就只留最近 40 个存档编号：101 项 × 40 个号也就几十 KB。
   超过 40 局之后，一个很早的档再被读回来可能会多算一局——换来的是殿堂不会把 localStorage 撑满（存档本身要 0.5 MB） */
const HALL_IDS_CAP = 40;
const SAVE_ID_RE = /^[\w.-]{1,40}$/;
/* 事实表的键各自只认一种写法（导入的文件是别人给的数据）：位置是那五个，赛区是代码，结局是中文名，年龄是两位数 */
const HALL_FACTS = {
  pos: k => POS.some(p => p.k === k),
  lg: k => /^[A-Z]{2,6}$/.test(k),
  end: k => /^[一-鿿]{2,8}$/.test(k),
  ages: k => /^\d{2}$/.test(k),
  x: k => HALL_X.some(x => x.id === k)
};

export function hallEmpty(): any { return { v: 1, a: {}, pos: {}, lg: {}, end: {}, ages: {}, x: {} }; }

/* 殿堂有没有变过：只有变了才重判殿堂专属那几项（checkAch 每场比赛、每次训练都会走一遍，不能每次都读 localStorage） */
let _dirty = false;

/* 读：null 只表示「这台设备存不了」；记录坏了（半截 JSON）按空殿堂重来，别让一条坏记录永远卡住 */
export function hallRead(): any {
  let raw = null;
  try { raw = localStorage.getItem(HALL_KEY); } catch (e) { return null; }
  if (!raw) return hallEmpty();
  try { return hallClean(JSON.parse(raw)); } catch (e) { return hallEmpty(); }
}
export function hallWrite(h): boolean {
  try { localStorage.setItem(HALL_KEY, JSON.stringify(h)); _dirty = true; return true; } catch (e) { return false; }
}

const achIds = () => new Set(ACHIEVEMENTS.map(a => a.id));
/* 首次标记：时间、ID、赛季。ID 走 safeName 白名单（和建档时同一道闸），赛季只认 S12 这种写法 */
function cleanMark(m): any {
  if (!m || typeof m !== "object") return null;
  const at = Number(m.at);
  if (!isFinite(at) || at <= 0) return null;
  return { at: Math.round(at), who: safeName(m.who), s: (typeof m.s === "string" && /^S\d{1,2}$/.test(m.s)) ? m.s : "" };
}
/* 殿堂会从导入的文件里来——当成别人给的数据洗一遍：只留认识的成就、合法的键和数，其余丢掉 */
export function hallClean(raw): any {
  const h = hallEmpty();
  if (!raw || typeof raw !== "object") return h;
  const ids = achIds(), src = (raw.a && typeof raw.a === "object") ? raw.a : {};
  Object.keys(src).forEach(id => {
    if (!ids.has(id)) return;
    const m = cleanMark(src[id]); if (!m) return;
    const sids = (Array.isArray(src[id].ids) ? src[id].ids : []).filter(x => typeof x === "string" && SAVE_ID_RE.test(x));
    const uniq = sids.filter((x, i) => sids.indexOf(x) === i).slice(-HALL_IDS_CAP);
    const n = Math.max(1, uniq.length, Math.min(99999, Math.floor(Number(src[id].n) || 0)));
    h.a[id] = Object.assign(m, { n, ids: uniq });
  });
  Object.keys(HALL_FACTS).forEach(key => {
    const from = raw[key];
    if (!from || typeof from !== "object") return;
    Object.keys(from).forEach(k => { if (!HALL_FACTS[key](k)) return; const m = cleanMark(from[k]); if (m) h[key][k] = m; });
  });
  return h;
}

/* ---------- 存档编号 ----------
   新档开局时发一个（startPre）。用 Math.random 不用 rnd()：rnd() 是这一局的随机序列，
   多取一次数整局就换了一条路（批测基线全废）——编号和「统计设备号」一样属于界面自己的随机。 */
export function newSaveId(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 2176782336).toString(36);
}
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
/* 老档没有编号：拿开局时就定死、之后不再变的字段算一个。
   同一个老档在封面上被看到、被读档、被老域名接力过来，算出来都是同一个号——殿堂不会把它记成好几局。
   名字会被「改名」改掉，所以只在连种子都没有的远古存档里才拿它凑数。 */
export function saveIdOf(s): string {
  if (!s || typeof s !== "object") return "";
  if (typeof s.saveId === "string" && SAVE_ID_RE.test(s.saveId)) return s.saveId;
  const noSeed = typeof s.seed !== "number";
  return "L" + fnv(JSON.stringify([noSeed ? null : s.seed, s.born || "", s.pos || "", s.origin || "", s.ageIdx == null ? null : s.ageIdx, s.bgPick || "", noSeed ? (s.name || "") : ""]));
}

/* ---------- 写入 ---------- */
export function hallMark(at?: number): any {
  return { at: at || Date.now(), who: safeName(S && S.name), s: (S && SEASONS[S.si]) ? SEASONS[S.si].tag : "" };
}
/* 往殿堂里记一项：没有就新建；有了就只看两件事——
   ① 这次是不是更早（首次解锁永远记最早那一次，导入 / 读老档时会遇到）
   ② 这个存档记过没有（换一局再解锁才算「又一局」） */
function hallAddAch(h, id, m, sid): boolean {
  const r = h.a[id];
  if (!r) { h.a[id] = Object.assign({}, m, { n: 1, ids: sid ? [sid] : [] }); return true; }
  let ch = false;
  if (m.at < r.at) { r.at = m.at; r.who = m.who; r.s = m.s; ch = true; }
  if (sid && r.ids.indexOf(sid) < 0) { r.ids = r.ids.concat([sid]).slice(-HALL_IDS_CAP); r.n = (r.n || 0) + 1; ch = true; }
  return ch;
}
function hallAddFact(h, key, k, m): boolean {
  if (!k || !HALL_FACTS[key](k)) return false;
  const r = h[key][k];
  if (r && r.at <= m.at) return false;
  h[key][k] = Object.assign({}, m);
  return true;
}
/* 这一局刚解锁了 id（checkAchBase 调）。返回弹窗该写哪句：「殿堂首次」/「殿堂里已有」；存不了殿堂就 null，弹窗照旧 */
export function hallNoteAch(id): "first" | "had" | null {
  try {
    const h = hallRead(); if (!h) return null;
    const had = !!h.a[id];
    if (!S.saveId) S.saveId = saveIdOf(S);   // 没走 startPre 的档（老档读进来之前的中间态、测试里手搭的局）先补一个号
    if (hallAddAch(h, id, hallMark(), S.saveId)) hallWrite(h);
    return had ? "had" : "first";
  } catch (e) { return null; }
}
/* 殿堂专属要的事实，跟着成就钩子一起记（checkAch 调）：
   签约（第一份合同和之后的转会都算签过这个位置）→ 位置；自己拿下联赛冠军 → 那个赛区。 */
export function hallObserve(on): void {
  try {
    const key = on === "sign" ? "pos" : on === "lgtitle" ? "lg" : "";
    if (!key) return;
    const k = key === "pos" ? S.pos : (S.homeLeague || "LPL");
    const h = hallRead(); if (!h || h[key][k]) return;
    if (hallAddFact(h, key, k, hallMark())) hallWrite(h);
  } catch (e) {}
}
/* 生涯结束（进结局页的那三处：退役、收官、自由身走到时间尽头）：记下结局名和这一局几岁开局。
   结局名读 ending()——和结局页、批测输出同一个函数，同一个名字 */
function startAgeOf(s): number {
  const a = s && s.ageCfg && s.ageCfg.a;
  if (typeof a === "number") return a;
  const A = AGES[s && s.ageIdx];
  return A ? A.a : 0;
}
export function hallCareerEnd(): void {
  try {
    const h = hallRead(); if (!h) return;
    const m = hallMark(), e = ending(), age = startAgeOf(S);
    let ch = false;
    if (e && hallAddFact(h, "end", e.n, m)) ch = true;
    if (age && hallAddFact(h, "ages", String(age), m)) ch = true;
    if (ch) hallWrite(h);
    hallSweep();
  } catch (e) {}
}
/* 从一份存档把已经解锁的成就补记进殿堂：老版本存下的档第一次被读 / 出现在封面上、老域名接力来的档。
   时间只能用存档时间（s.at 那一刻它们肯定已经解锁了），赛季从 achLog 里找。
   殿堂专属要的事实能从存档里读出来的也补上：签过约就记位置；自己拿下的联赛冠军按赛区记——
   S.career.titles 里联赛冠军写作「S13 LCK春季赛」（随队冠军另记在 ringTitles，不算）。
   结局和开局年龄没法补：打完的那几局早就被覆盖了。返回殿堂有没有变。 */
export function hallSeedFrom(s, at?: number): boolean {
  try {
    if (!s || typeof s !== "object") return false;
    const h = hallRead(); if (!h) return false;
    const sid = saveIdOf(s), ids = achIds(), log = Array.isArray(s.achLog) ? s.achLog : [];
    const when = (typeof at === "number" && at > 0) ? at : Date.now(), who = safeName(s.name);
    const ach = (s.ach && typeof s.ach === "object") ? s.ach : {};
    let ch = false;
    Object.keys(ach).forEach(id => {
      if (!ach[id] || !ids.has(id)) return;
      const row = log.find(x => x && x.id === id);
      const sea = (row && typeof row.s === "string" && /^S\d{1,2}$/.test(row.s)) ? row.s : "";
      if (hallAddAch(h, id, { at: when, who, s: sea }, sid)) ch = true;
    });
    const C = s.career || s.careerBak;
    if (C && !h.pos[s.pos] && hallAddFact(h, "pos", s.pos, { at: when, who, s: "" })) ch = true;
    (C && Array.isArray(C.titles) ? C.titles : []).forEach(t => {
      const m = /^(S\d{1,2}) ([A-Z]{2,6})(春季赛|夏季赛)$/.exec(String(t));
      if (m && !h.lg[m[2]] && hallAddFact(h, "lg", m[2], { at: when, who, s: m[1] })) ch = true;
    });
    if (ch) hallWrite(h);
    return ch;
  } catch (e) { return false; }
}
/* 导入：和这台设备上的殿堂取并集，永远不覆盖——首次解锁记最早的那一次，几局按编号去重再和两边各自记的数取大；
   事实表同理，每个键留最早那一次 */
export function hallMerge(into, from): any {
  Object.keys(from.a || {}).forEach(id => {
    const f = from.a[id], r = into.a[id];
    if (!r) { into.a[id] = { at: f.at, who: f.who, s: f.s, n: f.n, ids: f.ids.slice() }; return; }
    const all = r.ids.concat(f.ids.filter(x => r.ids.indexOf(x) < 0));
    if (f.at < r.at) { r.at = f.at; r.who = f.who; r.s = f.s; }
    r.n = Math.max(r.n || 1, f.n || 1, all.length);
    r.ids = all.slice(-HALL_IDS_CAP);
  });
  Object.keys(HALL_FACTS).forEach(key => Object.keys(from[key] || {}).forEach(k => hallAddFact(into, key, k, from[key][k])));
  return into;
}
export function hallImport(raw): boolean {
  try {
    const h = hallRead(); if (!h) return false;
    hallMerge(h, hallClean(raw));
    return hallWrite(h);
  } catch (e) { return false; }
}

/* ================= 殿堂专属成就 =================
   作者批 B（2026-09-11）：只在殿堂里算、可以分几局凑齐的一小组目标。
   不进那 101 项（「收藏家」「打透了」不数它们），没有任何数值奖励——回报是一个称号：
   封面存档卡上写最近拿到的那一个，生涯名片上带一个小徽章。
   判定只读殿堂自己记的事实，不读 S：换了几局、导入过别的设备的殿堂，结果都一样。 */
const LG3 = ["LPL", "LCK", "LEC"];
export const HALL_X: any[] = [
  {id:"hx_pos5", n:"五个位置", d:"上单、打野、中单、AD、辅助，每个位置都签过职业合同——可以分几局完成。",
   flavor:"别人问你打什么位置，你想了很久。",
   cond:h=>POS.every(p=>h.pos[p.k]), prog:h=>`签过 ${POS.filter(p=>h.pos[p.k]).length} / 5 个位置`},
  {id:"hx_lg3", n:"走遍三大赛区",
   d:"在 LPL、LCK、LEC 各拿下过一座联赛冠军——可以分几局完成。",
   flavor:"三种语言的冠军采访，你都站在台上听过。",
   cond:h=>LG3.every(k=>h.lg[k]), prog:h=>LG3.map(k=>k+(h.lg[k]?" ✓":" —")).join(" · ")},
  {id:"hx_half", n:"殿堂半满", d:"殿堂里集齐 50 项成就。",
   cond:h=>hallCount(h)>=50, prog:h=>`${Math.min(hallCount(h),50)} / 50`},
  {id:"hx_most", n:"殿堂将满", d:"殿堂里集齐 80 项成就。",
   cond:h=>hallCount(h)>=80, prog:h=>`${Math.min(hallCount(h),80)} / 80`},
  {id:"hx_all", n:"全成就", d:"殿堂里集齐全部成就。", flavor:"每一种活法，你都活过一遍。",
   cond:h=>hallCount(h)>=ACHIEVEMENTS.length, prog:h=>`${hallCount(h)} / ${ACHIEVEMENTS.length}`},
  {id:"hx_end2", n:"两种结局", d:"「破局者」和「王朝」两个结局都打出来过（「传奇」不算其中任何一个）。", flavor:"砸开至暗的人，和建起王朝的人，都是你。",
   cond:h=>!!(h.end["破局者"]&&h.end["王朝"]), prog:h=>["破局者","王朝"].map(k=>k+(h.end[k]?" ✓":" —")).join(" · ")},
  {id:"hx_ages", n:"少年与老将", d:"17 岁开局的生涯和 21 岁开局的生涯，各打完一局。", flavor:"十七岁的手，二十一岁的脑子。",
   cond:h=>!!(h.ages["17"]&&h.ages["21"]), prog:h=>["17","21"].map(k=>`${k} 岁`+(h.ages[k]?" ✓":" —")).join(" · ")}
];
function hallXOk(x, h): boolean { try { return !!x.cond(h); } catch (e) { return false; } }
/* 殿堂一变就重判殿堂专属：新达成的记进殿堂、排进成就弹窗（和普通成就同一个队列，一个个弹）。
   先写殿堂再弹——写不进去就不弹，下次殿堂再变时还会判到它。force：测试里手动改了殿堂记录时用 */
export function hallSweep(force?: boolean): void {
  if (!_dirty && !force) return;
  _dirty = false;
  try {
    const h = hallRead(); if (!h) return;
    const got = HALL_X.filter(x => !h.x[x.id] && hallXOk(x, h));
    if (!got.length) return;
    const m = hallMark();
    got.forEach(x => { h.x[x.id] = Object.assign({}, m); });
    if (!hallWrite(h)) return;
    _dirty = false;
    if (S) S.achPop = (S.achPop || []).concat(got.map(x => ({ n: x.n, d: x.d, flavor: x.flavor || "", tag: "殿堂专属", gains: [], hallx: true })));
  } catch (e) {}
}

/* ---------- 读数 ---------- */
export function hallTotal(): number { return ACHIEVEMENTS.length; }
export function hallCount(h): number { return h ? ACHIEVEMENTS.filter(a => h.a[a.id]).length : 0; }
export function hallDate(at): string {
  try {
    const d = new Date(at);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  } catch (e) { return ""; }
}
/* 「ID · 赛季 · 日期」——ID 是存档 / 导入文件里来的，照例转义 */
export function hallWho(m): string {
  return `${escapeHtml(m.who || "无名")}${m.s ? ` · ${m.s}` : ""} · ${hallDate(m.at)}`;
}
/* 殿堂专属的回报：一个称号。封面存档卡和生涯名片都写最近拿到的那一个 */
export function hallTitle(h?): string {
  if (h === undefined) h = hallRead();
  if (!h) return "";
  let best = null;
  HALL_X.forEach(x => { const r = h.x[x.id]; if (r && (!best || r.at >= best.at)) best = { at: r.at, n: x.n }; });
  return best ? best.n : "";
}
export function hallTitleLine(): string { const t = hallTitle(); return t ? `<p class="halltitle">殿堂称号 · <b>${t}</b></p>` : ""; }
export function hallBadge(): string { const t = hallTitle(); return t ? ` · <span class="po-hall">殿堂 · ${t}</span>` : ""; }

/* ---------- 殿堂视图（成就页的第二个标签）----------
   三种状态：这一局拿到的（实线金框，同「本局」）、别的局拿到这一局还没有的（虚线金框，写是谁在哪年哪天拿的）、
   从没拿到过的（暗）。彩蛋在任何一局撞到过就不再打问号——殿堂记得你撞过。最后一组是殿堂专属。 */
export function hallView(h): string {
  if (!h) return `<p class="note">这台设备不让网页长期存东西（隐私模式，或者关掉了存储），殿堂记不下来。<br>
    本局的成就照常解锁、奖励照常发。</p>`;
  const byTag = {};
  ACHIEVEMENTS.forEach(a => { (byTag[a.tag] = byTag[a.tag] || []).push(a); });
  return `${Object.keys(byTag).map(t => `
      <h3 style="font-size:13px;color:var(--ink-3);margin:14px 0 8px">${t}</h3>
      <div class="achgrid">${byTag[t].map(a => {
        const mine = hasAch(a.id), r = h.a[a.id];
        const hide = !mine && !r && a.secret;
        return `<div class="ach ${mine ? "on" : r ? "hall" : ""}" title="${hide ? "彩蛋，自己撞上去" : a.d}">
          <div class="an">${hide ? "？？？" : a.n}</div>
          <div class="ad">${hide ? "藏起来的，自己撞上去" : a.d}</div>
          ${r ? `<div class="ah">${mine ? "本局已解锁 · " : ""}首次 ${hallWho(r)}${r.n > 1 ? ` · ${r.n} 局拿到过` : ""}</div>` : ""}
          ${(mine || r) && a.flavor ? `<div class="af">${a.flavor}</div>` : ""}
        </div>`; }).join("")}</div>`).join("")}
    <h3 style="font-size:13px;color:var(--ink-3);margin:18px 0 8px">殿堂专属<span class="tag">不算进那 ${ACHIEVEMENTS.length} 项 · 没有数值奖励</span></h3>
    <div class="achgrid">${HALL_X.map(x => { const r = h.x[x.id];
      return `<div class="ach ${r ? "on" : ""}" title="${x.d}">
          <div class="an">${x.n}</div>
          <div class="ad">${x.d}</div>
          <div class="ah">${r ? hallWho(r) : x.prog(h)}</div>
          ${r && x.flavor ? `<div class="af">${x.flavor}</div>` : ""}
        </div>`; }).join("")}</div>
    <p class="note">殿堂记在这台设备上，<b>重开、开新档都不会清</b>：每一项第一次是哪一局、哪个 ID、哪个赛季、哪天解锁的，一共几局拿到过。
      实线金框是这一局拿到的，虚线金框是别的局拿到、这一局还没有的。<br>
      奖励照旧按每一局发——换一局再解锁，回报还会再给一次；殿堂本身不给任何数值，「收藏家」「打透了」也只数这一局。
      殿堂专属那几项可以分几局凑齐，拿到后称号写在封面的存档卡和生涯名片上。
      导出的存档文件里带着殿堂，导入时和这台设备上的合在一起，不会互相覆盖。</p>`;
}
