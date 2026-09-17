/* ============================================================
   真实赛制表 · LEC / LCS·LTA / 小赛区 / LDL / 国际赛名额 / 总注册表（2026-09-13）
   来源：调研文件 LEC.md / LCS_LTA.md / INTL_LCP.md。
   简化（写在这里，别处不再重复）：
   · LEC 2026 Versus 的两支次级联赛邀请队不进游戏（游戏世界里没有这两支队），Versus 按 10 队打。
   · LTA 2025 只跑北区（游戏里的 LCS）；跨区季后赛 / 美洲总决赛按北区打，南区是小赛区（CBLOL 键）。
   · LCS 2026 Lock-In 1-2 战绩的 BO1 加赛省掉，按小分定 5、6 号。
   · 小赛区是 4 队简化联赛；LDL 的赛段跟 LPL 对齐，好让注册窗、国际赛同步。
   ============================================================ */
import { Ctx, SplitSpec, YearSpec } from "./fmtrun";
import { G, snake, fin, minus, lplYear, lckYear, rfSplit } from "./fmtspec";

void rfSplit;
const T = (c: Ctx, key: string, g?: string) => c.table(key, g);
const sl = (c: Ctx, ev: string, order: string[]) => order.slice(0, c.slots(ev));

/* ---------- LEC ---------- */
function lecSplit(o: { key: string; name: string; half: 0 | 1; after: SplitSpec["after"]; bo: 1 | 3; times?: number; perWeek: number; po: "DE6A" | "DE8B"; pts?: number[]; title?: string }): SplitSpec {
  const n = o.po === "DE6A" ? 6 : 8;
  return {
    key: o.key, name: o.name, short: o.name.slice(0, 1), title: o.title, half: o.half, after: o.after, pts: o.pts,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: o.times || 1, bo: o.bo, perWeek: o.perWeek },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: o.po, perWeek: o.po === "DE8B" ? 3 : 2, seeds: c => T(c, "rs").slice(0, n) }
    ],
    finish: c => { const f = fin(c, "po", T(c, "rs"), true); return { ...f, intl: o.after ? sl(c, o.after, f.order) : undefined }; }
  };
}
/* LEC 2023 赛段：单循环 BO1 → 两个 GSL 小组 → 4 队双败 */
function lec23Split(key: string, name: string, half: 0 | 1, after: SplitSpec["after"], pts: number[]): SplitSpec {
  return {
    key, name, short: name.slice(0, 1), half, after, pts,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 1, bo: 1, perWeek: 3 },
      { key: "gs", name: "分组赛", kind: "ki", type: "br", tpl: "GSL8", boAll: 3, perWeek: 2, seeds: c => T(c, "rs").slice(0, 8) },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE4", perWeek: 3, seeds: c => { const r = c.br("gs")!.res; return [r.aw.w!, r.bw.w!, r.ad.w!, r.bd.w!]; } }
    ],
    finish: c => {
      const f = fin(c, "po", c.adv("gs").concat(T(c, "rs")), true);
      return { ...f, intl: after ? sl(c, after, f.order) : undefined };
    }
  };
}
/* LEC 2023–2024 赛季总决赛：三个赛段冠军（2024：冬冠、春冠、夏季前 3）+ 积分补足 6 队，按积分排种子 */
function lecFinals(year: number): SplitSpec {
  const field = (c: Ctx) => {
    const byPts = c.teams.slice().sort((x, y) => (c.pts[y] || 0) - (c.pts[x] || 0));
    const sure = year === 2023
      ? ["winter", "spring", "summer"].map(k => c.split(k)?.champ)
      : [c.split("winter")?.champ, c.split("spring")?.champ].concat((c.split("summer")?.order || []).slice(0, 3));
    const out: string[] = [];
    sure.forEach(t => { if (t && !out.includes(t)) out.push(t); });
    byPts.forEach(t => { if (out.length < 6 && !out.includes(t)) out.push(t); });
    return out.sort((x, y) => (c.pts[y] || 0) - (c.pts[x] || 0));
  };
  return {
    key: "finals", name: "赛季总决赛", short: "总决赛", half: 1, after: "worlds",
    stages: [{ key: "po", name: "赛季总决赛", kind: "po", type: "br", tpl: "DE6A", perWeek: 2, seeds: field }],
    finish: c => { const f = fin(c, "po", c.teams.slice().sort((x, y) => (c.pts[y] || 0) - (c.pts[x] || 0)), true); return { ...f, intl: sl(c, "worlds", f.order) }; }
  };
}
/* MSI 两个名额（LEC 2023–2024）：春冠第一、冬冠第二；同一队拿两冠则积分次高补上 */
function lecMsiPair(sp: SplitSpec): SplitSpec {
  return {
    ...sp, finish: c => {
      const f = sp.finish(c); const win = c.split("winter")?.champ;
      const first = f.order[0];
      const second = win && win !== first ? win : c.teams.filter(t => t !== first).sort((x, y) => (c.pts[y] || 0) - (c.pts[x] || 0))[0];
      return { ...f, intl: [first, second].slice(0, c.slots("msi")) };
    }
  };
}
function lec2025Summer(): SplitSpec {
  return {
    key: "summer", name: "夏季赛", short: "夏", half: 1, after: "worlds",
    stages: [
      { key: "gs", name: "分组赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 2, groups: c => snake(c.teams, 2) },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE8UL", perWeek: 2, seeds: c => { const [a, b] = c.groups("gs").map(g => T(c, "gs", g.name)); return [a[0], b[0], b[1], a[1], a[2], b[2], a[3], b[3]]; } }
    ],
    finish: c => { const f = fin(c, "po", T(c, "gs"), true); return { ...f, intl: sl(c, "worlds", f.order) }; }
  };
}
export function lecYear(y: number): YearSpec {
  if (y <= 2022) return { lg: "LEC", year: 2022, splits: [
    lecSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 1, times: 2, perWeek: 3, po: "DE6A" }),
    lecSplit({ key: "summer", name: "夏季赛", half: 1, after: "worlds", bo: 1, times: 2, perWeek: 3, po: "DE6A" })] };
  if (y === 2023) {
    const ws = [120, 100, 80, 60, 50, 40, 30, 20, 10, 5], su = [180, 150, 120, 90, 75, 60, 45, 30, 15, 7];
    return { lg: "LEC", year: y, splits: [lec23Split("winter", "冬季赛", 0, null, ws), lecMsiPair(lec23Split("spring", "春季赛", 0, "msi", ws)), lec23Split("summer", "夏季赛", 1, null, su), lecFinals(2023)] };
  }
  if (y === 2024) return { lg: "LEC", year: y, splits: [
    lecSplit({ key: "winter", name: "冬季赛", half: 0, after: null, bo: 1, perWeek: 3, po: "DE8B", pts: [120, 100, 80, 60, 45, 45, 30, 30] }),
    lecMsiPair(lecSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 1, perWeek: 3, po: "DE8B", pts: [145, 120, 95, 70, 55, 55, 35, 35] })),
    lecSplit({ key: "summer", name: "夏季赛", half: 1, after: null, bo: 1, perWeek: 3, po: "DE8B", pts: [180, 150, 120, 90, 65, 65, 45, 45] }),
    lecFinals(2024)] };
  if (y === 2026) return { lg: "LEC", year: y, splits: [
    lecSplit({ key: "versus", name: "LEC Versus", title: " Versus", half: 0, after: "fst", bo: 1, perWeek: 3, po: "DE8B" }),
    lecSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 3, perWeek: 2, po: "DE6A" }),
    lecSplit({ key: "summer", name: "夏季赛", half: 1, after: "worlds", bo: 3, perWeek: 2, po: "DE6A" })] };
  return { lg: "LEC", year: y, label: y > 2026 ? "回到 2025（冬 · 春 · 夏）" : undefined, splits: [
    lecSplit({ key: "winter", name: "冬季赛", half: 0, after: "fst", bo: 1, perWeek: 3, po: "DE8B" }),
    lecSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 3, perWeek: 2, po: "DE6A" }),
    lec2025Summer()] };
}

/* ---------- LCS / LTA ---------- */
function lcsSplit(o: { key: string; name: string; half: 0 | 1; after: SplitSpec["after"]; bo: 1 | 3; times: number; perWeek: number; po: "DE6A" | "DE6F" | "DE8K"; title?: string }): SplitSpec {
  const n = o.po === "DE8K" ? 8 : 6;
  return {
    key: o.key, name: o.name, short: o.name.slice(0, 1), title: o.title, half: o.half, after: o.after,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: o.times, bo: o.bo, perWeek: o.perWeek },
      { key: "po", name: o.po === "DE8K" ? "总决赛" : "季后赛", kind: "po", type: "br", tpl: o.po, perWeek: 2, seeds: c => T(c, "rs").slice(0, n) }
    ],
    finish: c => { const f = fin(c, "po", T(c, "rs"), true); return { ...f, intl: o.after ? sl(c, o.after, f.order) : undefined }; }
  };
}
function lcs2022LockIn(): SplitSpec {
  return {
    key: "lockin", name: "Lock In 季前杯", short: "杯", title: " Lock In", half: 0, after: null,
    stages: [
      { key: "gs", name: "小组赛", kind: "rr", type: "rr", times: 1, bo: 1, perWeek: 3, groups: c => snake(c.teams, 2) },
      { key: "po", name: "淘汰赛", kind: "po", type: "br", tpl: "SE8", perWeek: 2, seeds: c => { const [a, b] = c.groups("gs").map(g => T(c, "gs", g.name)); return [a[0], b[0], a[1], b[1], a[2], b[2], a[3], b[3]]; } }
    ],
    finish: c => fin(c, "po", T(c, "gs"), true)
  };
}
function lta2025(): YearSpec {
  const s1: SplitSpec = {
    key: "s1", name: "第一赛段", short: "S1", half: 0, after: "fst",
    stages: [
      { key: "cq", name: "分区赛", kind: "ki", type: "br", tpl: "Q8", perWeek: 1, seeds: c => c.teams.slice(0, 8) },
      { key: "po", name: "跨区季后赛", kind: "po", type: "br", tpl: "SE4", boAll: 5, perWeek: 1, seeds: c => c.adv("cq", 4) }
    ],
    finish: c => { const f = fin(c, "po", c.adv("cq"), true); return { ...f, intl: sl(c, "fst", f.order) }; }
  };
  const s2: SplitSpec = {
    key: "s2", name: "第二赛段", short: "S2", half: 0, after: "msi",
    stages: [
      { key: "pos", name: "定位赛", kind: "rr", type: "rr", times: 1, bo: 1, perWeek: 3 },
      { key: "gs", name: "小组赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 1, groups: c => { const t = T(c, "pos"); return [G("A 组", [t[0], t[3], t[4], t[7]]), G("B 组", [t[1], t[2], t[5], t[6]])]; } },
      { key: "sd", name: "排位赛", kind: "q", type: "br", tpl: "KR", n: 4, boAll: 3, perWeek: 1, seeds: c => { const a = T(c, "gs", "A 组"), b = T(c, "gs", "B 组"); return [a[0], b[0], a[1], b[1], a[2], b[3], b[2], a[3]]; } },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE6A", perWeek: 2, seeds: c => { const r = c.br("sd")!.res; return [r.k1.w!, r.k1.l!, r.k2.w!, r.k2.l!, r.k3.w!, r.k4.w!]; } }
    ],
    finish: c => { const f = fin(c, "po", c.adv("sd").concat(T(c, "pos")), true); return { ...f, intl: sl(c, "msi", f.order) }; }
  };
  const s3: SplitSpec = {
    key: "s3", name: "第三赛段", short: "S3", half: 1, after: "worlds",
    stages: [
      { key: "pp", name: "挑对手赛", kind: "rr", type: "swiss", swissRounds: 3, bo: 3, perWeek: 1 },
      { key: "po", name: "淘汰赛", kind: "po", type: "br", tpl: "DE8UL", perWeek: 2, seeds: c => T(c, "pp").slice(0, 8) }
    ],
    finish: c => { const f = fin(c, "po", T(c, "pp"), true); return { ...f, intl: sl(c, "worlds", f.order) }; }
  };
  return { lg: "LCS", year: 2025, splits: [s1, s2, s3] };
}
function lcs2026(y: number): YearSpec {
  const lock: SplitSpec = {
    key: "lockin", name: "Lock-In", short: "Lock-In", title: " Lock-In", half: 0, after: "fst",
    stages: [
      { key: "sw", name: "瑞士轮", kind: "rr", type: "swiss", swissRounds: 3, bo: 3, perWeek: 1 },
      { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "DE6A", perWeek: 2, seeds: c => T(c, "sw").slice(0, 6) }
    ],
    finish: c => { const f = fin(c, "po", T(c, "sw"), true); return { ...f, intl: sl(c, "fst", f.order) }; }
  };
  return { lg: "LCS", year: y, label: y > 2026 ? "沿用 2026" : undefined, splits: [
    lock,
    lcsSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 3, times: 1, perWeek: 2, po: "DE6A" }),
    lcsSplit({ key: "summer", name: "夏季赛", half: 1, after: "worlds", bo: 3, times: 1, perWeek: 2, po: "DE6F" })] };
}
export function lcsYear(y: number): YearSpec {
  if (y <= 2022) return { lg: "LCS", year: 2022, splits: [lcs2022LockIn(),
    lcsSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 1, times: 2, perWeek: 3, po: "DE6A" }),
    lcsSplit({ key: "summer", name: "夏季赛", half: 1, after: "worlds", bo: 1, times: 2, perWeek: 3, po: "DE8K" })] };
  if (y === 2023) return { lg: "LCS", year: y, splits: [
    lcsSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 1, times: 2, perWeek: 3, po: "DE6A" }),
    lcsSplit({ key: "summer", name: "夏季赛", half: 1, after: "worlds", bo: 1, times: 2, perWeek: 3, po: "DE8K" })] };
  if (y === 2024) return { lg: "LCS", year: y, splits: [
    lcsSplit({ key: "spring", name: "春季赛", half: 0, after: "msi", bo: 1, times: 2, perWeek: 3, po: "DE6A" }),
    lcsSplit({ key: "summer", name: "夏季赛", half: 1, after: "worlds", bo: 3, times: 1, perWeek: 2, po: "DE6F" })] };
  if (y === 2025) return lta2025();
  return lcs2026(y);
}

/* ---------- 小赛区（4 队简化联赛）：每个国际赛前一个赛段 ---------- */
export function minorYear(lg: string, y: number): YearSpec {
  const evs: ("fst" | "msi" | "worlds")[] = y <= 2024 ? ["msi", "worlds"] : ["fst", "msi", "worlds"];
  const names = evs.length === 2 ? ["春季赛", "夏季赛"] : ["第一赛段", "第二赛段", "第三赛段"];
  return {
    lg, year: y, splits: evs.map((ev, i): SplitSpec => ({
      key: "m" + (i + 1), name: names[i], short: names[i].slice(0, evs.length === 2 ? 1 : 2), half: ev === "worlds" ? 1 : 0, after: ev,
      stages: [
        { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: evs.length === 2 ? 3 : 2, bo: 3, perWeek: 1 },
        { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "SE4", perWeek: 1, seeds: c => T(c, "rs").slice(0, 4) }
      ],
      finish: c => { const f = fin(c, "po", T(c, "rs"), true); return { ...f, intl: sl(c, ev, f.order) }; }
    }))
  };
}

/* ---------- LDL（真实时间线里 2025 年是最后一年）：赛段与 LPL 对齐 ---------- */
export function ldlYear(y: number, teamCount: number): YearSpec {
  const evs: { ev: "fst" | "msi" | "worlds"; name: string; pw: number }[] = y <= 2024
    ? [{ ev: "msi", name: "春季赛", pw: 1 }, { ev: "worlds", name: "夏季赛", pw: 1 }]
    : [{ ev: "fst", name: "第一赛段", pw: 3 }, { ev: "msi", name: "第二赛段", pw: 1 }, { ev: "worlds", name: "第三赛段", pw: 2 }];
  return {
    lg: "LDL", year: y, splits: evs.map((e, i): SplitSpec => ({
      key: "d" + (i + 1), name: e.name, short: e.name.slice(0, y <= 2024 ? 1 : 2), half: e.ev === "worlds" ? 1 : 0, after: e.ev,
      stages: [
        { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: teamCount > 24 ? Math.max(2, e.pw) : e.pw,
          groups: c => teamCount > 24 ? snake(c.teams, 4) : teamCount > 12 ? snake(c.teams, 2) : [G("", c.teams)] },   // 2018 LDL 32 队：东南西北四组
        {
          key: "po", name: "季后赛", kind: "po", type: "br", tpl: "SE6", perWeek: 2, seeds: c => {
            const gs = c.groups("rs"); if (gs.length < 2) return T(c, "rs").slice(0, 6);
            const ts = gs.map(g => T(c, "rs", g.name)), out: string[] = [];
            for (let k = 0; out.length < 6 && k < 16; k++) ts.forEach(t => { if (t[k] && out.length < 6) out.push(t[k]); });
            return out;
          }
        }
      ],
      finish: c => fin(c, "po", T(c, "rs"), true)
    }))
  };
}

/* ---------- 国际赛名额（2027 起按 2026） ---------- */
export interface IntlYear { fst?: Record<string, number>; msi: Record<string, number>; worlds: Record<string, number>; bonus?: boolean; wqs?: [string, string] }
export const INTL_SLOTS: Record<number, IntlYear> = {
  2022: { msi: { LPL: 1, LCK: 1, LEC: 1, LCS: 1, PCS: 1, VCS: 1, CBLOL: 1, LJL: 1, LLA: 1, LCO: 1, TCL: 1 }, worlds: { LPL: 4, LCK: 4, LEC: 4, LCS: 3, PCS: 2, VCS: 2, CBLOL: 1, LJL: 1, LLA: 1, LCO: 1, TCL: 1 } },
  2023: { msi: { LPL: 2, LCK: 2, LEC: 2, LCS: 2, PCS: 1, VCS: 1, LJL: 1, CBLOL: 1, LLA: 1 }, worlds: { LPL: 4, LCK: 4, LEC: 4, LCS: 4, PCS: 2, VCS: 2, CBLOL: 1, LLA: 1, LJL: 1 }, wqs: ["LEC", "LCS"] },
  2024: { msi: { LPL: 2, LCK: 2, LEC: 2, LCS: 2, PCS: 1, VCS: 1, CBLOL: 1, LLA: 1 }, worlds: { LPL: 3, LCK: 3, LEC: 3, LCS: 3, PCS: 2, VCS: 2, CBLOL: 1, LLA: 1 }, bonus: true },
  2025: { fst: { LPL: 1, LCK: 1, LEC: 1, LCS: 1, LCP: 1 }, msi: { LPL: 2, LCK: 2, LEC: 2, LCS: 1, CBLOL: 1, LCP: 2 }, worlds: { LPL: 3, LCK: 3, LEC: 3, LCS: 2, CBLOL: 1, LCP: 3 }, bonus: true },
  2026: { fst: { LPL: 2, LCK: 2, LEC: 1, LCS: 1, CBLOL: 1, LCP: 1 }, msi: { LPL: 2, LCK: 2, LEC: 2, LCS: 2, LCP: 2, CBLOL: 1 }, worlds: { LPL: 3, LCK: 3, LEC: 3, LCS: 3, LCP: 3, CBLOL: 2 }, bonus: true }
};
export const intlYear = (y: number): IntlYear => INTL_SLOTS[Math.max(y < 2022 ? 2016 : 2022, Math.min(2026, y))];
/* 国际赛地点（Riot 已公布到 2027；之后不写） */
export const INTL_HOST: Record<number, Record<string, string>> = {
  2022: { msi: "釜山", worlds: "美国" }, 2023: { msi: "伦敦", worlds: "韩国" }, 2024: { msi: "成都", worlds: "欧洲" },
  2025: { fst: "首尔", msi: "温哥华", worlds: "中国" }, 2026: { fst: "圣保罗", msi: "大田", worlds: "美国" },
  2027: { fst: "东南亚", msi: "欧洲", worlds: "韩国" }
};

/* ---------- 史实冠军（按赛段）：过了影响力门槛，季后赛里给这支队一点「剧本」 ---------- */
export const CANON: Record<string, string> = {
  "LPL|2022|spring": "Royal Never Give Up", "LPL|2022|summer": "JD Gaming", "LPL|2023|spring": "JD Gaming", "LPL|2023|summer": "JD Gaming",
  "LPL|2024|spring": "Bilibili Gaming", "LPL|2024|summer": "Bilibili Gaming", "LPL|2025|s1": "Top Esports", "LPL|2025|s2": "Anyone's Legend", "LPL|2025|s3": "Bilibili Gaming",
  "LCK|2022|spring": "T1", "LCK|2022|summer": "Gen.G", "LCK|2023|spring": "Gen.G", "LCK|2023|summer": "Gen.G",
  "LCK|2024|spring": "Gen.G", "LCK|2024|summer": "Hanwha Life Esports", "LCK|2025|cup": "Hanwha Life Esports", "LCK|2025|r12": "Gen.G", "LCK|2025|r35": "Gen.G",
  "LCK|2026|cup": "Gen.G", "LCK|2026|r12": "Hanwha Life Esports",
  "LEC|2022|spring": "G2 Esports", "LEC|2022|summer": "Rogue", "LEC|2023|winter": "G2 Esports", "LEC|2023|spring": "MAD Lions KOI", "LEC|2023|summer": "G2 Esports", "LEC|2023|finals": "G2 Esports",
  "LEC|2024|winter": "G2 Esports", "LEC|2024|spring": "G2 Esports", "LEC|2024|summer": "G2 Esports", "LEC|2024|finals": "G2 Esports",
  "LEC|2025|winter": "Karmine Corp", "LEC|2025|spring": "MAD Lions KOI", "LEC|2025|summer": "G2 Esports", "LEC|2026|versus": "G2 Esports", "LEC|2026|spring": "G2 Esports",
  "LCS|2022|lockin": "Team Liquid", "LCS|2022|spring": "Evil Geniuses", "LCS|2022|summer": "Cloud9", "LCS|2023|spring": "Cloud9", "LCS|2023|summer": "NRG",
  "LCS|2024|spring": "Team Liquid", "LCS|2024|summer": "FlyQuest", "LCS|2025|s1": "Team Liquid", "LCS|2025|s2": "FlyQuest", "LCS|2025|s3": "FlyQuest",
  "LCS|2026|lockin": "LYON", "LCS|2026|spring": "LYON"
};

/* ---------- 总注册表 ---------- */
const CACHE: Record<string, YearSpec> = {};
export function yearSpec(lg: string, y: number, teamCount = 0): YearSpec | null {
  const k = lg + "|" + y + "|" + (lg === "LDL" ? teamCount : "");
  if (CACHE[k]) return CACHE[k];
  let s: YearSpec | null = null;
  if (lg === "LPL") s = lplYear(y);
  else if (lg === "LCK") s = lckYear(y);
  else if (lg === "LEC") s = lecYear(y);
  else if (lg === "LCS") s = lcsYear(y);
  else if (lg === "LDL") s = y <= 2025 ? ldlYear(y, teamCount) : null;
  else s = minorYear(lg, y);
  if (s) CACHE[k] = s;
  return s;
}
export { minus };
