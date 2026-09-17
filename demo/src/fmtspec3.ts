/* ============================================================
   真实赛制表 · 2016–2021（S6 开档，2026-09-17）
   来源：Leaguepedia API 原文（LPL / LCK / EU LCS·LEC / NA LCS·LCS 各赛段页、升降级页、地区决赛页、冠军积分页）、
   Liquipedia（MSI 2016–2021、世界赛 2016–2019）、英文维基（世界赛 2019–2021、MSI 2021）。
   调研稿：scratchpad formats_2016_2021.md；拿不准的地方在这里写 ⚠ 并说明怎么简化。

   简化（写在这里，别处不再重复）：
   · LPL 2016–2018 季后赛第 3 名对第 4 名的「加权 BO5（第 3 名先得 1 分）」不做，按普通 BO5；第 3 名打的是异组第 4 ⚠
   · EU LCS 2016 夏季赛的 BO2（积分 3-1-0）按 BO3 打（引擎只有 BO1 / 3 / 5）
   · 各赛区地区决赛统一按「积分排种子的守擂赛」（原文有几处只写「单败」⚠）
   · LEC 2019 的 Juggernaut 半双败按 6 队双败（1–4 胜者组）打
   · LCS 2021 Lock In 杯赛不做；春季赛打完接季中对抗赛（6 队双败，出 MSI），夏季三循环带春季战绩，冠军赛 8 队双败
   · 升降级（LPL 2016–2017 春、LCK 2016–2020、EU/NA 2016–2017）不在这张表里：见 relegation（只结算你所在的队）
   ============================================================ */
import { Ctx, SplitSpec, YearSpec } from "./fmtrun";
import { G, snake, fin, rfSplit } from "./fmtspec";

const T = (c: Ctx, key: string, g?: string) => c.table(key, g);
const sl = (c: Ctx, ev: string, order: string[]) => order.slice(0, c.slots(ev));
const P_SP = [90, 70, 50, 30, 20, 20, 10, 10], P_SU = [0, 110, 80, 60, 40, 40, 10, 10];
const AB = ["A 组", "B 组"];

/* 两组：本组双循环 + 异组单循环（LPL 2016–2018、EU LCS 2017）。积分榜 = 两个阶段合起来 */
function groupStages(bo: 1 | 3, perWeek: number, names = AB) {
  return [
    { key: "gi", name: "组内赛", kind: "rr" as const, type: "rr" as const, times: 2, bo, perWeek, groups: (c: Ctx) => snake(c.teams, 2, names) },
    { key: "gx", name: "跨组赛", kind: "rr" as const, type: "cross" as const, bo, perWeek, carry: "gi", groups: (c: Ctx) => c.groups("gi") }
  ];
}
/* 两组交错排：A1 B1 A2 B2 … */
function zip(c: Ctx, key: string, names = AB): string[] {
  const [a, b] = names.map(n => T(c, key, n)), out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out;
}

/* 地区决赛：1 号 = 夏季冠军，2 号 = 冠军积分最高，积分接下来的 n 队打守擂赛（积分高的轮空到后面）。
   n=4 → 3 号种子（KOTH4）；LCK 2021 取守擂赛前两名作 3、4 号 */
function rfKoth(lastKey: string, n: 3 | 4): SplitSpec {
  const cands = (c: Ctx) => {
    const champ = c.split(lastKey)!.champ!, last = c.split(lastKey)!;
    const byPts = c.teams.filter(t => t !== champ).sort((x, y) => ((c.pts[y] || 0) - (c.pts[x] || 0)) || ((last.places[x] || 99) - (last.places[y] || 99)));
    return { champ, seed2: byPts[0], rf: byPts.slice(1, 1 + n) };
  };
  return {
    key: "rf", name: "地区资格赛", short: "资格赛", title: false, half: 1, after: "worlds",
    stages: [{ key: "rf", name: "地区资格赛", kind: "q", type: "br", tpl: n === 4 ? "KOTH4" : "KOTH3", perWeek: 1, seeds: c => cands(c).rf }],
    finish: c => {
      const { champ, seed2 } = cands(c);
      const order = [champ, seed2, ...c.adv("rf")];
      const places: Record<string, number> = {}; order.forEach((t, i) => { places[t] = i + 1; });
      return { order, places, champ, intl: order.slice(0, c.slots("worlds")), aux: true };
    }
  };
}

/* ---------- LPL ---------- */
function lplEarly(y: number): YearSpec {
  const grouped = y <= 2018;
  const sp = (key: string, name: string, short: string, half: 0 | 1, after: "msi" | "worlds" | null, pts: number[]): SplitSpec => ({
    key, name, short, half, after, pts,
    stages: grouped
      ? [...groupStages(3, y === 2018 ? 2 : 2, y === 2018 ? ["东部", "西部"] : AB),
         { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "LPL8G", perWeek: 2, seeds: c => zip(c, "gx", y === 2018 ? ["东部", "西部"] : AB).slice(0, 8) }]
      : [{ key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 1, bo: 3, perWeek: 2 },
         y >= 2021
           ? { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "KOTH10", perWeek: 2, seeds: c => T(c, "rs").slice(0, 10) }
           : { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "SE8B", perWeek: 2, seeds: c => T(c, "rs").slice(0, 8) }],
    finish: c => {
      const f = fin(c, "po", grouped ? zip(c, "gx", y === 2018 ? ["东部", "西部"] : AB) : T(c, "rs"));
      return { ...f, intl: after === "msi" ? sl(c, "msi", f.order) : undefined };
    }
  });
  const rf = y <= 2016 ? rfKoth("summer", 4) : y <= 2019 ? rfKoth("summer", 3) : rfSplit("summer");
  return { lg: "LPL", year: y, splits: [sp("spring", "春季赛", "春", 0, "msi", P_SP), sp("summer", "夏季赛", "夏", 1, null, P_SU), rf] };
}

/* ---------- LCK ---------- */
function lckEarly(y: number): YearSpec {
  const sp = (key: string, name: string, short: string, half: 0 | 1, after: "msi" | null, pts: number[]): SplitSpec => ({
    key, name, short, half, after, pts,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 2, bo: 3, perWeek: 2 },
      y >= 2021
        ? { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "SE6", perWeek: 2, seeds: c => T(c, "rs").slice(0, 6) }
        : { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "KOTH5", perWeek: 2, seeds: c => T(c, "rs").slice(0, 5) }   // 阶梯赛：第 1 名直通决赛
    ],
    finish: c => { const f = fin(c, "po", T(c, "rs"), true); return { ...f, intl: after ? sl(c, after, f.order) : undefined }; }
  });
  return { lg: "LCK", year: y, splits: [sp("spring", "春季赛", "春", 0, "msi", [90, 70, 50, 30, 20]), sp("summer", "夏季赛", "夏", 1, null, [0, 100, 80, 50, 30]), rfKoth("summer", 4)] };
}

/* ---------- EU LCS / LEC ---------- */
function lecEarly(y: number): YearSpec {
  const bo: 1 | 3 = y === 2017 || y === 2016 ? 3 : 1;   // 2016 春 BO1、夏 BO2（按 BO3）⚠；2017 BO3
  const sp = (key: string, name: string, half: 0 | 1, after: "msi" | "worlds" | null): SplitSpec => {
    const b: 1 | 3 = y === 2016 && key === "spring" ? 1 : bo;
    const po = y >= 2019 ? "DE6A" : "SE6";
    return {
      key, name, short: name.slice(0, 1), half, after,
      stages: y === 2017
        ? [...groupStages(3, 2), { key: "po", name: "季后赛", kind: "po", type: "br", tpl: "SE6", perWeek: 2, seeds: c => zip(c, "gx").slice(0, 6) }]
        : [{ key: "rs", name: "常规赛", kind: "rr", type: "rr", times: 2, bo: b, perWeek: b === 1 ? 3 : 2 },
           { key: "po", name: "季后赛", kind: "po", type: "br", tpl: po, perWeek: 2, seeds: c => T(c, "rs").slice(0, 6) }],
      finish: c => { const f = fin(c, "po", y === 2017 ? zip(c, "gx") : T(c, "rs"), true); return { ...f, intl: after ? sl(c, after, f.order) : undefined }; }
    };
  };
  if (y >= 2020) return { lg: "LEC", year: y, splits: [sp("spring", "春季赛", 0, "msi"), sp("summer", "夏季赛", 1, "worlds")] };
  return { lg: "LEC", year: y, splits: [sp("spring", "春季赛", 0, "msi"), sp("summer", "夏季赛", 1, null), rfKoth("summer", 4)] };
}

/* ---------- NA LCS / LCS ---------- */
function lcsEarly(y: number): YearSpec {
  const sp = (key: string, name: string, half: 0 | 1, after: "msi" | "worlds" | null, o: { bo: 1 | 3; times?: number; tpl: string; n: number; carry?: string; title?: string }): SplitSpec => ({
    key, name, short: name.slice(0, 1), title: o.title, half, after,
    stages: [
      { key: "rs", name: "常规赛", kind: "rr", type: "rr", times: o.times || 2, bo: o.bo, perWeek: o.bo === 1 ? 3 : 2, carrySplit: o.carry },
      { key: "po", name: o.tpl === "DE8K" && y === 2021 ? "冠军赛" : o.title === "季中对抗赛" ? "季中对抗赛" : "季后赛", kind: "po", type: "br", tpl: o.tpl, perWeek: 2, seeds: c => T(c, "rs").slice(0, o.n) }
    ],
    finish: c => { const f = fin(c, "po", T(c, "rs"), true); return { ...f, rows: c.rows("rs"), intl: after ? sl(c, after, f.order) : undefined }; }
  });
  if (y <= 2019) {
    const bo: 1 | 3 = y === 2017 || (y === 2016) ? 3 : 1;
    return { lg: "LCS", year: y, splits: [
      sp("spring", "春季赛", 0, "msi", { bo: y === 2016 ? 1 : bo, tpl: "SE6", n: 6 }),
      sp("summer", "夏季赛", 1, null, { bo, tpl: "SE6", n: 6 }),
      rfKoth("summer", 4)] };
  }
  if (y === 2020) return { lg: "LCS", year: y, splits: [
    sp("spring", "春季赛", 0, "msi", { bo: 1, tpl: "DE6A", n: 6 }),
    sp("summer", "夏季赛", 1, "worlds", { bo: 1, tpl: "DE8K", n: 8 })] };
  return { lg: "LCS", year: y, splits: [
    sp("spring", "季中对抗赛", 0, "msi", { bo: 1, tpl: "DE6A", n: 6, title: "季中对抗赛" }),
    sp("summer", "冠军赛", 1, "worlds", { bo: 1, times: 3, tpl: "DE8K", n: 8, carry: "spring", title: "冠军赛" })] };
}

export function earlyYearSpec(lg: string, y: number): YearSpec | null {
  if (lg === "LPL") return lplEarly(y);
  if (lg === "LCK") return lckEarly(y);
  if (lg === "LEC") return lecEarly(y);
  if (lg === "LCS") return lcsEarly(y);
  return null;
}

/* 世界赛直进小组赛的席位（2017–2019 另有「上一届世界冠军的赛区多一个直进」，由 fmtctl 按这个世界的冠军加） */
export const WORLDS_DIRECT: Record<number, Record<string, number>> = {
  2017: { LCK: 2, LPL: 2, LEC: 2, LCS: 2, PCS: 2, VCS: 1 },
  2018: { LCK: 2, LPL: 2, LEC: 2, LCS: 2, PCS: 2, VCS: 1 },
  2019: { LCK: 2, LPL: 2, LEC: 2, LCS: 2, PCS: 2, VCS: 1 },
  2020: { LCK: 3, LPL: 3, LEC: 3, LCS: 2, PCS: 1 },
  2021: { LCK: 3, LPL: 3, LEC: 3, LCS: 2, PCS: 1 }
};
export { G };
