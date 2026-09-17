/* ============================================================
   真实赛制 · 赛段运行器（2026-09-13）
   按赛制表（fmtspec.ts）把一个联赛的一年往前推：开阶段、按轮出对阵、记结果、
   打完进下一阶段、赛段收尾。状态（LeagueRun）是纯数据，直接进存档；
   赛制表里的函数（分组、种子、收尾）每次现算，不存。
   ============================================================ */
import {
  BO, Series, Row, BState, rrRounds, crossRounds, swissPairs, tableOf,
  bracketRoundsCount, roundPairs, bracketPlaces, playSeries, ptsAt
} from "./fmt";

export interface Group { name: string; teams: string[]; times?: number }

export interface StageSpec {
  key: string;                       // 赛段内唯一
  name: string;                      // 显示名：分组赛 / 骑士之路 / 季后赛
  kind: "rr" | "ki" | "po" | "q";    // 赛历配色：常规 / 入围 / 季后赛 / 资格赛
  type: "rr" | "cross" | "swiss" | "br";
  perWeek: number;                   // 每周打几轮
  groups?: (c: Ctx) => Group[];      // rr / cross / swiss 的分组（组内按种子顺序）
  times?: number;                    // 几次循环
  bo?: BO;
  superWeek?: boolean;               // cross：最后一轮同顺位 BO5、赢一场 2 分（LCK 杯 2026）
  swissRounds?: number;
  carry?: string;                    // 积分榜带上本赛段哪个阶段的战绩
  carrySplit?: string;               // 积分榜带上之前哪个赛段的战绩（LCK 第 3–5 轮带第 1–2 轮）
  tpl?: string; n?: number; boAll?: BO;   // br：模板、单场对决场数、统一局数
  seeds?: (c: Ctx) => string[];
}

export interface SplitOut {
  key: string; name: string;
  order: string[];                   // 赛段名次（冠军在前）
  places: Record<string, number>;
  champ?: string;
  outSeason?: string[];              // 全年淘汰
  intl?: string[];                   // 这个赛段给的国际赛名额（按种子）
  rows?: Row[];                      // 要带到下个赛段的战绩
  aux?: boolean;                     // 附属赛段（地区资格赛）：不当作下一年的参照名次
  poN?: number;                      // 这个赛段季后赛几支队（判「进没进季后赛」）
  poSeeds?: string[];                // 季后赛种子顺序
  rel?: string[];                    // S6 开档：LPL 2016–2017 春升降级区 [A5, B5, A6, B6]（relegation.ts）
}

export interface SplitSpec {
  key: string; name: string; short: string;
  title?: string | false;            // 冠军头衔后缀（默认用 name）；false = 这个赛段没有冠军（地区资格赛、LCK 第 1–2 轮）
  half: 0 | 1;                       // 合同上 / 下半年
  after: null | "fst" | "msi" | "worlds";
  stages: StageSpec[];
  teams?: (c: Ctx) => string[];      // 参赛队（默认：全联盟减去全年淘汰的，按上一赛段名次排）
  pts?: number[];                    // 冠军积分（按名次）
  finish: (c: Ctx) => Omit<SplitOut, "key" | "name">;
}

export interface YearSpec { lg: string; year: number; label?: string; splits: SplitSpec[] }

export interface StageRun {
  key: string; type: StageSpec["type"];
  groups: Group[];
  sched: { a: string; b: string; bo: BO; pts?: number }[][];   // 每轮对阵（瑞士轮每轮开打前补）
  games: Series[];
  br?: BState;
  rounds: number; doneR: number; perWeek: number; bo: BO;
}

export interface LeagueRun {
  lg: string; year: number;
  si: number; stage: number;
  runs: StageRun[];                  // 当前赛段的各阶段
  outs: SplitOut[];                  // 今年打完的赛段
  outSeason: string[];
  pts: Record<string, number>;
  prevRank: string[];                // 开年参照名次（去年）
  all: string[];
  wait: null | "fst" | "msi" | "worlds";   // 赛段打完、在等这个国际赛
  done: boolean;
  slots?: Record<string, number>;    // 控制器写入：本联赛各国际赛名额（含 MSI 挂钩）
  canon?: string | null;             // 控制器写入：这个赛段按史实该夺冠的队（过了影响力门槛才有）
}

export interface Ctx {
  lg: string; year: number;
  teams: string[]; prevRank: string[]; all: string[];
  splits: SplitOut[]; pts: Record<string, number>;
  slots: (ev: string) => number;
  table: (key: string, group?: string) => string[];
  rows: (key: string, group?: string) => Row[];
  groups: (key: string) => Group[];
  adv: (key: string, k?: number) => string[];
  places: (key: string) => Record<string, number>;
  split: (key: string) => SplitOut | undefined;
  br: (key: string) => BState | undefined;
}

const runOf = (run: LeagueRun, key: string) => run.runs.find(r => r && r.key === key);

function rowsOf(run: LeagueRun, ys: YearSpec, key: string, group?: string): Row[] {
  const r = runOf(run, key); if (!r) return [];
  const ss = ys.splits[run.si].stages.find(s => s.key === key)!;
  const g = group === undefined ? (r.groups.length === 1 ? r.groups[0] : { name: "", teams: r.groups.flatMap(x => x.teams) }) : r.groups.find(x => x.name === group);
  if (!g) return [];
  const carried = ss.carry ? (runOf(run, ss.carry)?.games || []) : [];
  const base = ss.carrySplit ? (run.outs.find(o => o && o.key === ss.carrySplit)?.rows || []) : undefined;
  return tableOf(g.teams, carried.concat(r.games), g.teams, s => s.pts || 1, base);
}

export function ctxOf(run: LeagueRun, ys: YearSpec): Ctx {
  const prev = run.si > 0 && run.outs[run.si - 1] ? run.outs[run.si - 1].order : run.prevRank;
  const c: Ctx = {
    lg: run.lg, year: run.year, teams: [], prevRank: prev, all: run.all,
    splits: run.outs, pts: run.pts,
    slots: ev => (run.slots && run.slots[ev]) || 0,
    rows: (key, g) => rowsOf(run, ys, key, g),
    table: (key, g) => rowsOf(run, ys, key, g).map(x => x.team),
    groups: key => (runOf(run, key)?.groups) || [],
    adv: (key, k) => { const r = runOf(run, key); const pl = r && r.br ? bracketPlaces(r.br) : []; return (k ? pl.slice(0, k) : pl).map(x => x.team); },
    places: key => { const r = runOf(run, key); const o: Record<string, number> = {}; if (r && r.br) bracketPlaces(r.br).forEach(x => { o[x.team] = x.place; }); return o; },
    split: key => run.outs.find(o => o && o.key === key),
    br: key => runOf(run, key)?.br
  };
  const sp = ys.splits[run.si];
  const alive = run.all.filter(t => !run.outSeason.includes(t));
  const byPrev = alive.slice().sort((x, y) => rank(prev, x, run.all) - rank(prev, y, run.all));
  c.teams = sp && sp.teams ? sp.teams({ ...c, teams: byPrev }) : byPrev;
  return c;
}
const rank = (order: string[], t: string, all: string[]) => { const i = order.indexOf(t); return i >= 0 ? i : 1000 + all.indexOf(t); };

export function newYear(lg: string, year: number, all: string[], prevRank: string[]): LeagueRun {
  return { lg, year, si: 0, stage: 0, runs: [], outs: [], outSeason: [], pts: {}, prevRank, all: all.slice(), wait: null, done: false };
}

export function startStage(run: LeagueRun, ys: YearSpec) {
  const ss = ys.splits[run.si].stages[run.stage], c = ctxOf(run, ys);
  const r: StageRun = { key: ss.key, type: ss.type, groups: [], sched: [], games: [], rounds: 0, doneR: 0, perWeek: ss.perWeek, bo: ss.bo || 3 };
  if (ss.type === "br") {
    const seeds = ss.seeds ? ss.seeds(c) : c.teams;
    r.br = { tpl: ss.tpl!, seeds, res: {}, n: ss.n, bo: ss.boAll };
    r.rounds = bracketRoundsCount(r.br);
  } else {
    r.groups = ss.groups ? ss.groups(c) : [{ name: "", teams: c.teams }];
    if (ss.type === "rr") {
      const per = r.groups.map(g => rrRounds(g.teams, g.times || ss.times || 1));
      r.rounds = Math.max(0, ...per.map(p => p.length));
      for (let i = 0; i < r.rounds; i++) r.sched.push(per.flatMap(p => (p[i] || []).map(([a, b]) => ({ a, b, bo: r.bo }))));
    } else if (ss.type === "cross") {
      const rs = crossRounds(r.groups[0].teams, r.groups[1].teams, !!ss.superWeek);
      r.rounds = rs.length;
      rs.forEach((rd, i) => { const sup = !!ss.superWeek && i === rs.length - 1; r.sched.push(rd.map(([a, b]) => ({ a, b, bo: (sup ? 5 : r.bo) as BO, pts: sup ? 2 : 1 }))); });
    } else {
      r.rounds = ss.swissRounds || 3;
    }
  }
  run.runs[run.stage] = r;
}

export function beginSplit(run: LeagueRun, ys: YearSpec) {
  run.wait = null; run.stage = 0; run.runs = [];
  if (run.si >= ys.splits.length) { run.done = true; return; }
  startStage(run, ys);
}

export interface Pending { a: string; b: string; bo: BO; id: string; pts?: number; stage: string; rd: number }

/* 当前这一轮还没打的对阵 */
export function roundPending(run: LeagueRun): Pending[] {
  const r = run.runs[run.stage]; if (!r || run.done || run.wait || r.doneR >= r.rounds) return [];
  const rd = r.doneR + 1;
  if (r.type === "br") return roundPairs(r.br!, rd).map(x => ({ a: x.a, b: x.b, bo: x.m.bo, id: x.m.id, stage: r.key, rd }));
  if (r.type === "swiss" && !r.sched[rd - 1]) r.sched[rd - 1] = swissPairs(r.groups[0].teams, r.games, rd).map(([a, b]) => ({ a, b, bo: r.bo }));
  const done = new Set(r.games.map(g => g.id));
  return (r.sched[rd - 1] || []).map((m, i) => ({ a: m.a, b: m.b, bo: m.bo, pts: m.pts, id: rd + ":" + i, stage: r.key, rd })).filter(p => !done.has(p.id));
}

export function record(run: LeagueRun, p: Pending, s: Series) {
  const r = run.runs[run.stage]; if (!r || r.key !== p.stage) return;
  const g: Series = { ...s, id: p.id, pts: p.pts };
  r.games.push(g);
  if (r.br) r.br.res[p.id] = g;
}

/* 这一轮都打完了就收轮；阶段打完进下一阶段，赛段打完收尾。返回 "round" | "stage" | "split" */
export function closeRound(run: LeagueRun, ys: YearSpec): "open" | "round" | "stage" | "split" {
  const r = run.runs[run.stage]; if (!r) return "open";
  if (roundPending(run).length) return "open";
  r.doneR++;
  if (r.doneR < r.rounds) return "round";
  const sp = ys.splits[run.si];
  if (run.stage + 1 < sp.stages.length) { run.stage++; startStage(run, ys); return "stage"; }
  finishSplit(run, ys);
  return "split";
}

export function finishSplit(run: LeagueRun, ys: YearSpec) {
  const sp = ys.splits[run.si], c = ctxOf(run, ys);
  const o = sp.finish(c);
  const out: SplitOut = { key: sp.key, name: sp.name, ...o };
  out.champ = out.champ || out.order[0];
  const po = run.runs.slice().reverse().find(r => r && r.br && (sp.stages.find(s => s.key === r.key) || {} as StageSpec).kind === "po");
  if (po && po.br) { out.poN = po.br.seeds.length; out.poSeeds = po.br.seeds.slice(); }
  if (sp.pts) out.order.forEach(t => { const p = out.places[t]; run.pts[t] = (run.pts[t] || 0) + ptsAt(sp.pts, p); });
  run.outs[run.si] = out;
  (out.outSeason || []).forEach(t => { if (!run.outSeason.includes(t)) run.outSeason.push(t); });
  run.si++;
  if (sp.after) { run.wait = sp.after; run.runs = []; run.stage = 0; if (run.si >= ys.splits.length) run.done = true; return; }
  beginSplit(run, ys);
}

/* 本周剩下的轮数：阶段内按 perWeek 分周 */
export function weekDone(run: LeagueRun): boolean {
  const r = run.runs[run.stage]; return !r || run.done || !!run.wait || r.doneR % r.perWeek === 0;
}

/* 全自动推进一周（非玩家联赛 / 批测）。pGame(a,b) 给 a 每局赢的概率 */
export function simWeek(run: LeagueRun, ys: YearSpec, pGame: (a: string, b: string) => number, rng: () => number) {
  if (run.done || run.wait) return;
  let guard = 0;
  do {
    roundPending(run).forEach(p => record(run, p, playSeries(p.a, p.b, p.bo, pGame(p.a, p.b), rng)));
    const st = closeRound(run, ys);
    if (st === "stage" || st === "split") break;
  } while (!weekDone(run) && ++guard < 20);
}

/* 快进到等某个国际赛（或全年结束） */
export function simUntil(run: LeagueRun, ys: YearSpec, ev: string | null, pGame: (a: string, b: string) => number, rng: () => number) {
  let guard = 0;
  while (!run.done && run.wait !== ev && ++guard < 400) {
    if (run.wait) break;   // 在等别的国际赛：交给控制器
    simWeek(run, ys, pGame, rng);
  }
}

/* 这个阶段总共几周（赛历、说明用） */
export const stageWeeks = (r: StageRun) => Math.max(1, Math.ceil(r.rounds / Math.max(1, r.perWeek)));

/* 名次表：rr 阶段按积分榜，br 阶段按淘汰名次；给收尾函数用的小工具 */
export function placesFromOrder(order: string[]): Record<string, number> { const o: Record<string, number> = {}; order.forEach((t, i) => { o[t] = i + 1; }); return o; }
