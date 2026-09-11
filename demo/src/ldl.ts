import ldlPages from "../../data/csv/ldl_pages.json";
import { DIMS, SEASONS, avg, clamp, makeRookie, q1, teamCode } from "./main";
import { rnd } from "./rng";
import { S } from "./state";
import { TL_LOGOS, tlRenameTeam } from "./timeline";

/* ================= LDL 真实名单（2026-09-11）=================
   玩家实锤：「LDL 的战队名字不正确」。原来 17 支二队的队名是「母队简称 + .Y」拼出来的（17 支里 11 支和真实不符：
   JDG 的二队叫 Joy Dream、RNG 的叫 Royal Club、TES 的叫 Top Esports Challenger……），2022 年真实 LDL 的 7 支独立队没建，
   真实时间线里 LDL 名单也从来不换。作者拍板：「大修，按照真实的名单更新，我们游戏主打真实」；队名主要写全名，窄的地方写简称。

   · 名单：data/export_ldl.py 按年导出（data/csv/ldl_pages.json）——2022 24 支、2023 20 支、2024 19 支、2025 10 支；2026 停办（timeline.ts）。
   · 开局（所有新档）就是 2022 年真实的 24 支；真实时间线的新档每个休赛期换成那一年的 LDL，还在队里的人带着本作里的成长留下。
   · 平衡是「换人不换强度带」：二队队均仍锚在原来那条带上（母队 −8、不超过 LPL 垫底三队的平均、不低于 48），
     真实评分只决定队里谁强谁弱、独立队在这条带里偏上还是偏下。
   · 你所在的二队在真实历史里解散了：母队把你注册进一队替补席（和 LDL 停办同一条路，见 timeline.ts 的 tlLdlEnd）。 */
export const LDL_PAGES: any = (ldlPages as any).years || {};
const POS5 = ["top", "jng", "mid", "bot", "sup"];
const teamAvg = ps => {
  const xs = (ps || []).filter(q => q && !q.me && q.r);
  return xs.length ? avg(xs.map(q => avg(DIMS.map(d => q.r[d])))) : 0;
};

export function ldlPage(y) { return LDL_PAGES[String(y)] || null; }

/* 对阵图这种窄地方用的简称（Royal Club → RYL）；不是 LDL 的队返回 null */
export function ldlShort(name) {
  if (!name) return null;
  try {
    const t = ((S && S.world && S.world.LDL) || []).find(x => x && x.name === name);
    if (t && t.short) return t.short;
  } catch (e) {}
  for (const y of Object.keys(LDL_PAGES)) {
    const p = (LDL_PAGES[y] || []).find(x => x.n === name);
    if (p) return p.s;
  }
  return null;
}

/* 一年的 LDL。lpl：当年的一线名单（算母队强度和天花板）；old：上一年的 LDL（留人、留默契）；
   taken：当年已经在一线名单里的选手（不在二队重复出现）。没有这一年的真实名单返回 null。 */
export function ldlBuild(y, lpl, old?, taken?) {
  const pg = ldlPage(y);
  if (!pg || !pg.length) return null;
  lpl = lpl || [];
  const means = lpl.map(t => teamAvg(t.players));
  const low = means.length >= 3 ? avg(means.slice().sort((a, b) => a - b).slice(0, 3)) : 62;
  const lvOf = new Map<string, number>();
  lpl.forEach((t, i) => lvOf.set(t.name, Math.max(48, Math.min(means[i] - 8, low))));
  const realMean = pt => { const rs = pt.p.filter(a => a[4]); return rs.length ? avg(rs.map(a => avg(a[4]))) : null; };
  const acad = pg.filter(pt => pt.par && lvOf.has(pt.par));
  const acadLv = acad.length ? avg(acad.map(pt => lvOf.get(pt.par))) : Math.max(48, low - 4);
  const acadReal = acad.map(realMean).filter(v => v != null);
  const realMid = acadReal.length ? avg(acadReal) : null;
  const used = new Set<string>(taken ? Array.from(taken) : []);
  const oldTeams = (old || []).filter(Boolean);
  return pg.map(pt => {
    const par = (pt.par && lvOf.has(pt.par)) ? pt.par : null;
    const rm = realMean(pt);
    // 二队：锚母队；独立队：放在二队强度带里，按真实队均比二队平均高多少、低多少放
    const lv = par ? lvOf.get(par) : clamp(acadLv + ((rm != null && realMid != null) ? rm - realMid : 0), 48, low);
    const shift = rm != null ? lv - rm : 0;
    const parT = par ? lpl.find(t => t.name === par) : null;
    const prev = oldTeams.find(o => o.name === pt.n) || (par ? oldTeams.find(o => o.parent === par) : null);
    const players = POS5.map(pos => {
      const a = pt.p.find(x => x[2] === pos);
      if (a && !used.has(a[0])) {
        used.add(a[0]);
        const kept = prev && (prev.players || []).find(q => q && !q.me && q.id === a[0]);
        if (kept) return Object.assign(kept, { pos, lg: "LDL" });   // 同一个人还在队里：带着他在本作里的成长
        const pl: any = Object.assign(makeRookie(pos, lv, "LDL"), { lg: "LDL", form: 52, retired: false });
        pl.id = a[0]; pl.cn = a[1] || "";
        if (a[4]) DIMS.forEach((d, i) => { pl.r[d] = q1(clamp(a[4][i] + shift, 35, 99)); });
        pl.age = a[3] || (18 + Math.floor(rnd() * 4));
        return pl;
      }
      // 这个位置没有真实首发（或者他今年在一线名单里）：补一个青训生
      const pl: any = Object.assign(makeRookie(pos, lv - 2, "LDL"), { lg: "LDL", form: 52, retired: false });
      pl.age = 17 + Math.floor(rnd() * 5);
      return pl;
    });
    const num = (v, d) => (typeof v === "number" ? v : d);
    return {
      name: pt.n, short: pt.s, parent: par,
      logo: (TL_LOGOS && TL_LOGOS[pt.n]) || (parT && parT.logo) || undefined,
      syn: prev ? prev.syn : Math.max(20, num(parT && parT.syn, 50) - 10),
      tac: prev ? prev.tac : Math.max(20, num(parT && parT.tac, 50) - 10),
      players
    };
  });
}

/* 某家俱乐部在 y 年的二队（真实名单）；那一年没有就看 2022 */
export function ldlRealFor(parent, y) {
  const yy = Math.max(2022, Math.min(2025, y || 2022));
  for (const k of [yy, 2022]) {
    const pg = ldlPage(k);
    const t = pg && pg.find(x => x.par === parent);
    if (t) return t;
  }
  return null;
}

/* 老存档：二队叫「母队简称 + .Y」——按母队换成真实队名。只改名字：名单、数值、队伍数量都不动
   （独立队和队伍增减只在新档里出现；真实时间线的档下一次换页时整页换）。所有记着这个队名的地方一起改。 */
export function ldlFixOldNames(s) {
  if (!s || !s.world || !s.world.LDL) return;
  const sea = SEASONS[(s.si || 0)];
  const y = (s.tl && sea) ? sea.y : 2022;
  s.world.LDL.forEach(t => {
    if (!t || !t.parent || t.short) return;
    if (t.name !== teamCode(t.parent) + ".Y") return;   // 只动拼出来的名字
    const real = ldlRealFor(t.parent, y);
    if (!real || s.world.LDL.some(o => o !== t && o.name === real.n)) return;
    const oldN = t.name;
    t.name = real.n; t.short = real.s;
    if (TL_LOGOS && TL_LOGOS[real.n]) t.logo = TL_LOGOS[real.n];
    renameEverywhere(s, oldN, real.n);
  });
}

function renameEverywhere(s, oldN, newN) {
  if (s === S) tlRenameTeam(oldN, newN);   // 你的队、合同、报价、积分榜、近况
  const swap = a => Array.isArray(a) ? a.map(x => (x === oldN ? newN : x)) : a;
  s.schedule = swap(s.schedule);
  if (s.fix && s.fix.rows) Object.values(s.fix.rows).forEach((r: any) => { if (r && r.opp === oldN) r.opp = newN; });
  [s.career, s.careerBak].forEach(c => ((c && c.log) || []).forEach(x => { if (x && x.team === oldN) x.team = newN; }));
  (s.archive || []).forEach(r => { if (r && r.opp === oldN) r.opp = newN; });
  if (s.playoff && Array.isArray(s.playoff.beaten)) s.playoff.beaten = swap(s.playoff.beaten);
  if (s.pre && s.pre.exPro && s.pre.exPro.team === oldN) s.pre.exPro.team = newN;
}
