import { ACHIEVEMENTS, hasAch } from "./achieve";
import { SEASONS } from "./main";
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
       a: { 成就id: { at 首次解锁的时间戳, who 当时的 ID, s 当时的赛季, n 几局拿到过, ids 拿到过它的存档编号（最近 40 个） } } }
   「几局」按存档编号去重：同一局读档重来、导入同一份存档，都不会多算一局。 */

export const HALL_KEY = "poxiao_ach_hall_v1";
/* 每项成就只留最近 40 个存档编号：101 项 × 40 个号也就几十 KB。
   超过 40 局之后，一个很早的档再被读回来可能会多算一局——换来的是殿堂不会把 localStorage 撑满（存档本身要 0.5 MB） */
const HALL_IDS_CAP = 40;
const SAVE_ID_RE = /^[\w.-]{1,40}$/;

export function hallEmpty(): any { return { v: 1, a: {} }; }

/* 读：null 只表示「这台设备存不了」；记录坏了（半截 JSON）按空殿堂重来，别让一条坏记录永远卡住 */
export function hallRead(): any {
  let raw = null;
  try { raw = localStorage.getItem(HALL_KEY); } catch (e) { return null; }
  if (!raw) return hallEmpty();
  try { return hallClean(JSON.parse(raw)); } catch (e) { return hallEmpty(); }
}
export function hallWrite(h): boolean {
  try { localStorage.setItem(HALL_KEY, JSON.stringify(h)); return true; } catch (e) { return false; }
}

const achIds = () => new Set(ACHIEVEMENTS.map(a => a.id));
/* 首次标记：时间、ID、赛季。ID 走 safeName 白名单（和建档时同一道闸），赛季只认 S12 这种写法 */
function cleanMark(m): any {
  if (!m || typeof m !== "object") return null;
  const at = Number(m.at);
  if (!isFinite(at) || at <= 0) return null;
  return { at: Math.round(at), who: safeName(m.who), s: (typeof m.s === "string" && /^S\d{1,2}$/.test(m.s)) ? m.s : "" };
}
/* 殿堂会从导入的文件里来——当成别人给的数据洗一遍：只留认识的成就、合法的数，其余丢掉 */
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
/* 从一份存档把已经解锁的成就补记进殿堂：老版本存下的档第一次被读 / 出现在封面上、老域名接力来的档。
   时间只能用存档时间（s.at 那一刻它们肯定已经解锁了），赛季从 achLog 里找。返回殿堂有没有变。 */
export function hallSeedFrom(s, at?: number): boolean {
  try {
    if (!s || typeof s !== "object" || !s.ach || typeof s.ach !== "object") return false;
    const h = hallRead(); if (!h) return false;
    const sid = saveIdOf(s), ids = achIds(), log = Array.isArray(s.achLog) ? s.achLog : [];
    const when = (typeof at === "number" && at > 0) ? at : Date.now();
    let ch = false;
    Object.keys(s.ach).forEach(id => {
      if (!s.ach[id] || !ids.has(id)) return;
      const row = log.find(x => x && x.id === id);
      const sea = (row && typeof row.s === "string" && /^S\d{1,2}$/.test(row.s)) ? row.s : "";
      if (hallAddAch(h, id, { at: when, who: safeName(s.name), s: sea }, sid)) ch = true;
    });
    if (ch) hallWrite(h);
    return ch;
  } catch (e) { return false; }
}
/* 导入：和这台设备上的殿堂取并集，永远不覆盖——首次解锁记最早的那一次，几局按编号去重再和两边各自记的数取大 */
export function hallMerge(into, from): any {
  Object.keys(from.a || {}).forEach(id => {
    const f = from.a[id], r = into.a[id];
    if (!r) { into.a[id] = { at: f.at, who: f.who, s: f.s, n: f.n, ids: f.ids.slice() }; return; }
    const all = r.ids.concat(f.ids.filter(x => r.ids.indexOf(x) < 0));
    if (f.at < r.at) { r.at = f.at; r.who = f.who; r.s = f.s; }
    r.n = Math.max(r.n || 1, f.n || 1, all.length);
    r.ids = all.slice(-HALL_IDS_CAP);
  });
  return into;
}
export function hallImport(raw): boolean {
  try {
    const h = hallRead(); if (!h) return false;
    hallMerge(h, hallClean(raw));
    return hallWrite(h);
  } catch (e) { return false; }
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

/* ---------- 殿堂视图（成就页的第二个标签）----------
   三种状态：这一局拿到的（实线金框，同「本局」）、别的局拿到这一局还没有的（虚线金框，写是谁在哪年哪天拿的）、
   从没拿到过的（暗）。彩蛋在任何一局撞到过就不再打问号——殿堂记得你撞过。 */
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
    <p class="note">殿堂记在这台设备上，<b>重开、开新档都不会清</b>：每一项第一次是哪一局、哪个 ID、哪个赛季、哪天解锁的，一共几局拿到过。
      实线金框是这一局拿到的，虚线金框是别的局拿到、这一局还没有的。<br>
      奖励照旧按每一局发——换一局再解锁，回报还会再给一次；殿堂本身不给任何数值，「收藏家」「打透了」也只数这一局。
      导出的存档文件里带着殿堂，导入时和这台设备上的合在一起，不会互相覆盖。</p>`;
}
