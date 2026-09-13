/* ============================================================
   真实赛制表 · LPL / LCK（2026-09-13）
   来源：Leaguepedia 原文与积分表、官方公告、gol.gg 逐场赛果（调研文件 LPL.md / LCK.md）。
   2022–2026 照真实；2027 起按作者规则：回到 2025 的三段制、取消登峰 / 涅槃分组与中途淘汰，保留骑士之路。
   每周轮数（perWeek）按真实赛历折算：一轮 = 每队最多一场。
   ============================================================ */
import { Ctx, Group, SplitSpec, YearSpec } from "./fmtrun";

/* ---------- 小工具（LEC / LCS / 小赛区也用） ---------- */
export const G = (name: string, teams: string[], times?: number): Group => ({ name, teams, times });

/* 蛇形分组：按种子顺序 A B C D D C B A … */
export function snake(teams: string[], n: number, names?: string[]): Group[] {
  const gs = [...Array(n)].map((_, i) => G(names ? names[i] : String.fromCharCode(65 + i) + " 组", []));
  teams.forEach((t, i) => { const r = Math.floor(i / n), k = i % n; gs[r % 2 ? n - 1 - k : k].teams.push(t); });
  return gs;
}
/* 按名次切组 */
export function cut(teams: string[], sizes: number[], names: string[], times?: number[]): Group[] {
  let i = 0; return sizes.map((s, k) => G(names[k], teams.slice(i, i += s), times && times[k]));
}
export const minus = (a: string[], ...b: string[][]) => a.filter(t => !b.some(x => x.includes(t)));

/* 收尾：淘汰树名次在前，其余按 tail 的顺序接上，再补上没出现的队。
   seq=true：名次按顺位（LCK 积分表区分第 3、4 名）；否则并列名次照淘汰树（5–6 名同分）。 */
export function fin(c: Ctx, po: string, tail: string[], seq = false) {
  const pl = c.places(po), order: string[] = [];
  c.adv(po).concat(tail, c.teams).forEach(t => { if (t && !order.includes(t)) order.push(t); });
  const places: Record<string, number> = {};
  order.forEach((t, i) => { places[t] = seq ? i + 1 : (pl[t] ?? i + 1); });
  return { order, places };
}
const topBy = (c: Ctx, key: string, g?: string) => c.table(key, g);
const slotsOf = (c: Ctx, ev: string, order: string[]) => order.slice(0, c.slots(ev));

/* 地区资格赛（LPL 2022–2026、LCK 2022–2024）：
   世界赛 1 号＝最后一个赛段冠军，2 号＝积分最高，其余积分前 4 打瀑布赛争 3、4 号 */
export function rfSplit(lastKey: string): SplitSpec {
  const cands = (c: Ctx) => {
    const last = c.split(lastKey)!; const champ = last.champ!;
    const byPts = c.teams.filter(t => t !== champ).sort((x, y) => ((c.pts[y] || 0) - (c.pts[x] || 0)) || ((last.places[x] || 99) - (last.places[y] || 99)));
    return { champ, seed2: byPts[0], rf: byPts.slice(1, 5) };
  };
  return {
    key: "rf", name: "地区资格赛", short: "资格赛", title: false, half: 1, after: "worlds",
    stages: [{ key: "rf", name: "地区资格赛", kind: "q", type: "br", tpl: "WF4", perWeek: 2, seeds: c => cands(c).rf }],
    finish: c => {
      const { champ, seed2 } = cands(c); const rf = c.adv("rf");
      const order = [champ, seed2, ...rf];
      const places: Record<string, number> = {}; order.forEach((t, i) => { places[t] = i + 1; });
      return { order, places, champ, intl: order.slice(0, c.slots("worlds")), aux: true };
    }
  };
}

/* ---------- LPL ---------- */
const P_SPRING = [90, 70, 50, 30, 20, 20, 10, 10];
const P_SUMMER = [0, 110, 80, 60, 40, 40, 10, 10];

function lplClassic(year: number): YearSpec {
  const sp = (key: string, name: string, short: string, half: 0 | 1, after: "msi" | null, pts: number[]): SplitSpec => ({
    key, name, short, half, after, pts,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 2 },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "KOTH10", perWeek: 2, seeds: c => topBy(c, "rs").slice(0, 10) }
    ],
    finish: c => { const f = fin(c, "po", topBy(c, "rs")); return { ...f, intl: after ? slotsOf(c, after, f.order) : undefined }; }
  });
  const spring = sp("spring", "春季赛", "春", 0, "msi", P_SPRING);
  if (year < 2024) return { lg: "LPL", year, splits: [spring, sp("summer", "夏季赛", "夏", 1, null, P_SUMMER), rfSplit("summer")] };
  /* 2024 夏季赛：定组赛 → 登峰 9 / 涅槃 8 → 骑士之路 → 十队冒泡赛 */
  const summer: SplitSpec = {
    key: "summer", name: "夏季赛", short: "夏", half: 1, after: null, pts: [200, 110, 80, 60, 40, 40, 10, 10],
    stages: [
      { key: "pl", name: "定组赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 3, groups: c => snake(c.teams, 4) },
      {
        key: "ru", name: "组内赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 3, groups: c => {
          const A: string[] = [], N: string[] = [];
          c.groups("pl").forEach(g => { const t = topBy(c, "pl", g.name); A.push(...t.slice(0, t.length - 2)); N.push(...t.slice(-2)); });
          const byPrev = (x: string, y: string) => c.prevRank.indexOf(x) - c.prevRank.indexOf(y);
          return [G("登峰组", A.sort(byPrev)), G("涅槃组", N.sort(byPrev))];
        }
      },
      { key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR", n: 3, perWeek: 1, seeds: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return [A[7], N[3], A[8], N[2], N[0], N[1]]; } },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "KOTH10", perWeek: 2, seeds: c => topBy(c, "ru", "登峰组").slice(0, 7).concat(c.adv("kr", 3)) }
    ],
    finish: c => {
      const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组");
      return { ...fin(c, "po", A.concat(N)), outSeason: N.slice(4) };
    }
  };
  return { lg: "LPL", year, splits: [spring, summer, rfSplit("summer")] };
}

function lpl2025(): YearSpec {
  const s1: SplitSpec = {
    key: "s1", name: "第一赛段", short: "S1", half: 0, after: "fst", pts: [20, 15, 10, 10, 5, 5, 5, 5],
    stages: [
      { key: "g", name: "小组赛", kind: "rr", type: "rr", times: 1, bo: 5, perWeek: 1, groups: c => snake(c.teams, 4) },
      {
        key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE8UL", perWeek: 3, seeds: c => {
          const gs = c.groups("g").map(g => topBy(c, "g", g.name));
          return gs.map(t => t[0]).concat(gs.map(t => t[1]));
        }
      }
    ],
    finish: c => { const f = fin(c, "po", topBy(c, "g")); return { ...f, intl: slotsOf(c, "fst", f.order) }; }
  };
  const s2: SplitSpec = {
    key: "s2", name: "第二赛段", short: "S2", half: 0, after: "msi", pts: P_SPRING,
    stages: [
      { key: "pl", name: "定组赛", kind: "rr", type: "rr", times: 2, bo: 1, perWeek: 4, groups: c => snake(c.teams, 4) },
      { key: "lcq", name: "登峰晋升赛", kind: "ki", type: "br", tpl: "GSL4", boAll: 3, perWeek: 3, seeds: c => c.groups("pl").map(g => topBy(c, "pl", g.name)[2]) },
      {
        key: "ru", name: "组内赛", kind: "rr", type: "rr", bo: 3, perWeek: 3, groups: c => {
          const gs = c.groups("pl").map(g => topBy(c, "pl", g.name));
          const up = c.adv("lcq", 2), lcq = c.adv("lcq");
          const A = gs.map(t => t[0]).concat(gs.map(t => t[1]), up);
          const N = gs.map(t => t[3]).concat(lcq.slice(2));
          return [G("登峰组", A, 2), G("涅槃组", N, 1)];
        }
      },
      { key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR", n: 4, perWeek: 1, seeds: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return [A[4], N[0], A[5], N[1], A[6], A[9], A[7], A[8]]; } },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE8", perWeek: 3, seeds: c => topBy(c, "ru", "登峰组").slice(0, 4).concat(c.adv("kr", 4)) }
    ],
    finish: c => {
      const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组");
      const f = fin(c, "po", A.concat(N));
      return { ...f, outSeason: N.slice(4), intl: slotsOf(c, "msi", f.order) };
    }
  };
  const s3: SplitSpec = {
    key: "s3", name: "第三赛段", short: "S3", half: 1, after: null, pts: P_SUMMER,
    stages: [
      {
        key: "ru", name: "组内赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 3, groups: c => {
          const A = c.split("s2")!.order.filter(t => c.teams.includes(t)).slice(0, 8);
          return [G("登峰组", A), G("涅槃组", minus(c.teams, A))];
        }
      },
      { key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR", n: 4, perWeek: 1, seeds: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return [A[4], N[3], A[5], N[2], A[6], N[1], A[7], N[0]]; } },
      { key: "po", name: "赛季季后赛", kind: "po", type: "br", tpl: "DE8", perWeek: 3, seeds: c => topBy(c, "ru", "登峰组").slice(0, 4).concat(c.adv("kr", 4)) }
    ],
    finish: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return fin(c, "po", A.concat(N)); }
  };
  return { lg: "LPL", year: 2025, splits: [s1, s2, s3, rfSplit("s3")] };
}

function lpl2026(): YearSpec {
  const s1: SplitSpec = {
    key: "s1", name: "第一赛段", short: "S1", half: 0, after: "fst", pts: [80, 50, 40, 20, 10, 10, 5, 5],
    stages: [
      { key: "g", name: "分组赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 3, groups: c => cut(c.teams, [6, 4, c.teams.length - 10], ["登峰组", "坚毅组", "涅槃组"]) },
      {
        key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR3", perWeek: 2, seeds: c => {
          const A = topBy(c, "g", "登峰组"), P = topBy(c, "g", "坚毅组"), N = topBy(c, "g", "涅槃组");
          return [A[4], P[1], A[5], P[0], P[2], N[1], P[3], N[0]];
        }
      },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE8", perWeek: 3, seeds: c => topBy(c, "g", "登峰组").slice(0, 4).concat(c.adv("kr", 4)) }
    ],
    finish: c => {
      const f = fin(c, "po", topBy(c, "g", "登峰组").concat(topBy(c, "g", "坚毅组"), topBy(c, "g", "涅槃组")));
      return { ...f, intl: slotsOf(c, "fst", f.order) };
    }
  };
  const s2: SplitSpec = {
    key: "s2", name: "第二赛段", short: "S2", half: 0, after: "msi", pts: [110, 80, 50, 30, 15, 15, 10, 10],
    stages: [
      {
        key: "ru", name: "组内赛", kind: "rr", type: "rr", bo: 3, perWeek: 2, groups: c => {
          const A = c.split("s1")!.order.slice(0, 8);
          return [G("登峰组", A, 2), G("涅槃组", minus(c.teams, A), 1)];
        }
      },
      { key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR", n: 4, perWeek: 1, seeds: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return [A[4], N[3], A[5], N[2], A[6], N[1], A[7], N[0]]; } },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE8", perWeek: 3, seeds: c => topBy(c, "ru", "登峰组").slice(0, 4).concat(c.adv("kr", 4)) }
    ],
    finish: c => {
      const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组");
      const f = fin(c, "po", A.concat(N));
      return { ...f, outSeason: N.slice(4), intl: slotsOf(c, "msi", f.order) };
    }
  };
  const s3: SplitSpec = {
    key: "s3", name: "第三赛段", short: "S3", half: 1, after: null, pts: [0, 110, 80, 50, 30, 30, 15, 15],
    stages: [
      {
        key: "ru", name: "组内赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 3, groups: c => {
          const A = c.split("s2")!.order.filter(t => c.teams.includes(t)).slice(0, 8);
          return [G("登峰组", A), G("涅槃组", minus(c.teams, A))];
        }
      },
      { key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR", n: 2, perWeek: 1, seeds: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return [A[6], N[1], A[7], N[0]]; } },
      { key: "po", name: "总决赛", kind: "po", type: "br", tpl: "DE8K", perWeek: 3, seeds: c => topBy(c, "ru", "登峰组").slice(0, 6).concat(c.adv("kr", 2)) }
    ],
    finish: c => { const A = topBy(c, "ru", "登峰组"), N = topBy(c, "ru", "涅槃组"); return fin(c, "po", A.concat(N)); }
  };
  return { lg: "LPL", year: 2026, splits: [s1, s2, s3, rfSplit("s3")] };
}

/* 2027 起（作者规则）：三段制，不分登峰 / 涅槃、不中途淘汰；第二、三赛段 5–12 名打骑士之路 */
function lpl2027(year: number): YearSpec {
  const krSeeds = (t: string[]) => { const n = Math.max(1, Math.min(4, Math.floor((t.length - 4) / 2))); const out: string[] = []; for (let i = 0; i < n; i++) out.push(t[4 + i], t[3 + 2 * n - i]); return out; };
  const split = (key: string, name: string, short: string, half: 0 | 1, after: "msi" | null, pts: number[]): SplitSpec => ({
    key, name, short, half, after, pts,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 2 },
      { key: "kr", name: "骑士之路", kind: "ki", type: "br", tpl: "KR", n: 4, perWeek: 1, seeds: c => krSeeds(topBy(c, "rs")) },
      { key: "po", name: key === "s3" ? "赛季季后赛" : "季后赛", kind: "po", type: "br", tpl: "DE8", perWeek: 3, seeds: c => topBy(c, "rs").slice(0, 4).concat(c.adv("kr", 4)) }
    ],
    finish: c => { const f = fin(c, "po", topBy(c, "rs")); return { ...f, intl: after ? slotsOf(c, after, f.order) : undefined }; }
  });
  const s1: SplitSpec = {
    key: "s1", name: "第一赛段", short: "S1", half: 0, after: "fst", pts: [20, 15, 10, 10, 5, 5, 5, 5],
    stages: [
      { key: "g", name: "小组赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 2, groups: c => snake(c.teams, 2) },
      {
        key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE8UL", perWeek: 3, seeds: c => {
          const [a, b] = c.groups("g").map(g => topBy(c, "g", g.name));
          return [a[0], b[0], a[1], b[1], a[2], b[2], a[3], b[3]];
        }
      }
    ],
    finish: c => { const f = fin(c, "po", topBy(c, "g")); return { ...f, intl: slotsOf(c, "fst", f.order) }; }
  };
  return { lg: "LPL", year, label: "2025 三段制（取消涅槃）", splits: [s1, split("s2", "第二赛段", "S2", 0, "msi", P_SPRING), split("s3", "第三赛段", "S3", 1, null, P_SUMMER), rfSplit("s3")] };
}

export function lplYear(y: number): YearSpec {
  return y <= 2024 ? lplClassic(Math.max(2022, y)) : y === 2025 ? lpl2025() : y === 2026 ? lpl2026() : lpl2027(y);
}

/* ---------- LCK ---------- */
function lckClassic(year: number): YearSpec {
  const tpl = year === 2022 ? "SE6" : "LCK23";
  const sp = (key: string, name: string, short: string, half: 0 | 1, after: "msi" | null, pts: number[]): SplitSpec => ({
    key, name, short, half, after, pts,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 2 },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl, perWeek: 2, seeds: c => topBy(c, "rs").slice(0, 6) }
    ],
    finish: c => { const f = fin(c, "po", topBy(c, "rs"), true); return { ...f, intl: after ? slotsOf(c, after, f.order) : undefined }; }
  });
  return { lg: "LCK", year, splits: [sp("spring", "春季赛", "春", 0, "msi", [90, 70, 50, 30, 20, 10]), sp("summer", "夏季赛", "夏", 1, null, [0, 100, 80, 50, 30, 10]), rfSplit("summer")] };
}

function lckCup(sup: boolean): SplitSpec {
  const groupsOf = (c: Ctx) => {
    const gs = c.groups("gb").map(g => ({ name: g.name, rows: c.rows("gb", g.name) }));
    const tot = gs.map(g => g.rows.reduce((s, r) => s + r.pts, 0));
    const [W, L] = tot[0] >= tot[1] ? [gs[0], gs[1]] : [gs[1], gs[0]];
    return { W: W.rows.map(r => r.team), L: L.rows.map(r => r.team), wins: Object.fromEntries(gs.flatMap(g => g.rows.map(r => [r.team, r.pts]))) as Record<string, number> };
  };
  const direct = (c: Ctx) => { const { W, L } = groupsOf(c); return sup ? [W[0], W[1], L[0]] : [W[0], W[1], W[2]]; };
  const piTeams = (c: Ctx) => { const { W, L, wins } = groupsOf(c); const t = sup ? W.slice(2).concat(L.slice(1, 4)) : W.slice(3).concat(L.slice(0, 4)); return t.sort((x, y) => (wins[y] - wins[x]) || (c.prevRank.indexOf(x) - c.prevRank.indexOf(y))); };
  return {
    key: "cup", name: "LCK Cup", short: "杯", title: " Cup", half: 0, after: "fst",
    stages: [
      { key: "gb", name: "组间对抗", kind: "rr", type: "cross", bo: 3, superWeek: sup, perWeek: 2, groups: c => snake(c.teams, 2, ["巴隆组", "远古龙组"]) },
      { key: "pi", name: "入围赛", kind: "ki", type: "br", tpl: "PI6", perWeek: 3, seeds: piTeams },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: sup ? "DE6F" : "LCK23", perWeek: 3, seeds: c => direct(c).concat(c.adv("pi", 3)) }
    ],
    finish: c => { const { W, L } = groupsOf(c); const f = fin(c, "po", c.adv("pi").concat(W, L), true); return { ...f, intl: slotsOf(c, "fst", f.order) }; }
  };
}

function lckLong(year: number, rounds: 2 | 3, piTpl: "GSL4" | "WF4"): YearSpec {
  const r12: SplitSpec = {
    key: "r12", name: "第 1–2 轮", short: "1–2 轮", title: false, half: 0, after: "msi",
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 2 },
      { key: "rtm", name: "Road to MSI", kind: "q", type: "br", tpl: "RTMSI", perWeek: 2, seeds: c => topBy(c, "rs").slice(0, 6) }
    ],
    finish: c => { const f = fin(c, "rtm", topBy(c, "rs"), true); return { ...f, rows: c.rows("rs"), intl: slotsOf(c, "msi", f.order) }; }
  };
  const r3: SplitSpec = {
    key: "r35", name: rounds === 3 ? "第 3–5 轮" : "第 3–4 轮", short: rounds === 3 ? "3–5 轮" : "3–4 轮", title: "季后赛", half: 1, after: null,
    stages: [
      {
        key: "ru", name: "Legend / Rise", kind: "rr", type: "rr", times: rounds, bo: 3, perWeek: 3, carrySplit: "r12", groups: c => {
          const t = (c.split("r12")!.rows || []).map(r => r.team).filter(x => c.teams.includes(x));
          return [G("Legend 组", t.slice(0, 5)), G("Rise 组", minus(c.teams, t.slice(0, 5)))];
        }
      },
      { key: "pi", name: "季后入围赛", kind: "ki", type: "br", tpl: piTpl, perWeek: 3, seeds: c => { const L = topBy(c, "ru", "Legend 组"), R = topBy(c, "ru", "Rise 组"); return piTpl === "GSL4" ? [L[4], R[0], R[1], R[2]] : [L[4], R[0], R[1], R[2]]; } },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE6F", perWeek: 3, seeds: c => topBy(c, "ru", "Legend 组").slice(0, 4).concat(c.adv("pi", 2)) }
    ],
    finish: c => { const L = topBy(c, "ru", "Legend 组"), R = topBy(c, "ru", "Rise 组"); const f = fin(c, "po", c.adv("pi").concat(L, R), true); return { ...f, intl: slotsOf(c, "worlds", f.order) }; }
  };
  /* GSL4 的 s1 v s4 = Legend 5 v Rise 3、s2 v s3 = Rise 1 v Rise 2；WF4 的 s1 v s2 = Legend 5 v Rise 1、s3 v s4 = Rise 2 v Rise 3：同一串种子两种模板都对 */
  return { lg: "LCK", year, splits: [lckCup(year === 2026), r12, { ...r3, after: "worlds" }] };
}

export function lckYear(y: number): YearSpec {
  return y <= 2024 ? lckClassic(Math.max(2022, y)) : y === 2026 ? lckLong(2026, 2, "WF4") : { ...lckLong(y, 3, "GSL4"), label: y > 2026 ? "回到 2025（第 3–5 轮）" : undefined };
}
