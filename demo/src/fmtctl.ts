/* ============================================================
   真实赛制 · 赛历控制器（2026-09-13，只给真实时间线新档 S.tl）
   · 年初按上一年名次给每个联赛开一份 LeagueRun（fmtrun），国际赛名额按年份写死（fmtspec2）。
   · 一周 = 真实的一个比赛周：你所在联赛按轮推进，轮到你的第一场停下来给你亲自打，
     本周其余几场默认自动打完（S.fmtManual 打开就每场都手动）；其它联赛各自往前打一周。
   · 你所在联赛和主导赛历的联赛（你在 LDL / 小赛区时是 LPL）都打完、在等同一个国际赛，
     其余联赛快进到同一个点——First Stand / MSI / 世界赛开打。
   · 老档（没有 S.tl）一行都不走这里。
   ============================================================ */
import { S } from "./state";
import { rnd } from "./rng";
import { playSeries, Series, bracketMatches, slotTeam } from "./fmt";
import { LeagueRun, YearSpec, SplitSpec, SplitOut, StageRun, Pending, newYear, beginSplit, roundPending, record, closeRound, weekDone, simWeek } from "./fmtrun";
import { yearSpec, intlYear, CANON } from "./fmtspec2";
import { WORLDS_DIRECT } from "./fmtspec3";
import { winProb, wlOf, leagueOf, pw } from "./intl";
import { SEASONS } from "./main";

export const FMT_MAJORS = ["LPL", "LCK", "LEC", "LCS"];
export const REGION_ORDER = ["LCK", "LPL", "LEC", "LCP", "LCS", "CBLOL", "PCS", "VCS", "LJL", "LLA", "TCL", "LCO"];

export interface FmtState {
  y: number; runs: Record<string, LeagueRun>;
  cur: Pending | null;           // 这一周轮到你亲自上场的那一场
  wk: number;                    // 这一周你的队已经打了几场
  yw: number;                    // 全年第几周（HUD）
  queue: { lg: string; si: number }[];   // 打完、还没播报 / 结算的赛段
  newSplit?: boolean;            // 你所在联赛刚接着开了下一个赛段（没有国际赛隔开）
  fstLg?: string | null;         // First Stand 冠军赛区：MSI 二号种子免入围
  msiField?: string[]; msiRunner?: string | null; msiBonus?: number;
  wqs?: { a: string; b: string; loser: string } | null;
  poSeen?: Record<string, 1>;
}

/* main.ts 在加载时挂上：你的队赢一局的概率、你的队自动打完一场之后的结算 */
export const FMT_HOOKS: { myP?: (opp: string) => number; autoMine?: (p: Pending, s: Series) => void } = {};

export const fmtOn = (): boolean => !!(S && S.tl && S.fmt && S.fmt.runs);
export const fmtHome = (): string => (S && S.homeLeague) || "LPL";
export const fmtMaster = (): string => FMT_MAJORS.includes(fmtHome()) ? fmtHome() : "LPL";
export const runOf = (lg: string): LeagueRun | null => (S.fmt && S.fmt.runs && S.fmt.runs[lg]) || null;
export function specOf(lg: string): YearSpec | null { return S.fmt ? yearSpec(lg, S.fmt.y, ((S.world && S.world[lg]) || []).length) : null; }

const clampP = (p: number) => Math.max(0.03, Math.min(0.97, p));
function pGameFor(lg: string) {
  const run = runOf(lg), ys = specOf(lg);
  const sp = run && ys ? ys.splits[run.si] : null, st = sp ? sp.stages[run!.stage] : null;
  const kind = st ? st.kind : "rr", c = run && run.canon;
  return (a: string, b: string) => {
    let p = winProb(a, b);
    if (c && (kind === "po" || kind === "q") && a !== S.team && b !== S.team) { if (a === c) p += 0.12; else if (b === c) p -= 0.12; }
    return clampP(p);
  };
}

/* 这个赛段按史实该夺冠的队：在场、不是你的队、过了世界线张力门槛才给剧本 */
function canonPick(lg: string, ys: YearSpec, si: number): string | null {
  const sp = ys.splits[si]; if (!sp) return null;
  const nm = CANON[`${lg}|${ys.year}|${sp.key}`];
  if (!nm || nm === S.team || !((S.world && S.world[lg]) || []).some((t: any) => t.name === nm)) return null;
  return rnd() >= wlOf(lg) ? nm : null;
}
function begin(lg: string) {
  const run = runOf(lg), ys = specOf(lg); if (!run || !ys) return;
  run.canon = canonPick(lg, ys, run.si);
  beginSplit(run, ys);
}

export function slotsFor(lg: string, y: number): Record<string, number> {
  const iy = intlYear(y);
  return { fst: (iy.fst && iy.fst[lg]) || 0, msi: iy.msi[lg] || 0, worlds: iy.worlds[lg] || 0 };
}

/* 年初：每个联赛开一份。参照名次＝去年最后一个正式赛段的名次，没有就按战力 */
export function fmtStartYear() {
  const y = SEASONS[S.si] ? SEASONS[S.si].y : 2022;
  const prev: Record<string, string[]> = {};
  if (S.fmt && S.fmt.runs) Object.keys(S.fmt.runs).forEach(lg => {
    const outs = (S.fmt.runs[lg].outs || []).filter((o: SplitOut) => o && !o.aux);
    if (outs.length) prev[lg] = outs[outs.length - 1].order.slice();
  });
  const old = S.fmtPrev || {};
  Object.keys(old).forEach(lg => { if (!prev[lg]) prev[lg] = old[lg]; });
  S.fmtPrev = prev;
  const F: FmtState = { y, runs: {}, cur: null, wk: 0, yw: 0, queue: [], fstLg: null, poSeen: {} };
  S.fmt = F;
  Object.keys(S.world || {}).forEach(lg => {
    const teams = (S.world[lg] || []).map((t: any) => t.name);
    if (teams.length < 2) return;
    const ys = yearSpec(lg, y, teams.length); if (!ys) return;
    const pr = (prev[lg] || []).filter(n => teams.includes(n));
    const rest = teams.filter((n: string) => !pr.includes(n)).sort((a: string, b: string) => pw(b) - pw(a));
    const run = newYear(lg, y, teams, pr.concat(rest));
    run.slots = lg === "LDL" ? { fst: 0, msi: 0, worlds: 0 } : slotsFor(lg, y);
    F.runs[lg] = run;
    begin(lg);
  });
  fmtSyncStandings();
}

/* 一场系列赛：你的队那一场用 FMT_HOOKS.myP（和比赛判定同一口径），其余用世界模拟的口径 */
function playPair(lg: string, p: Pending): Series {
  if (S.team && (p.a === S.team || p.b === S.team) && FMT_HOOKS.myP) {
    const opp = p.a === S.team ? p.b : p.a, q = clampP(FMT_HOOKS.myP(opp));
    const s = playSeries(p.a, p.b, p.bo, p.a === S.team ? q : 1 - q, rnd); s.auto = true; return s;
  }
  return playSeries(p.a, p.b, p.bo, pGameFor(lg)(p.a, p.b), rnd);
}

/* 推进你所在联赛这一周：直到轮到你亲自上场（返回那一场）或者这一周打完（返回 null）。
   autoMine：你的比赛也自动打（替补周）。本周第一场默认亲自打，之后看 S.fmtManual。 */
export function fmtPump(autoMine: boolean): Pending | null {
  const lg = fmtHome(), run = runOf(lg), ys = specOf(lg);
  if (!run || !ys || !S.fmt) return null;
  let guard = 0;
  while (++guard < 60) {
    if (run.done || run.wait || !run.runs[run.stage]) return null;
    const pend = roundPending(run);
    const mine = S.team ? pend.find(p => p.a === S.team || p.b === S.team) : undefined;
    pend.forEach(p => { if (p !== mine) record(run, p, playPair(lg, p)); });
    if (mine) {
      if (!autoMine && (S.fmt.wk === 0 || S.fmtManual)) { S.fmt.cur = mine; return mine; }
      const s = playPair(lg, mine);
      record(run, mine, s); S.fmt.wk++;
      if (FMT_HOOKS.autoMine) FMT_HOOKS.autoMine(mine, s);
    }
    const si = run.si, st = closeRound(run, ys);
    if (st === "split") onSplitFinished(lg, si);
    if (st !== "round" || weekDone(run)) return null;
  }
  return null;
}

/* 你刚亲自打完的那一场记进赛程 */
export function fmtRecordMine(sc: number[]) {
  const F = S.fmt, cur = F && F.cur; if (!cur) return;
  const run = runOf(fmtHome()); if (!run) { F.cur = null; return; }
  const won = sc[0] > sc[1], opp = cur.a === S.team ? cur.b : cur.a;
  record(run, cur, { a: cur.a, b: cur.b, bo: cur.bo, w: won ? S.team : opp, l: won ? opp : S.team, sw: Math.max(sc[0], sc[1]), sl: Math.min(sc[0], sc[1]) });
  F.cur = null; F.wk++;
}

/* 这一周你所在联赛打完之后，其它联赛各自打一周 */
export function fmtSimOthers() {
  Object.keys(S.fmt.runs).forEach(lg => {
    if (lg === fmtHome()) return;
    const run = runOf(lg)!, ys = specOf(lg); if (!ys || run.done || run.wait) return;
    const si = run.si;
    simWeek(run, ys, pGameFor(lg), rnd);
    if (run.si !== si) onSplitFinished(lg, si);
  });
}

function onSplitFinished(lg: string, si: number) {
  const run = runOf(lg), ys = specOf(lg); if (!run || !ys) return;
  const sp = ys.splits[si], out = run.outs[si]; if (!sp || !out) return;
  if (sp.title !== false && out.champ) {
    // w：卫冕压力的折算系数，这一年出冠军的赛段超过两个就按 2/n 算（squad.ts oppDefendTitles）
    const w = 2 / Math.max(2, ys.splits.filter(s => s.title !== false).length);
    S.fmtTitles = (S.fmtTitles || []).concat([{ si: S.si, y: ys.year, lg, t: sp.title || sp.name, team: out.champ, w }]).slice(-400);
  }
  S.fmt.queue.push({ lg, si });
  if (lg === fmtHome() && !run.wait && !run.done) S.fmt.newSplit = true;
}

/* 国际赛边界：主导赛历的联赛在等某个国际赛，你所在联赛也打完了 */
export function fmtBoundary(): string | null {
  if (!fmtOn()) return null;
  const m = runOf(fmtMaster()), h = runOf(fmtHome());
  if (!m || !m.wait) return null;
  if (h && h !== m && !h.done && h.wait !== m.wait) return null;
  return m.wait;
}
export function fmtFastForward(E: string) {
  Object.keys(S.fmt.runs).forEach(lg => {
    const run = runOf(lg)!, ys = specOf(lg); if (!ys) return;
    let g = 0;
    while (!run.done && !run.wait && ++g < 80) { const si = run.si; simWeek(run, ys, pGameFor(lg), rnd); if (run.si !== si) onSplitFinished(lg, si); }
  });
  fmtSyncStandings();
}
/* 国际赛打完：在等它的联赛开下一个赛段 */
export function fmtAfterEvent(E: string) {
  if (!S.fmt) return;
  Object.keys(S.fmt.runs).forEach(lg => { const run = runOf(lg)!; if (run.wait === E && !run.done) begin(lg); });
}

/* ---------- 国际赛名单 ---------- */
export function fmtIntlList(lg: string, E: string): string[] {
  const run = runOf(lg), ys = specOf(lg); if (!run || !ys) return [];
  for (let i = ys.splits.length - 1; i >= 0; i--) if (ys.splits[i].after === E) {
    const o = run.outs[i]; return (o && o.intl) ? o.intl.filter(Boolean) : [];
  }
  return [];
}
const ri = (lg: string) => { const i = REGION_ORDER.indexOf(lg); return i < 0 ? 99 : i; };
export function fmtIntlSeeds(E: string): { lg: string; seeds: string[] }[] {
  if (!S.fmt) return [];
  return Object.keys(S.fmt.runs).filter(lg => lg !== "LDL").map(lg => ({ lg, seeds: fmtIntlList(lg, E) }))
    .filter(x => x.seeds.length).sort((a, b) => ri(a.lg) - ri(b.lg));
}
/* 所有赛区的名额按「几号种子」一层层铺开：先全部一号种子，再二号……同一层按赛区强弱 */
export function fmtIntlField(E: string): string[] {
  if (E === "worlds") return fmtWorldsTeams();
  const L = fmtIntlSeeds(E), out: string[] = [];
  const n = Math.max(0, ...L.map(x => x.seeds.length));
  for (let k = 0; k < n; k++) L.forEach(x => { if (x.seeds[k] && !out.includes(x.seeds[k])) out.push(x.seeds[k]); });
  return out;
}
/* 世界赛名单（2023 年 LEC 第四和 LCS 第四先打一场资格赛，输的回家） */
export function fmtWorldsTeams(): string[] {
  const L = fmtIntlSeeds("worlds"), out: string[] = [];
  const n = Math.max(0, ...L.map(x => x.seeds.length));
  for (let k = 0; k < n; k++) L.forEach(x => { if (x.seeds[k] && !out.includes(x.seeds[k])) out.push(x.seeds[k]); });
  const wqs = intlYear(S.fmt.y).wqs;
  if (wqs && !S.fmt.wqs) {
    const a = fmtIntlList(wqs[0], "worlds")[3], b = fmtIntlList(wqs[1], "worlds")[3];
    if (a && b) { const s = playSeries(a, b, 5, winProb(a, b), rnd); S.fmt.wqs = { a, b, loser: s.l! }; }
  }
  return S.fmt.wqs ? out.filter(t => t !== S.fmt.wqs!.loser) : out;
}
export function fmtQualified(E: string): boolean { return !!S.team && fmtIntlField(E).includes(S.team); }

/* MSI：一号种子直进（按年份哪些赛区算），2023 LCK 二号、2025 起 First Stand 冠军赛区二号也直进；其余打入围 */
export function fmtMsiSplit(): { direct: string[]; playin: string[]; take: number } {
  const y = S.fmt.y, L = fmtIntlSeeds("msi");
  const dl = y >= 2026 ? ["LPL", "LCK", "LEC", "LCS", "LCP", "CBLOL"] : y === 2025 ? ["LPL", "LCK", "LEC", "LCS", "LCP"] : ["LPL", "LCK", "LEC", "LCS"];
  const direct = L.filter(x => dl.includes(x.lg)).map(x => x.seeds[0]).filter(Boolean);
  const extra = y === 2023 ? "LCK" : y >= 2025 ? S.fmt.fstLg : null;
  const ex = extra ? L.find(x => x.lg === extra) : null;
  if (ex && ex.seeds[1]) direct.push(ex.seeds[1]);
  const playin = fmtIntlField("msi").filter(t => !direct.includes(t));
  return { direct, playin, take: Math.max(0, 8 - direct.length) };
}
/* 世界赛：正赛 16 席，入围赛取 take 个，其余直进 */
export function fmtWorldsSplit(take: number): { direct: string[]; playin: string[]; take: number } {
  const all = fmtWorldsTeams(), directN = Math.max(0, 16 - take);
  const DM = WORLDS_DIRECT[S.fmt.y];
  if (DM) {   // S6 开档 2017–2021：各赛区直进小组赛几席写死；2017–2019 上一届世界冠军的赛区多一席（按这个世界的冠军）
    const dm: Record<string, number> = Object.assign({}, DM);
    if (S.fmt.y <= 2019) {
      const prev = S.honors && S.honors.worlds && S.honors.worlds[S.si - 1];
      const lg = prev ? leagueOf(prev) : ({ 2017: "LCK", 2018: "LCK", 2019: "LPL" } as any)[S.fmt.y];
      if (lg && dm[lg] !== undefined) dm[lg]++; else dm.LCK = (dm.LCK || 0) + 1;
    }
    const direct: string[] = [];
    fmtIntlSeeds("worlds").forEach(x => x.seeds.slice(0, dm[x.lg] || 0).forEach(t => { if (all.includes(t) && direct.length < 16) direct.push(t); }));
    const playin = all.filter(t => !direct.includes(t));
    return { direct, playin, take: Math.max(0, 16 - direct.length) };
  }
  if (all.length <= 16) return { direct: all, playin: [], take: 0 };
  return { direct: all.slice(0, directN), playin: all.slice(directN), take };
}

/* 国际赛冠军揭晓：First Stand 记冠军赛区；MSI（2024 起）冠军赛区和第二好的赛区各多一个世界赛名额 */
export function fmtOnIntlChamp(kind: string, team: string) {
  if (!fmtOn() || !team) return;
  if (kind === "fst") S.fmt.fstLg = leagueOf(team);
  if (kind === "msi" && intlYear(S.fmt.y).bonus && !S.fmt.msiBonus) {
    S.fmt.msiBonus = 1;
    const pool = (S.fmt.msiField || []).filter(n => n && n !== team);
    const runner = (S.fmt.msiRunner && S.fmt.msiRunner !== team) ? S.fmt.msiRunner : pool.slice().sort((a, b) => pw(b) - pw(a))[0];
    const la = leagueOf(team); let lb = runner ? leagueOf(runner) : null;
    if (lb === la) { const alt = pool.filter(n => leagueOf(n) !== la).sort((a, b) => pw(b) - pw(a))[0]; lb = alt ? leagueOf(alt) : null; }
    [la, lb].forEach(lg => { const r = lg ? runOf(lg) : null; if (r) { r.slots = r.slots || {}; r.slots.worlds = (r.slots.worlds || 0) + 1; } });
  }
}

/* ---------- 界面数据 ---------- */
export function fmtSyncStandings() {
  if (!fmtOn()) return;
  S.standings = S.standings || {};
  Object.keys(S.fmt.runs).forEach(lg => {
    const run = runOf(lg)!; const live = run.runs.filter(Boolean);
    if (!live.length) return;                                     // 两个赛段之间：留着上个赛段的榜
    const tbl: Record<string, { w: number; l: number }> = {};
    ((S.world && S.world[lg]) || []).forEach((t: any) => { tbl[t.name] = { w: 0, l: 0 }; });
    const rr = live.filter(r => r.type !== "br"), use = rr.length ? rr : live;
    use.forEach(r => r.games.forEach(g => { if (g.w && tbl[g.w]) tbl[g.w].w++; if (g.l && tbl[g.l]) tbl[g.l].l++; }));
    const ys = specOf(lg), sp = ys && ys.splits[run.si];
    const carry = sp && sp.stages.find(s => s.carrySplit);
    if (carry) (run.outs.find(o => o && o.key === carry.carrySplit)?.rows || []).forEach(b => { if (tbl[b.team]) { tbl[b.team].w += b.w; tbl[b.team].l += b.l; } });
    S.standings[lg] = tbl;
  });
}
export function fmtLastOrder(lg: string): string[] | null {
  const run = runOf(lg); if (!run) return null;
  const outs = run.outs.filter(o => o && !o.aux);
  return outs.length ? outs[outs.length - 1].order.slice() : null;
}
export function fmtStageNow(lg?: string) {
  const L = lg || fmtHome(), run = runOf(L), ys = specOf(L); if (!run || !ys) return null;
  const idle = !!run.wait || run.done || !run.runs[run.stage];
  const si = Math.max(0, Math.min(ys.splits.length - 1, idle ? run.si - 1 : run.si));
  const sp = ys.splits[si];
  const st = idle ? null : sp.stages[run.stage];
  const r: StageRun | null = idle ? null : run.runs[run.stage];
  return { lg: L, run, ys, sp, st, r, idle };
}
export function fmtLabel(): string {
  const n = fmtStageNow(); if (!n) return "";
  return n.st ? `${n.sp.name} · ${n.st.name}` : `${n.sp.name} · 已结束`;
}
export function fmtBo(): number { const c = S.fmt && S.fmt.cur; return c ? c.bo : 3; }
/* 这个赛段是半年里的第一个（注册期 / AI 转会窗只在这时候开） */
export function fmtFirstOfHalf(): boolean {
  const n = fmtStageNow(); if (!n) return true;
  const i = n.ys.splits.indexOf(n.sp);
  return i <= 0 || n.ys.splits[i - 1].half !== n.sp.half;
}

const TPL_NAME: Record<string, string> = {
  KOTH10: "十队冒泡赛 BO5", DE8: "八队双败 BO5", DE8B: "八队双败", DE8UL: "八队双败 BO5", DE8K: "八队双败 BO5", DE6A: "六队双败 BO5", DE6F: "六队双败 BO5",
  SE6: "六队单败 BO5", LCK23: "首轮单败＋四队双败 BO5", SE4: "四队单败 BO5", SE8: "八队单败", GSL4: "四队双败", GSL8: "两个 GSL 小组 BO3", DE4: "四队双败 BO5",
  WF4: "瀑布赛 BO5", RTMSI: "五场 BO5 阶梯", PI6: "六队入围赛", Q8: "八队双败 BO3 取四", LTAC: "六队双败 BO5", KR: "单场 BO5", KR3: "三轮 BO5"
};
export function fmtFormatLine(sp: SplitSpec): string {
  return sp.stages.map(s => {
    if (s.type === "br") return `${s.name}（${TPL_NAME[s.tpl || ""] || "淘汰赛"}）`;
    const t = s.type === "swiss" ? `瑞士轮 ${s.swissRounds || 3} 轮` : s.type === "cross" ? "组间对抗" : s.groups ? "组内循环" : `${["", "单", "双", "三"][s.times || 1]}循环`;
    return `${s.name}（${t} BO${s.bo || 3}）`;
  }).join(" → ");
}
export function fmtBracketRounds(r: StageRun) {
  const B = r.br!, ms = bracketMatches(B), max = Math.max(0, ...ms.map(m => m.rd)), out: any[] = [];
  for (let rd = 1; rd <= max; rd++) {
    const list = ms.filter(m => m.rd === rd);
    const pairs = list.map(m => [slotTeam(B, m.a) || null, slotTeam(B, m.b) || null]);
    const winners = list.map(m => (B.res[m.id] && B.res[m.id].w) || null);
    const done = list.every(m => !!B.res[m.id]), now = !done && rd === r.doneR + 1;
    const final = list.length === 1 && list[0].win === 1;
    out.push({ label: final ? "决赛" : `第 ${rd} 轮`, pairs, winners, done, now, ph: !done && !now, final });
  }
  return out;
}
export function fmtTitleCount(team: string, sis: number[]): number {
  return (S.fmtTitles || []).filter((x: any) => x.team === team && sis.includes(x.si)).length;
}
