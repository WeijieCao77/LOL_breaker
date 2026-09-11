import tl2023 from "../../data/csv/timeline_2023.json";
import tl2024 from "../../data/csv/timeline_2024.json";
import tl2025 from "../../data/csv/timeline_2025.json";
import tl2026 from "../../data/csv/timeline_2026.json";
import tlLogos from "../../data/csv/timeline_logos.json";
import { initRelations, syncRelations } from "./clout";
import { DATA } from "./data";
import { INTL_CANON, LEAGUE_CANON } from "./intl";
import { CN_FIX, DECAY_W, DIMS, POSN, SEASONS, STAR_FLOOR, WORLD_DRIFT, ageCurve, anchorLeague, avg, buildLDL, clamp, makeRookie, markTeamJoin, power, pushEvent, q1, teamCode } from "./main";
import { rnd } from "./rng";
import { STARS } from "./stars";
import { S } from "./state";
import { initTrust, syncTrust } from "./team";

/* ================= 真实时间线 2022–2026（2026-09-10 作者拍板）=================

   玩家反馈：「时间线都 S15 了还只是 S12 的选手，没有新人」——世界只用了 2022 年一份快照，
   之后全靠模拟老化和编出来的新秀。作者定调：你的角色影响不到的地方，一律用真实数据（照 val_player 的分层）。

   · 每年一页真实名单（data/export_timeline.py 导出）：当年第一个赛段的首发、统一标尺五维、真实新秀池。
   · 休赛期换页：你影响不到的队，名单就是那一年真实的首发。
     你所在的队也跟真实名单走——除了你的位置、以及你亲手造成的变动（挂牌卖掉的人不回来、点名签来的人留下）；
     被你顶掉的真实首发进自由人池，别的队缺人先找他。
   · 真实年份（≤2026）冻结一切 AI 名单变动（退役换新秀、复出、AI 转会/提拔、事件换人）：名单由真实数据决定。
   · 2027 起从 2026 的真实状态继续模拟；退役补人先用真实新秀池，用完才编。
   · 赛区结构按真实年份改。内部键不改名（审计：改键会让几十处无保护的查表崩掉），显示名按年份走 lgName。
   · 平衡是「换脸不换难度」：每个联赛的五维均值、默契、战术锚到现行游戏同一「世界年龄」的标定值
     （世界年龄 = 这份世界被 ageWorld 推过几年；签约时新建的世界从 0 算，和现行游戏一致）。
   · 只对新档生效（S.tl）；老存档一切照旧。 */

export const TL_PAGES: any = { 2023: tl2023, 2024: tl2024, 2025: tl2025, 2026: tl2026 };
export const TL_FIRST = 2023, TL_LAST = 2026;
/* 你的队跟真实名单换人时的两条平衡闸（2026-09-10 批测抓的：不加的话每年真实换 2.6–3.1 个人、每人砸 7.5 默契，
   S15 开季默契 30→10、战力 71.4→65.2，普通玩家冠军 2.46→1.12——世界没变强，是你的队被真实转会拆散了）。
   · TL_SWAP_SYN：休赛期真实换人有整个季前赛来磨，默契按这个系数折算（赛季中途换人仍走 watchRoster 的整额）
   · TL_ARRIVAL_FLOOR：真实转会进来的人不低于他顶替的那位队友——你带着这支队攒下的底子不因为真实转会凭空消失 */
export const TL_SWAP_SYN = 0;   // 120 局 A/B（离散锚定 + 地板衰退之后）：0.4 时普通玩家世界赛 .317→.167；0.15 时 MSI −1.7σ；0 时六项冠军率全在 1.6σ 内
export const TL_ARRIVAL_FLOOR = true;
/* LDL 停办的年份（真实历史：2026 年的数据里已经没有 LDL）。改成 9999 就保留二队通道到生涯结束（改了要重新批测） */
export const TL_LDL_END = 2026;
const POS5 = ["top", "jng", "mid", "bot", "sup"];
/* 页面里的赛区键 → 游戏内部键：LCS / CBLOL 在 2025 年叫 LTA 北区 / 南区，内部键不动，只换显示名 */
const KEY_OF: any = { "LTA北": "LCS", "LTA南": "CBLOL" };
export const LG_NAME: any = { 2025: { LCS: "LTA 北区", CBLOL: "LTA 南区" } };
/* 赛区从世界里消失时，你的队并去哪（2025：LLA 并入 LTA 南区；LCO 并入 LCP 体系） */
const TL_MERGE: any = { 2025: { LLA: "CBLOL", LCO: "LCP" } };
/* 真实新秀池按大区归属 */
const REG_OF: any = { LPL: "CN", LDL: "CN", LCK: "KR", LEC: "EU", TCL: "EU", LCS: "NA", CBLOL: "BR", LLA: "LAT",
  PCS: "PAC", VCS: "PAC", LJL: "PAC", LCP: "PAC", LCO: "PAC" };
/* 每年休赛期的赛区改制（真实历史） */
export const TL_STRUCT_NEWS: any = {
  2023: "LCO 与 TCL 不再有国际赛直通名额（两地联赛照常进行）。",
  2024: "LCS 缩编到 8 支队伍。",
  2025: "赛区大改制：LCS 改为 <b>LTA 北区</b>，CBLOL 与 LLA 合并为 <b>LTA 南区</b>；PCS、VCS、LJL 的头部队伍组成新赛区 <b>LCP</b>；LPL 缩编到 16 支队伍。",
  2026: "LTA 拆回 <b>LCS</b> 与 <b>CBLOL</b>；LPL 缩编到 14 支队伍。"
};

/* 标定：现行游戏（不换真实名单）240 局（普通 / 强各 120，含再战）里，世界年龄 0–7 时
   各联赛首发五维均值 / 默契 / 战术的平均。真实页换上后锚到这里——换的是人，不是难度。
   LCP 没有现行对照，按 PCS 的曲线。 */
export const TL_MEAN: any = {CBLOL:[60.0,61.0,61.8,62.2,61.4,62.3,65.1,65.8],LCK:[72.1,72.5,73.3,73.9,73.5,73.3,73.5,76.5],LCO:[59.0,60.0,60.8,60.8,59.4,58.9,58.2,61.0],LCS:[66.5,67.3,68.0,67.9,68.1,69.8,71.6,72.2],LDL:[59.5,63.4,64.8,64.7,65.2,64.7,64.3,63.5],LEC:[68.2,69.0,69.5,69.8,70.1,70.7,72.6,73.7],LJL:[60.5,61.4,61.4,61.0,63.1,64.9,65.4,66.2],LLA:[60.0,60.8,60.7,59.8,61.4,63.7,65.3,65.7],LPL:[70.2,71.2,72.0,72.8,73.3,73.3,74.3,75.0],PCS:[63.0,64.0,64.3,64.8,65.3,65.1,67.6,68.6],TCL:[59.5,60.5,61.1,60.8,61.3,62.0,64.4,65.1],VCS:[62.5,63.5,64.3,65.1,65.9,66.7,67.5,68.1]};
export const TL_SYN: any = {CBLOL:[49.8,57.7,63.6,67.7,70.6,66.2,62.0,64.9],LCK:[53.8,61.2,64.1,66.0,66.0,65.1,63.9,61.3],LCO:[51.5,62.1,65.9,69.0,71.3,70.2,70.5,66.5],LCS:[51.4,56.9,60.9,62.5,62.6,59.2,61.2,57.0],LDL:[41.7,50.2,58.8,62.5,63.5,64.2,65.0,64.9],LEC:[51.3,55.9,60.5,62.1,61.2,62.9,60.8,60.7],LJL:[51.3,58.4,63.6,66.2,64.1,64.7,63.6,67.1],LLA:[53.4,60.5,66.3,67.7,64.1,64.6,65.1,65.3],LPL:[51.3,57.2,60.0,61.1,61.1,61.3,59.4,60.6],PCS:[53.1,62.0,66.7,66.0,66.7,69.1,64.9,65.8],TCL:[52.8,61.2,67.3,67.8,67.7,67.7,64.0,66.2],VCS:[53.1,62.8,67.4,68.1,70.1,70.8,68.3,67.3]};
export const TL_TAC: any = {CBLOL:[50.5,60.1,64.2,67.2,69.8,70.5,71.2,71.6],LCK:[54.0,62.0,64.4,65.7,66.5,67.1,67.7,68.0],LCO:[51.5,61.5,64.9,67.5,70.3,71.6,72.4,72.4],LCS:[51.1,58.8,63.0,64.3,65.3,65.8,66.4,67.1],LDL:[41.3,49.9,59.2,62.8,63.7,64.6,65.4,66.2],LEC:[51.0,58.5,62.8,64.4,65.3,66.2,66.7,67.3],LJL:[51.3,60.8,65.0,67.8,70.0,71.1,72.0,72.1],LLA:[52.6,61.4,65.7,68.2,70.3,71.6,72.5,73.1],LPL:[51.1,58.6,62.1,63.0,63.7,64.2,64.6,64.8],PCS:[52.4,62.0,65.9,68.2,69.9,71.1,71.7,72.3],TCL:[51.7,61.2,66.1,68.3,70.3,71.5,71.9,72.0],VCS:[51.7,61.5,65.3,67.6,70.5,72.0,71.8,72.1]};

export const TL_SD: any = {CBLOL:[4.02,2.99,4.07,6.44,9.05,10.14,9.77,10.22],LCK:[8.05,7.89,7.95,8.6,9.28,10.39,11.82,11.88],LCO:[5.82,4.92,4.61,4.83,5.36,5.86,7.85,9.96],LCS:[6.19,5.31,5.67,6.98,8.62,9.99,11.51,8.71],LDL:[5.52,4.55,4.39,5.25,6.15,6.58,7.3,7.94],LEC:[5.19,4.41,4.66,5.3,6.59,8.05,9.21,10.51],LJL:[4.66,5.25,6.36,8.16,7.98,7.57,6.54,9.13],LLA:[6.25,5.39,5.62,7.2,6.9,8.51,9.31,8.5],LPL:[7.22,6.94,7.2,7.79,7.85,8.0,8.07,8.89],PCS:[4.77,3.24,3.29,3.56,4.18,6.81,8.1,9.36],TCL:[6.24,4.75,4.12,4.92,5.56,7.19,7.87,10.31],VCS:[6.13,5.08,5.5,7.04,7.32,7.76,8.33,9.71]};

/* 真实年份里写进世界线的新队名（史实表按 2022 快照的队名写；换页后席位易主的队要补上新名字） */
const TL_WORLDS_ADD: any = { "1": { LCS: ["Golden Guardians", "NRG"], VCS: ["Team Whales"] },
  "3": { LCP: ["CTBC Flying Oyster", "PSG Talon", "Team Whales"], CBLOL: ["Vivo Keyd Stars"] } };
const TL_MSI_ADD: any = { "3": { LCP: ["CTBC Flying Oyster", "GAM Esports"] } };

export function tlOn() { return !!(S && S.tl); }
export function tlYear(si?) { const i = (si === undefined) ? ((S && S.si) || 0) : si; return (SEASONS[i] && SEASONS[i].y) || 2022; }
/* 这一年的名单由真实数据决定 */
export function tlReal(si?) { const y = tlYear(si); return tlOn() && y >= TL_FIRST && y <= TL_LAST; }
/* 真实年份里 AI 不动名单（2022 也算：开局快照本身就是真实的） */
export function tlFrozen() { return tlOn() && tlYear() <= TL_LAST; }
export function tlStructOf(y) {
  const base = { major: DATA.major || ["LPL", "LCK", "LEC", "LCS"], minor: DATA.minor || [], intl: DATA.minor || [] };
  const pg = TL_PAGES[Math.min(y, TL_LAST)];
  if (y < TL_FIRST || !pg) return base;
  const k = a => (a || []).map(x => KEY_OF[x] || x);
  return { major: k(pg.major), minor: k(pg.minor), intl: k(pg.intl) };
}
const curStruct = () => tlStructOf(tlOn() ? tlYear() : 2022);
export function tlMajors() { return curStruct().major; }
export function tlIntlMinors() { return curStruct().intl; }
export function tlMinorLeagues() { return curStruct().minor; }
/* 赛区显示名：内部键不变，2025 年 LCS / CBLOL 显示为 LTA 北区 / 南区 */
export function lgName(lg, si?) {
  if (!lg || !tlOn()) return lg;
  const m = LG_NAME[tlYear(si)];
  return (m && m[lg]) || lg;
}
/* 史实表叠加（只对真实时间线的档） */
export function tlCanon(base, si, kind) {
  const b = base[si];
  if (!tlOn()) return b;
  const add = (kind === "msi" ? TL_MSI_ADD : TL_WORLDS_ADD)[si];
  if (!add) return b;
  const o = Object.assign({}, b || {});
  Object.keys(add).forEach(lg => { o[lg] = (o[lg] || []).concat(add[lg].filter(n => !(o[lg] || []).includes(n))); });
  return o;
}

const comp = p => avg(DIMS.map(d => (p && p.r && p.r[d]) || 50));
const ageIdx = () => clamp((S && S.worldAge) || 0, 0, 7);
const tgt = (T, K) => (T[K] || T[K === "LCP" ? "PCS" : "LPL"] || T.LPL)[ageIdx()];
/* 换页进来的新队（和开局数据里本来缺队标的 RNG / Excel / BDS）的队标：data/export_timeline_logos.py 从 data/logos 生成 */
export const TL_LOGOS: any = tlLogos;
function dataLogo(name) {
  try { for (const lg of Object.keys(DATA.leagues || {})) { const t = DATA.leagues[lg].find(x => x.name === name); if (t && t.logo) return t.logo; } } catch (e) {}
  return (TL_LOGOS && TL_LOGOS[name]) || undefined;
}
function worldHas(id) {
  try { return Object.keys(S.world || {}).some(k => (S.world[k] || []).some(t => (t.players || []).some(p => p && p.id === id))); } catch (e) { return false; }
}

/* 名望地板随年龄衰退（2026-09-10 批测抓的）：开局那份（2022）的地板是一次性的，之后这些人在现行版本里跟着年龄曲线走
   （Faker 2022 年 26 岁、地板 87，到 2025 年现行版本里大约 80）。真实页如果每年都把他们抬回 87，
   LCK 前四的战力比现行版本高 1.2～1.4，MSI 冠军率跟着掉。这里照 ageWorld 的年均变化（年龄曲线 × 维度衰减权重 + 成长）
   加世界水位年漂移，算出「现行版本里他今年该在的地板」——只降不升。 */
function ageStep(age) {
  const b = ageCurve(age), aw = avg(DIMS.map(d => DECAY_W[d]));
  const dev = age <= 23 ? 2.3 : age <= 25 ? 1.3 : age <= 27 ? 0.4 : 0;
  return (b > 0 ? b * (1.4 - aw * 0.5) : b * aw) + dev;
}
export function floorAt(p, y) {
  const f = STAR_FLOOR[p.id]; if (!f) return 0;
  const n = Math.max(0, y - 2022);
  let d = WORLD_DRIFT * n;
  for (let k = 0; k < n; k++) d += ageStep((p.age || 24) - k);
  return Math.min(f, f + d);
}

/* 一页真实名单 → 游戏里的队伍对象（赛区锚定照开局那份：anchorLeague 放大明星，再整体回中到标定值） */
function buildPage(y) {
  const pg = TL_PAGES[y], out: any = {};
  Object.keys(pg.leagues).forEach(pk => {
    const K = KEY_OF[pk] || pk;
    const teams = (pg.leagues[pk] || []).map(t => ({
      name: t.n, from: t.from || null, wr: (t.wr == null ? 0.5 : t.wr), syn: (t.syn == null ? 50 : t.syn), tac: (t.tac == null ? 50 : t.tac),
      players: t.p.map(a => {
        const r: any = {}; DIMS.forEach((d, i) => { r[d] = a[4][i]; });
        const fx = CN_FIX[K + "/" + a[0]];
        return { id: a[0], cn: (fx !== undefined ? fx : (a[1] || "")), pos: a[2], age: a[3] || 22, r,
                 form: (a[5] == null ? 52 : a[5]), lg: K, retired: false, real: y };
      })
    }));
    out[K] = teams;
    if (!teams.length) return;
    const all = teams.flatMap(t => t.players);
    const target = tgt(TL_MEAN, K);
    // 锚定时先关掉名望地板（它在后面按年龄衰退后的值单独抬，见 floorAt）
    const savedFloor = Object.assign({}, STAR_FLOOR);
    try { Object.keys(STAR_FLOOR).forEach(id => { STAR_FLOOR[id] = 0; }); anchorLeague(K, teams, target); }
    finally { Object.assign(STAR_FLOOR, savedFloor); }
    const fix = target - avg(all.map(comp));          // 名望地板会把均值抬一点：回中到标定值
    if (Math.abs(fix) > 0.05) all.forEach(p => DIMS.forEach(d => { p.r[d] = q1(clamp(p.r[d] + fix, 35, 99)); }));
    /* 离散也锚到标定值（2026-09-10 批测抓的）：真实名单里明星更扎堆，LCK / LEC / LCS 的首发离散比现行世界大 1–2.5 分，
       只锚均值的话头部强队比现行版本强一截（LCK 前四战力 +1～1.6），MSI / 世界赛冠军率跟着掉。 */
    const sdT = tgt(TL_SD, K), m0 = avg(all.map(comp));
    const sd0 = Math.sqrt(avg(all.map(p => (comp(p) - m0) ** 2)));
    if (sd0 > 0.5 && sdT > 0) {
      const k = sdT / sd0;
      all.forEach(p => { const dv = (comp(p) - m0) * (k - 1); DIMS.forEach(d => { p.r[d] = q1(clamp(p.r[d] + dv, 35, 99)); }); });
      // 名望地板（按年龄衰退后的值）最后抬，再整体回中
      all.forEach(p => {
        const f = floorAt(p, y); if (!f) return;
        for (let i = 0; i < 4; i++) {
          const c = comp(p); if (c >= f - 0.05) break;
          const room = DIMS.filter(d => p.r[d] < 99); if (!room.length) break;
          const up = (f - c) * DIMS.length / room.length;
          room.forEach(d => { p.r[d] = q1(clamp(p.r[d] + up, 35, 99)); });
        }
      });
      const fix2 = target - avg(all.map(comp));
      if (Math.abs(fix2) > 0.05) all.forEach(p => DIMS.forEach(d => { p.r[d] = q1(clamp(p.r[d] + fix2, 35, 99)); }));
    }
  });
  return out;
}

/* 真实新秀：按大区从当年（2027+ 用 2026）的新秀池里取最好的一个没用过的，数值按传进来的水位定、五维形状照他的真实数据 */
function tlProspect(pos, K, lvl, y, used?) {
  S.tlUsed = S.tlUsed || [];
  const reg = REG_OF[K] || "CN";
  // 当年没有这个大区的新秀（2026 年起没有 LDL）就往前一年找，年龄照推
  for (let yy = clamp(y, TL_FIRST, TL_LAST); yy >= TL_FIRST; yy--) {
    const pg = TL_PAGES[yy]; if (!pg || !pg.pros) continue;
    const dy = Math.max(0, y - yy);
    const a = pg.pros.find(x => x[2] === pos && x[6] === reg && (x[3] || 19) + dy <= 23 && !S.tlUsed.includes(x[0])
      && !(used && used.has(x[0])) && !worldHas(x[0]));
    if (!a) continue;
    S.tlUsed.push(a[0]);
    const m = avg(a[4]);
    const r: any = {}; DIMS.forEach((d, i) => { r[d] = clamp(Math.round(lvl + (a[4][i] - m) * 0.6 + (rnd() * 6 - 3)), 45, 93); });
    const ceil = clamp(Math.round(lvl + 6 + rnd() * 22), 50, 92);       // 和 makeRookie 同一条成长天花板
    return { id: a[0], cn: a[1] || "", pos, age: (a[3] || 19) + dy, r, rookie: true, ceil, lg: K, form: 52, retired: false,
             debutSi: (S && S.si !== undefined) ? S.si : 0, real: yy, prospect: true };
  }
  return null;
}
/* LDL 停办后的青训储备（2026-09-11 作者拍板）：二队里数值最高的一批人不跟着解散，
   一线队有人退役（或名单缺人）时先从他们里面提拔。数值取「他自己」和「这个位置补人的水位」里高的那个，
   形状照他在二队的五维——高分的人带着自己的实力上来，低于水位的人按水位补（和编出来的新秀同一条线，难度不因此变软）。 */
export const TL_ACAD_N = 25;
function tlAcadPick(pos, K, lvl, used?) {
  if (K !== "LPL" || !S.tlAcad || !S.tlAcad.length) return null;
  const i = S.tlAcad.findIndex(p => p && p.pos === pos && !(used && used.has(p.id)) && !worldHas(p.id));
  if (i < 0) return null;
  const a = S.tlAcad.splice(i, 1)[0];
  const m = avg(DIMS.map(d => a.r[d])), base = Math.max(lvl, m);
  const r: any = {}; DIMS.forEach(d => { r[d] = clamp(Math.round(base + (a.r[d] - m) * 0.8), 45, 93); });
  return Object.assign({}, a, { r, lg: K, rookie: true, fromAcad: true, form: 52, retired: false,
    age: (a.age || 20) + Math.max(0, tlYear() - (a.acadY || tlYear())),
    ceil: Math.max(a.ceil || 0, Math.round(base + 8)), debutSi: (S && S.si !== undefined) ? S.si : 0 });
}
/* 退役补人：真实时间线先用青训储备（LDL 停办后）、再用真实新秀，都用完才编（老档照旧 makeRookie） */
export function tlRookie(pos, level, lg) {
  if (tlOn()) {
    const a = tlAcadPick(pos, lg, level); if (a) return a;
    const p = tlProspect(pos, lg, level, tlYear()); if (p) return p;
  }
  return makeRookie(pos, level, lg);
}
/* LDL 停办（真实历史）：大事记 + 弹窗 + 周报素材，二队高分选手转青训储备。每档只发生一次。 */
function tlLdlAcademy(w, y) {
  if (S.tlAcadYear) return;
  const ldl = w.LDL || [];
  const ps = ldl.flatMap(t => (t.players || []).filter(p => p && !p.me && p.r).map(p => ({ p, from: t.name })));
  ps.sort((a, b) => comp(b.p) - comp(a.p));
  const keep = ps.slice(0, TL_ACAD_N);
  S.tlAcad = keep.map(x => Object.assign({}, x.p, { r: Object.assign({}, x.p.r), acadFrom: x.from, acadY: y }));
  S.tlAcadYear = y;
  const top = keep.slice(0, 5).map(x => `${x.p.id}（${x.from}，${Math.round(comp(x.p))}）`).join("、");
  S.tlLdlNews = { y, teams: ldl.length, n: keep.length, pressed: false };
  pushEvent(`<b>LDL 停办</b>（真实历史 · ${y} 年起）：${ldl.length} 支二队解散，数值最高的 <b>${keep.length}</b> 名选手转为<b>青训储备</b>——一线队有人退役，先从他们里面提拔。储备前五：${top}。`, "big", "赛区");
  S.tlPop = { eyebrow: `${y} · 赛区改制（真实历史）`, title: "LDL 停办",
    body: `从 ${y} 年起 LDL 不再举办，<b>${ldl.length}</b> 支二队解散。<br>数值最高的 <b>${keep.length}</b> 名二队选手转为<b>青训储备</b>：一线队有人退役或缺人时，先从他们里面提拔。<br><span style="color:var(--ink-3)">储备前五：${top}</span>` };
}
export function tlPopCard() {
  const p = S && S.tlPop; if (!p) return "";
  return `<div class="rankup"><div class="ru-inner" style="max-width:480px">
    <div class="ru-eyebrow">${p.eyebrow || "真实时间线"}</div>
    <div class="ru-tier">${p.title}</div>
    <div class="ru-txt" style="text-align:left">${p.body}${p.mine ? `<br><br>${p.mine}` : ""}</div>
    <div class="row" style="justify-content:center"><button class="btn" id="tlpopok">知道了</button></div>
  </div></div>`;
}

/* 你顶掉了谁：真实首发让出位置，进自由人池 */
export function tlDisplace(real, teamName) {
  if (!tlOn() || !real || real.me || real.rookie) return;
  S.tlFree = (S.tlFree || []).filter(x => x && x.id !== real.id).concat([real]).slice(-24);
  if ((S.tlDisplaced || []).some(x => x.id === real.id && x.team === teamName && x.si === S.si)) return;
  S.tlDisplaced = (S.tlDisplaced || []).concat([{ si: S.si, id: real.id, cn: real.cn || "", team: teamName, pos: real.pos }]);
  pushEvent(`真实历史里，${tlYear()} 年 <b>${teamName}</b> 的${POSN[real.pos] || real.pos}首发是 <b>${real.id}</b>${real.cn ? `（${real.cn}）` : ""}——<b>这个位置现在是你</b>。<span style="color:var(--ink-3)">他进了自由人市场，别的队缺人会先找他。</span>`, "big", "时间线");
}

/* 你的队改名（联赛席位易主 / 二队随母队改名）：所有记着队名的活状态一起改 */
export function tlRenameTeam(oldN, newN) {
  if (!oldN || !newN || oldN === newN) return;
  const fix = o => { if (o && o.team === oldN) o.team = newN; };
  if (S.team === oldN) S.team = newN;
  [S.contract, S.pendingRenew, S.champCore, S.proOffer, S.deal, S.tryout, S.promoteDeal, S.pendingContract].forEach(fix);
  if (S.pre) fix(S.pre.invite);
  (S.faOffers || []).forEach(fix); (S.txIntents || []).forEach(fix);
  if (S.mateInjury && S.mateInjury.sub) fix(S.mateInjury.sub);
  Object.values(S.rivals || {}).forEach(fix);
  if (S.teamForm && S.teamForm[oldN] !== undefined) { S.teamForm[newN] = S.teamForm[oldN]; delete S.teamForm[oldN]; }
  Object.keys(S.standings || {}).forEach(lg => { const st = S.standings[lg]; if (st && st[oldN]) { st[newN] = st[oldN]; delete st[oldN]; } });
  S.tlAlias = Object.assign({}, S.tlAlias || {}, { [newN]: (S.tlAlias && S.tlAlias[oldN]) || oldN });
}
/* 世界里已经没有这支队的报价 / 意向作废，改了名的跟着改 */
function sanitizeRefs(w, renames) {
  const leagueOfW = n => Object.keys(w).find(k => (w[k] || []).some(t => t.name === n)) || null;
  const fixO = o => {
    if (!o || !o.team) return o;
    const n = renames.get(o.team) || o.team, lg = leagueOfW(n);
    if (!lg) return null;
    o.team = n; if (o.league) o.league = lg;
    return o;
  };
  S.proOffer = fixO(S.proOffer);
  if (S.faOffers) S.faOffers = S.faOffers.map(fixO).filter(Boolean);
  if (S.txIntents) S.txIntents = S.txIntents.map(fixO).filter(Boolean);
  if (S.deal && !S.deal.signed && S.career) S.deal = fixO(S.deal);
  if (S.tryout && S.career) S.tryout = fixO(S.tryout);
}

/* 2026：LDL 停办（真实历史）。还在二队的你被母队注册进一队替补席；母队没了就去一支中下游队 */
function tlLdlEnd(w, nw, renames) {
  const ld = (w.LDL || []).find(t => t.name === S.team);
  const par = ld ? (renames.get(ld.parent) || ld.parent) : null;
  const lpl = nw.LPL || [];
  let pt = lpl.find(t => t.name === par);
  if (!pt && lpl.length) { const rk = lpl.slice().sort((a, b) => power(b) - power(a)); pt = rk[Math.min(rk.length - 1, Math.floor(rk.length * 0.6))]; }
  if (!pt) return false;
  const inc = pt.players.find(q => q && q.pos === S.pos && !q.me);
  const from = S.team;
  S.team = pt.name; S.homeLeague = "LPL";
  S.understudy = inc || null; S.promoted = !inc; S.offerKind = "sub";
  if (S.contract) { S.contract.team = pt.name; S.contract.tier = "sub"; }
  S.promoteDeal = null;
  const mine = `${from || "二队"}解散，<b>${pt.name}</b> 把你注册进一队替补席${inc ? `——训练赛压过 <b>${inc.id}</b> 就能首发` : ""}。合同照旧。`;
  pushEvent(`<b>LDL 停办</b>（真实历史）：${mine}`, "big", "时间线");
  if (S.tlPop) S.tlPop.mine = `<b>你的去向</b>：${mine}`;
  return true;
}

/* ---------- 换页：把世界 w 换成 y 年的真实名单 ----------
   live=true：正在进行的档（你的队、事件、改名都要处理）；false：签约时新建的世界（没有「你的队」）。 */
export function tlApplyYear(w, y, live) {
  const pg = TL_PAGES[y];
  if (!pg || !w) return null;
  const st = tlStructOf(y);
  const built = buildPage(y);
  const pageNames = new Set<string>();
  Object.keys(built).forEach(K => built[K].forEach(t => pageNames.add(t.name)));
  const old = new Map<string, any>(), oldIdTeam = new Map<string, any>();
  Object.keys(w).forEach(K => {
    if (K === "LDL") return;
    (w[K] || []).forEach(t => { old.set(t.name, { K, t }); (t.players || []).forEach(p => { if (p && !p.me) oldIdTeam.set(p.id, { team: t.name, K, p }); }); });
  });
  // 头一回进一线名单的真实选手记下出道赛季（颁奖夜的「最佳新秀」认它；不记的话新秀奖会回落成「最年轻的人」）
  const siY = SEASONS.findIndex(s => s.y === y);
  Object.keys(built).forEach(K => built[K].forEach(bt => bt.players.forEach(p => { if (!oldIdTeam.has(p.id)) p.debutSi = siY; })));
  const ownName = (live && S.career && S.team) ? S.team : null;
  const ownOld = ownName ? old.get(ownName) : null;              // 二队里的你另算
  const ownT = ownOld ? ownOld.t : null;
  const used = new Set<string>(), renames = new Map<string, string>();
  const pinned = new Set<string>(Object.keys(S.tlIn || {}).filter(id => ownName && S.tlIn[id] && S.tlIn[id].team === ownName));
  const outIds = S.tlOut || {};
  const fill = (pos, K, lvl) => {
    const free = (S.tlFree || []).filter(x => x && x.pos === pos && !used.has(x.id) && !pinned.has(x.id) && !worldHas(x.id));
    if (free.length) {
      const f = free.sort((a, b) => comp(b) - comp(a))[0];
      S.tlFree = S.tlFree.filter(x => x !== f); used.add(f.id); f.lg = K;
      return f;
    }
    const pr = tlProspect(pos, K, lvl, y, used);
    if (pr) { used.add(pr.id); return pr; }
    const nr: any = makeRookie(pos, lvl, K); nr.lg = K; used.add(nr.id);
    return nr;
  };

  // 你的队在今年真实名单里的席位
  let ownSlot: any = null;
  if (ownT) Object.keys(built).forEach(K => built[K].forEach(bt => {
    if (!ownSlot && (bt.name === ownName || (bt.from === ownName && !pageNames.has(ownName)))) ownSlot = { bt, K };
  }));
  const claimed = new Set<any>();
  const ownNews: string[] = [];
  if (ownT) {
    claimed.add(ownT);
    if (ownSlot) {
      // 伤停替补先还原：换页之后名单重排，别让替补永远留在队里
      const I = S.mateInjury;
      if (I && I.sub && I.sub.orig && I.sub.team === ownName) {
        const i = ownT.players.findIndex(q => q && q.id === I.sub.id); if (i >= 0) ownT.players[i] = I.sub.orig;
        S.mateInjury = null;
      }
      ownT.players.forEach(p => { if (p && !p.me && pinned.has(p.id)) used.add(p.id); });
      const benched = !ownT.players.some(q => q && q.me);
      const lvl = avg(ownSlot.bt.players.map(comp));
      const next: any[] = [];
      POS5.forEach(pos => {
        const cur = ownT.players.find(q => q && q.pos === pos);
        const real = ownSlot.bt.players.find(q => q.pos === pos);
        const realOk = real && !outIds[real.id] && !used.has(real.id) && !pinned.has(real.id);
        if (cur && cur.me) {                                              // 你的位置：真实首发让出来
          if (realOk && real.id !== cur.id) { used.add(real.id); tlDisplace(real, ownSlot.bt.name); }
          next.push(cur); return;
        }
        if (cur && pinned.has(cur.id)) { next.push(cur); return; }       // 你点名签来的人留下
        if (realOk) {
          if (cur && cur.id === real.id) { cur.age = Math.max(cur.age || 0, real.age || 0); used.add(cur.id); next.push(cur); return; }   // 还是他：本局里的成长留着
          if (TL_ARRIVAL_FLOOR && cur) { const d = comp(cur) - comp(real); if (d > 0) DIMS.forEach(k => { real.r[k] = q1(clamp(real.r[k] + d, 35, 99)); }); }
          used.add(real.id); next.push(real);
          ownNews.push(`<b>${real.id}</b>${real.cn ? `（${real.cn}）` : ""} 加盟（${POSN[pos]}）${cur ? `，${cur.id} 离队` : ""}`);
          return;
        }
        if (cur) { used.add(cur.id); next.push(cur); return; }           // 真实首发被你卖掉了：留着现在顶上的人
        next.push(fill(pos, ownSlot.K, lvl - 3));
      });
      ownT.players = next;
      if (S.squad) {                                                       // 默契按季前赛折算（见 TL_SWAP_SYN），名单签名同步掉，免得 watchRoster 再砸一次整额
        const before = String(S.rosterSig || "").split("|");
        const ch = next.filter(q => q && !before.includes(q.id)).length;
        S.rosterSig = next.map(q => q.id).sort().join("|");
        if (ch > 0) {
          const hit = clamp(ch * 7.5 * TL_SWAP_SYN, 0, 32), s0 = S.squad.syn;
          S.squad.syn = q1(clamp(S.squad.syn - hit, 0, 100)); S.squad.tac = q1(clamp(S.squad.tac - hit * 0.45, 0, 100));
          try { syncRelations(); } catch (e) {}
          ownNews.push(hit >= 0.5 ? `<span style="color:var(--ink-3)">默契 ${Math.round(s0)} → ${Math.round(S.squad.syn)}（季前赛有时间磨）</span>`
            : `<span style="color:var(--ink-3)">休赛期换的人，整个季前赛来磨合——默契不掉，但新队友和你还不熟</span>`);
        }
      }
      if (benched && S.understudy) { const inc = next.find(q => q && q.pos === S.pos); if (inc) S.understudy = inc; }
      if (ownSlot.bt.name !== ownName) {                                   // 席位易主：你的队跟着改名（记着队名的活状态在后面 tlRenameTeam 里一起改）
        renames.set(ownName, ownSlot.bt.name);
        ownT.name = ownSlot.bt.name; ownT.logo = dataLogo(ownSlot.bt.name);
      }
    } else {
      ownT.players.forEach(p => { if (p && !p.me) used.add(p.id); });
    }
  }

  // 其余所有队：名单 = 当年真实首发
  const nw: any = {}, seatNews: string[] = [];
  st.major.concat(st.minor).forEach(K => {
    nw[K] = [];
    (built[K] || []).forEach(bt => {
      if (ownSlot && bt === ownSlot.bt) return;
      let prev = old.get(bt.name);
      if (prev && (claimed.has(prev.t) || prev.t === ownT)) prev = null;
      if (!prev && bt.from && !pageNames.has(bt.from)) { const f = old.get(bt.from); if (f && !claimed.has(f.t) && f.t !== ownT) prev = f; }
      if (prev) claimed.add(prev.t);
      const lvl = avg(bt.players.map(comp));
      const players = bt.players.map(p => (used.has(p.id) || pinned.has(p.id)) ? fill(p.pos, K, lvl - 3) : (used.add(p.id), p));
      const pids = new Set(prev ? prev.t.players.map(q => q && q.id) : []);
      const changed = players.filter(p => !pids.has(p.id)).length;
      const t: any = { name: bt.name, wr: Math.round((0.5 + (bt.wr - 0.5) * Math.pow(0.72, ageIdx())) * 1000) / 1000, players };
      if (prev) {
        t.syn = clamp((prev.t.syn === undefined ? 50 : prev.t.syn) - 7 * changed, 20, 90);   // 换一个人磨一次（同 ageWorld 退役换人）
        t.tac = clamp((prev.t.tac === undefined ? 50 : prev.t.tac) - 3 * changed, 20, 90);
        if (prev.t.name === bt.name) t.logo = prev.t.logo;
        else { renames.set(prev.t.name, bt.name); if (DATA.major.includes(K) || K === "LCS") seatNews.push(`<b>${prev.t.name}</b> 的联赛席位转给了 <b>${bt.name}</b>`); }
      } else {
        t.syn = 50 + (bt.syn - 50) * 0.5; t.tac = 50 + (bt.tac - 50) * 0.5;
        if (st.major.includes(K)) seatNews.push(`<b>${bt.name}</b> 加入 ${lgName(K, SEASONS.findIndex(s => s.y === y))}`);
      }
      if (!t.logo) t.logo = dataLogo(bt.name);
      nw[K].push(t);
    });
  });
  old.forEach(({ K, t }) => {
    if (!claimed.has(t) && t !== ownT && !pageNames.has(t.name) && (DATA.major || []).includes(K)) seatNews.push(`<b>${t.name}</b> 退出 ${K}`);
  });

  // 你的队落到哪个赛区
  if (ownT) {
    let K = ownSlot ? ownSlot.K : ownOld.K;
    if (!nw[K]) { const m = TL_MERGE[y] && TL_MERGE[y][K]; K = (m && nw[m]) ? m : "LPL"; }
    ownT.players.forEach(p => { if (p && !p.me) p.lg = K; });
    nw[K].push(ownT);
    if (live && K !== S.homeLeague) {
      const from = S.homeLeague; S.homeLeague = K;
      pushEvent(`赛区改制：你的队从 ${from} 来到 <b>${lgName(K)}</b>。`, "big", "时间线");
    }
  }

  // 二队（LDL）：跟着 LPL 的席位变；2026 年停办
  let ldlMoved = false;
  if (w.LDL) {
    if (y >= TL_LDL_END) {
      if (live) tlLdlAcademy(w, y);
      if (live && S.career && S.homeLeague === "LDL") ldlMoved = tlLdlEnd(w, nw, renames);
    } else {
      const lpl = nw.LPL || [], names = new Set(lpl.map(t => t.name));
      w.LDL.forEach(ld => {
        const np = renames.get(ld.parent);
        if (np) { const on = ld.name, nn = teamCode(np) + ".Y"; ld.parent = np; ld.name = nn; if (live && S.team === on) renames.set(on, nn); }
      });
      nw.LDL = w.LDL.filter(ld => names.has(ld.parent) || (live && ld.name === S.team));
      const have = new Set(nw.LDL.map(ld => ld.parent));
      const miss = lpl.filter(t => !have.has(t.name));
      if (miss.length) nw.LDL = nw.LDL.concat(buildLDL({ LPL: lpl }).filter(ld => miss.some(t => t.name === ld.parent)));
    }
  }

  // 默契 / 战术整体回中到标定值（你的队走 S.squad，不参与）
  Object.keys(nw).forEach(K => {
    if (K === "LDL") return;
    const ts = nw[K].filter(t => t !== ownT);
    if (!ts.length) return;
    const ds = tgt(TL_SYN, K) - avg(ts.map(t => t.syn)), dt = tgt(TL_TAC, K) - avg(ts.map(t => t.tac));
    ts.forEach(t => { t.syn = q1(clamp(t.syn + ds, 20, 90)); t.tac = q1(clamp(t.tac + dt, 20, 90)); });
  });

  Object.keys(w).forEach(K => { if (!(K in nw)) delete w[K]; });
  Object.keys(nw).forEach(K => { w[K] = nw[K]; });
  if (!live) return { y };

  // ---- 以下只对正在进行的档 ----
  if (S.team && renames.has(S.team)) {
    const on = S.team, nn = renames.get(S.team);
    tlRenameTeam(on, nn);
    pushEvent(`<b>${on}</b> 的联赛席位转给了 <b>${nn}</b>（真实历史）——队名改为 <b>${nn}</b>，合同照旧。`, "big", "时间线");
  }
  sanitizeRefs(w, renames);
  // 兜底：换页之后世界里必须找得到你的队（找不到就按名单里的「你」找回来），否则下一次渲染就崩
  if (S.career && S.team && !Object.keys(w).some(k => (w[k] || []).some(t => t.name === S.team))) {
    const hit = Object.keys(w).flatMap(k => (w[k] || []).map(t => ({ k, t }))).find(x => (x.t.players || []).some(p => p && p.me));
    if (hit) { S.team = hit.t.name; S.homeLeague = hit.k; }
  }
  if (ldlMoved) {
    try { markTeamJoin(); S.trust = {}; initTrust(); syncTrust(); initRelations(); } catch (e) {}
    const mt = (w.LPL || []).find(t => t.name === S.team);
    if (mt) S.rosterSig = mt.players.map(x => x.id).sort().join("|");
  }
  if (S.baseline && S.baseline.LCP === undefined && S.baseline.PCS !== undefined) S.baseline.LCP = S.baseline.PCS;

  // 休赛期新闻：赛区改制、席位变动、明星转会、离开一线
  const news: string[] = [`<div class="hi">— 真实时间线 · ${y} 休赛期 —</div>`];
  if (TL_STRUCT_NEWS[y]) { news.push(`<div>${TL_STRUCT_NEWS[y]}</div>`); pushEvent(`<b>${y} 赛区调整</b>（真实历史）：${TL_STRUCT_NEWS[y]}`, "info", "赛区"); }
  seatNews.slice(0, 8).forEach(s => news.push(`<div>${s}</div>`));
  const HL = S.homeLeague || "LPL";
  const movers: any[] = [];
  const nowTeam = new Map<string, any>();
  Object.keys(w).forEach(K => { if (K === "LDL") return; (w[K] || []).forEach(t => (t.players || []).forEach(p => { if (p && !p.me) nowTeam.set(p.id, { team: t.name, K, p }); })); });
  nowTeam.forEach((v, id) => {
    const o = oldIdTeam.get(id);
    if (!o || o.team === v.team || renames.get(o.team) === v.team) return;
    movers.push({ id, cn: v.p.cn, from: o.team, to: v.team, K: v.K, star: !!STARS[id] || comp(v.p) >= 80, home: v.K === HL || o.K === HL });
  });
  movers.sort((a, b) => (+b.star - +a.star) || (+b.home - +a.home));
  movers.slice(0, 12).forEach(m => news.push(`<div>转会：<b>${m.id}</b>${m.cn ? `（${m.cn}）` : ""} ${m.from} → ${m.to}</div>`));
  const gone: string[] = [];
  oldIdTeam.forEach((o, id) => { if (!nowTeam.has(id) && (DATA.major || []).includes(o.K) && (STARS[id] || comp(o.p) >= 80)) gone.push(id); });
  if (gone.length) news.push(`<div>离开一线名单：${gone.slice(0, 8).map(x => `<b>${x}</b>`).join("、")}</div>`);
  S.news = (S.news || []).concat(news);
  const homeMoves = movers.filter(m => m.home).slice(0, 4);
  if (homeMoves.length) pushEvent(`<b>${y} 转会期</b>（真实历史）：${homeMoves.map(m => `<b>${m.id}</b> ${m.from} → ${m.to}`).join("；")}${movers.filter(m => m.home).length > 4 ? " 等" : ""}。`, "info", "转会");
  if (ownNews.length) pushEvent(`你的队今年的真实名单变动：${ownNews.join("；")}。<span style="color:var(--ink-3)">新面孔进来，默契要重新磨。</span>`, "bad", "转会");
  return { y, movers: movers.length };
}

/* ---------- 你改写了什么（照 val_player：「在真实历史里这个冠军是 X 拿的」）----------
   史实表（intl.ts 的 INTL_CANON / LEAGUE_CANON，Leaguepedia 逐条取证）只到 S15；S16 起没有史实可比。
   联赛：你所在的赛区按实际打出来的冠军记（S.lgChamps），其余大赛区读季后赛缓存（majorStandings 的 poCache）；
   国际赛读 S.honors。只读、不改任何数值，老档一样显示。 */
export function realChamp(kind, si, lg?, split?) {
  try {
    if (kind === "msi" || kind === "worlds") { const t = INTL_CANON[kind]; return (t && t[si]) || null; }
    const L = LEAGUE_CANON[lg];
    return (L && L[si] && L[si][split || 0]) || null;
  } catch (e) { return null; }
}
/* 冠军揭晓那一句后面接的比对（没有史实就不说） */
export function realNote(kind, si, champ, lg?, split?) {
  const r = realChamp(kind, si, lg, split);
  if (!r || !champ) return "";
  return r === champ ? `<span style="color:var(--ink-3)">（和真实历史一样）</span>`
    : `<span style="color:var(--ink-3)">（真实历史里这一届是 <b>${r}</b> 夺冠）</span>`;
}
/* 赛段结算时记下你所在赛区的冠军：你夺冠就是你；否则按季后赛树的判法（正典顺序里还没被你打掉的最高种子） */
export function noteLeagueChamp(result, poOrder) {
  try {
    const HL = S.homeLeague || "LPL";
    let champ = null;
    if (result === "champion") champ = S.team;
    else {
      const beaten = (S.playoff && S.playoff.beaten) || [];
      const order = poOrder || [];
      champ = order.find(n => n !== S.team && !beaten.includes(n)) || null;
    }
    if (!champ) return;
    S.lgChamps = Object.assign({}, S.lgChamps || {}, { [S.si + "|" + (S.split || 0)]: { lg: HL, team: champ } });
  } catch (e) {}
}
export function rewriteRows() {
  const rows: any[] = [];
  const last = Math.min((S && S.si) || 0, SEASONS.length - 1);
  const H = S.honors || {};
  for (let si = 0; si <= last; si++) {
    const tag = SEASONS[si].tag;
    [0, 1].forEach(sp => {
      const mine = S.lgChamps && S.lgChamps[si + "|" + sp];
      const seen = new Set<string>();
      if (mine) { seen.add(mine.lg); const r = realChamp("league", si, mine.lg, sp); if (r) rows.push({ si, ev: `${tag} ${lgName(mine.lg, si)}${sp ? "夏季赛" : "春季赛"}`, game: mine.team, real: r, home: true }); }
      Object.keys(S.poCache || {}).forEach(k => {
        const [a, b, lg] = k.split("|");
        if (+a !== si || +b !== sp || seen.has(lg)) return;
        const res = S.poCache[k]; const r = realChamp("league", si, lg, sp);
        if (res && res[0] && r) { seen.add(lg); rows.push({ si, ev: `${tag} ${lgName(lg, si)}${sp ? "夏季赛" : "春季赛"}`, game: res[0], real: r }); }
      });
    });
    [["msi", "MSI"], ["worlds", "世界赛"]].forEach(([k, n]) => {
      const g = H[k] && H[k][si], r = realChamp(k, si);
      if (g && r) rows.push({ si, ev: `${tag} ${n}`, game: g, real: r, intl: true });
    });
  }
  rows.forEach(x => { x.same = x.game === x.real; x.mine = !!(S.team && x.game === S.team) || ((S.career && S.career.titles) || []).includes(x.ev.replace(/(春季赛|夏季赛)$/, m => m)); });
  return rows;
}
export function rewriteCard() {
  if (!S || !S.career) return "";
  const rows = rewriteRows();
  const disp = (S.tlDisplaced || []);
  if (!rows.length && !disp.length) return "";
  const changed = rows.filter(x => !x.same), same = rows.length - changed.length;
  const order = (a, b) => (+!!b.intl - +!!a.intl) || (a.si - b.si);
  return `<div class="card"><h2>你改写了什么<em>对照真实历史 · ${changed.length} 处不同 · ${same} 处一样</em></h2>
    ${changed.length ? `<div class="tw"><table><thead><tr><th>赛事</th><th>本作</th><th>真实历史</th></tr></thead><tbody>${
      changed.slice().sort(order).map(x => `<tr class="${x.game === S.team ? "me" : ""}"><td>${x.ev}</td><td><b>${x.game}</b></td><td>${x.real}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="note">你打过的每一届冠军，都和真实历史一样落到了原主手里——世界线没有被撬动。</p>`}
    ${disp.length ? `<h3 style="margin-top:16px;font-size:14px">你顶掉了谁</h3>
      <p class="note">${disp.map(x => `${SEASONS[x.si] ? SEASONS[x.si].tag : ""} <b>${x.team}</b> 的${POSN[x.pos] || x.pos} <b>${x.id}</b>${x.cn ? `（${x.cn}）` : ""}`).join("　·　")}</p>` : ""}
    <p class="note">史实只到 S15（Leaguepedia 逐条取证）；S16 起没有真实历史可比。</p></div>`;
}

/* 休赛期换页（finishOffseason / preNextYear 在 ageWorld 之后调） */
export function tlYearTurn() {
  if (!tlReal() || !S.world) return;
  tlApplyYear(S.world, tlYear(), true);
}
/* 签约时新建的世界：已经走到哪一年，就依次换上 2023…那一年的真实名单 */
export function tlCatchUp(w) {
  if (!tlOn()) return;
  const yNow = tlYear();
  for (let y = TL_FIRST; y <= Math.min(yNow, TL_LAST); y++) tlApplyYear(w, y, false);
}
/* 今年换页会覆盖这支队吗（覆盖的话 ageWorld 不替它退役换人） */
export function tlOverwrites(team, lg) {
  if (!tlReal() || lg === "LDL") return false;
  if (!team || team.name !== S.team) return true;
  const pg = TL_PAGES[tlYear()];
  return !!pg && Object.values(pg.leagues).some((ts: any) => ts.some(t => t.n === team.name || t.from === team.name));
}
