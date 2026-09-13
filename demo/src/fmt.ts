/* ============================================================
   真实赛制 · 通用零件（2026-09-13，只给真实时间线新档用）
   循环赛排程、瑞士轮配对、淘汰树模板、对阵结算、积分榜排序。
   全是纯函数：不读 S，随机数由调用方传进来——批测才能逐字节复现。
   ============================================================ */

export type BO = 1 | 3 | 5;
export interface Series { a: string; b: string; bo: BO; w?: string; l?: string; sw?: number; sl?: number; auto?: boolean; id?: string; pts?: number }

/* 一个系列赛：每局 a 赢的概率是 pGame，先到 ceil(bo/2) 胜 */
export function playSeries(a: string, b: string, bo: BO, pGame: number, r: () => number): Series {
  const need = (bo + 1) / 2; let wa = 0, wb = 0;
  while (wa < need && wb < need) { if (r() < pGame) wa++; else wb++; }
  return wa > wb ? { a, b, bo, w: a, l: b, sw: wa, sl: wb } : { a, b, bo, w: b, l: a, sw: wb, sl: wa };
}

/* ---------- 循环赛 ----------
   圆桌法：n 队（奇数补一个轮空）排 n-1 轮，每队每轮最多一场；times 次循环时主客互换。 */
export type Pair = [string, string];
export function rrRounds(teams: string[], times = 1): Pair[][] {
  const t = teams.slice(); if (t.length < 2) return [];
  if (t.length % 2) t.push("");
  const n = t.length, half = n / 2, base: Pair[][] = [];
  let arr = t.slice();
  for (let r = 0; r < n - 1; r++) {
    const round: Pair[] = [];
    for (let i = 0; i < half; i++) {
      const x = arr[i], y = arr[n - 1 - i];
      if (x && y) round.push(r % 2 ? [y, x] : [x, y]);
    }
    base.push(round);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  const out: Pair[][] = [];
  for (let k = 0; k < times; k++) base.forEach(rd => out.push(k % 2 ? rd.map(([x, y]) => [y, x] as Pair) : rd));
  return out;
}

/* LCK 杯组间对抗：两组等长，第 r 轮 A[i] 对 B[(i+r)%n]。
   superWeek（2026）：同顺位那一轮（r=0）挪到最后，BO5、赢一场记 2 分——由调用方按轮号处理。 */
export function crossRounds(A: string[], B: string[], superWeek: boolean): Pair[][] {
  const n = Math.min(A.length, B.length), rounds: Pair[][] = [];
  const order = superWeek ? [...Array(n).keys()].slice(1).concat([0]) : [...Array(n).keys()];
  order.forEach(r => rounds.push(A.slice(0, n).map((x, i) => [x, B[(i + r) % n]] as Pair)));
  return rounds;
}

/* ---------- 积分榜 ----------
   排序：积分（默认一场胜 1 分）→ 胜场 → 小分差 → 交手 → 种子顺序。 */
export interface Row { team: string; w: number; l: number; gw: number; gl: number; pts: number }
export function tableOf(teams: string[], games: Series[], seedOrder?: string[], ptsOf?: (s: Series) => number, base?: Row[]): Row[] {
  const m: Record<string, Row> = {};
  teams.forEach(t => { m[t] = { team: t, w: 0, l: 0, gw: 0, gl: 0, pts: 0 }; });
  (base || []).forEach(b => { const x = m[b.team]; if (x) { x.w += b.w; x.l += b.l; x.gw += b.gw; x.gl += b.gl; x.pts += b.pts; } });
  games.forEach(g => {
    if (!g.w || !g.l) return; const W = m[g.w], L = m[g.l]; if (!W || !L) return;
    W.w++; L.l++; W.gw += g.sw || 0; W.gl += g.sl || 0; L.gw += g.sl || 0; L.gl += g.sw || 0;
    W.pts += ptsOf ? ptsOf(g) : 1;
  });
  const ord = seedOrder || teams;
  const h2h = (x: string, y: string) => { let d = 0; games.forEach(g => { if (g.w === x && g.l === y) d++; else if (g.w === y && g.l === x) d--; }); return d; };
  return teams.map(t => m[t]).sort((x, y) => (y.pts - x.pts) || (y.w - x.w) || ((y.gw - y.gl) - (x.gw - x.gl)) || -h2h(x.team, y.team) || (ord.indexOf(x.team) - ord.indexOf(y.team)));
}

/* ---------- 瑞士轮（LCS 2026 Lock-In：8 队 3 轮） ----------
   第 1 轮 1v8、2v7…；之后同战绩的队里种子高对种子低，尽量不重复交手。 */
export function swissPairs(teams: string[], games: Series[], round: number): Pair[] {
  if (round <= 1) { const n = teams.length, out: Pair[] = []; for (let i = 0; i < n / 2; i++) out.push([teams[i], teams[n - 1 - i]]); return out; }
  const wins: Record<string, number> = {}; teams.forEach(t => { wins[t] = 0; });
  games.forEach(g => { if (g.w && wins[g.w] !== undefined) wins[g.w]++; });
  const met = (x: string, y: string) => games.some(g => (g.a === x && g.b === y) || (g.a === y && g.b === x));
  const pool = teams.slice().sort((x, y) => (wins[y] - wins[x]) || (teams.indexOf(x) - teams.indexOf(y)));
  const out: Pair[] = [];
  while (pool.length > 1) {
    const x = pool.shift()!; const same = pool.filter(y => wins[y] === wins[x]);
    const cand = (same.length ? same : pool).slice().reverse();
    const y = cand.find(c => !met(x, c)) || cand[0];
    pool.splice(pool.indexOf(y), 1); out.push([x, y]);
  }
  return out;
}

/* ---------- 淘汰树 ----------
   槽位：s3 = 3 号种子；W:m / L:m = 某场胜者 / 负者；HL:m1,m2 / LL:m1,m2 = 两场负者里种子高 / 低的那个。
   rd = 第几轮（同一轮同一周打）；lose / win = 负者 / 胜者拿到的名次（没有就是继续往下走）。 */
export interface BM { id: string; a: string; b: string; bo: BO; rd: number; lose?: number; win?: number }
const M = (id: string, a: string, b: string, rd: number, bo: BO, lose?: number, win?: number): BM => ({ id, a, b, rd, bo, lose, win });

function de8(b1: BO): BM[] {
  return [
    M("u1a", "s1", "s8", 1, b1), M("u1b", "s4", "s5", 1, b1), M("u1c", "s2", "s7", 1, b1), M("u1d", "s3", "s6", 1, b1),
    M("u2a", "W:u1a", "W:u1b", 2, b1), M("u2b", "W:u1c", "W:u1d", 2, b1), M("l1a", "L:u1a", "L:u1b", 2, b1, 7), M("l1b", "L:u1c", "L:u1d", 2, b1, 7),
    M("uf", "W:u2a", "W:u2b", 3, 5), M("l2a", "W:l1a", "L:u2b", 3, b1, 5), M("l2b", "W:l1b", "L:u2a", 3, b1, 5),
    M("l3", "W:l2a", "W:l2b", 4, 5, 4),
    M("lf", "L:uf", "W:l3", 5, 5, 3),
    M("f", "W:uf", "W:lf", 6, 5, 2, 1)
  ];
}

export const BRK: Record<string, BM[]> = {
  /* 4 队单败（小赛区简化联赛）：1v4、2v3，决赛 */
  SE4: [M("a", "s1", "s4", 1, 5, 3), M("b", "s2", "s3", 1, 5, 3), M("f", "W:a", "W:b", 2, 5, 2, 1)],
  /* LCK 2022：6 队单败，1 号打 4v5 胜者 */
  SE6: [M("q1", "s3", "s6", 1, 5, 5), M("q2", "s4", "s5", 1, 5, 5), M("sf1", "s1", "W:q2", 2, 5, 3), M("sf2", "s2", "W:q1", 2, 5, 3), M("f", "W:sf1", "W:sf2", 3, 5, 2, 1)],
  /* LCK 2023–2024、LCK 杯 2025：首轮单败，之后四队双败 */
  LCK23: [
    M("r1a", "s3", "s6", 1, 5, 5), M("r1b", "s4", "s5", 1, 5, 5),
    M("r2a", "s1", "W:r1b", 2, 5), M("r2b", "s2", "W:r1a", 2, 5),
    M("ubf", "W:r2a", "W:r2b", 3, 5), M("lb1", "L:r2a", "L:r2b", 3, 5, 4),
    M("lbf", "L:ubf", "W:lb1", 4, 5, 3), M("f", "W:ubf", "W:lbf", 5, 5, 2, 1)
  ],
  /* 6 队完整双败 / 长败者组（LCK 2025 季后赛起、LCS 2024 夏、LCS 2026 夏）：1、2 号轮空 */
  DE6F: [
    M("u1a", "s3", "s6", 1, 5), M("u1b", "s4", "s5", 1, 5),
    M("u2a", "s1", "W:u1b", 2, 5), M("u2b", "s2", "W:u1a", 2, 5), M("l1", "L:u1a", "L:u1b", 2, 5, 6),
    M("uf", "W:u2a", "W:u2b", 3, 5), M("l2", "W:l1", "LL:u2a,u2b", 3, 5, 5),
    M("l3", "HL:u2a,u2b", "W:l2", 4, 5, 4),
    M("lf", "L:uf", "W:l3", 5, 5, 3), M("f", "W:uf", "W:lf", 6, 5, 2, 1)
  ],
  /* 6 队双败：1–4 号胜者组、5–6 号败者组（LEC、LCS 春季赛、LCS 2026 Lock-In、赛季总决赛） */
  DE6A: [
    M("ua", "s1", "s4", 1, 5), M("ub", "s2", "s3", 1, 5),
    M("uf", "W:ua", "W:ub", 2, 5), M("la", "HL:ua,ub", "s6", 2, 5, 5), M("lb", "LL:ua,ub", "s5", 2, 5, 5),
    M("ls", "W:la", "W:lb", 3, 5, 4), M("lf", "L:uf", "W:ls", 4, 5, 3), M("f", "W:uf", "W:lf", 5, 5, 2, 1)
  ],
  /* LPL 2022–2024 十队冒泡赛：两条单败阶梯 + 四强双败 */
  KOTH10: [
    M("x1", "s8", "s9", 1, 5, 9), M("y1", "s7", "s10", 1, 5, 9),
    M("x2", "s5", "W:x1", 2, 5, 7), M("y2", "s6", "W:y1", 2, 5, 7),
    M("x3", "s4", "W:x2", 3, 5, 5), M("y3", "s3", "W:y2", 3, 5, 5),
    M("r4a", "s1", "W:x3", 4, 5), M("r4b", "s2", "W:y3", 4, 5),
    M("ubf", "W:r4a", "W:r4b", 5, 5), M("lb", "L:r4a", "L:r4b", 5, 5, 4),
    M("lbf", "L:ubf", "W:lb", 6, 5, 3), M("f", "W:ubf", "W:lbf", 7, 5, 2, 1)
  ],
  /* 8 队双败全在胜者组（LPL 2025 S2 起），全 BO5 */
  DE8: de8(5),
  /* LEC 前 8 双败：前两轮 BO3 */
  DE8B: de8(3),
  /* 8 队双败：1–4 号胜者组、5–8 号败者组（LPL 2025 S1、LEC 2025 夏、LTA 2025 第三赛段） */
  DE8UL: [
    M("ua", "s1", "s4", 1, 5), M("ub", "s2", "s3", 1, 5), M("la", "s5", "s8", 1, 5, 7), M("lb", "s6", "s7", 1, 5, 7),
    M("uf", "W:ua", "W:ub", 2, 5), M("l2a", "W:la", "L:ub", 2, 5, 5), M("l2b", "W:lb", "L:ua", 2, 5, 5),
    M("l3", "W:l2a", "W:l2b", 3, 5, 4), M("lf", "L:uf", "W:l3", 4, 5, 3), M("f", "W:uf", "W:lf", 5, 5, 2, 1)
  ],
  /* 8 队双败：1、2 号轮空到胜者组第二轮，3–6 号胜者组首轮，7、8 号从败者组首轮起步
     （LPL 2026 第三赛段总决赛：7、8 号是骑士之路胜者；LCS 2022–2023 总决赛） */
  DE8K: [
    M("u1a", "s3", "s6", 1, 5), M("u1b", "s4", "s5", 1, 5),
    M("u2a", "s1", "W:u1b", 2, 5), M("u2b", "s2", "W:u1a", 2, 5), M("l1a", "L:u1a", "s8", 2, 5, 7), M("l1b", "L:u1b", "s7", 2, 5, 7),
    M("uf", "W:u2a", "W:u2b", 3, 5), M("l2a", "W:l1a", "L:u2b", 3, 5, 5), M("l2b", "W:l1b", "L:u2a", 3, 5, 5),
    M("l3", "W:l2a", "W:l2b", 4, 5, 4), M("lf", "L:uf", "W:l3", 5, 5, 3), M("f", "W:uf", "W:lf", 6, 5, 2, 1)
  ],
  /* 4 队双败取 2（LEC 2023 分组 BO3、LCK 2025 季后入围 BO5）：胜者组赢家第 1、决胜战赢家第 2 */
  GSL4: [M("a", "s1", "s4", 1, 5), M("b", "s2", "s3", 1, 5), M("w", "W:a", "W:b", 2, 5, undefined, 1), M("e", "L:a", "L:b", 2, 5, 4), M("d", "L:w", "W:e", 3, 5, 3, 2)],
  /* 两个 4 队 GSL 小组并排（LEC 2023 分组）：A 组 s1 s4 s5 s8、B 组 s2 s3 s6 s7；组第一 win=1、组第二 win=3 */
  GSL8: [
    M("aa", "s1", "s8", 1, 3), M("ab", "s4", "s5", 1, 3), M("ba", "s2", "s7", 1, 3), M("bb", "s3", "s6", 1, 3),
    M("aw", "W:aa", "W:ab", 2, 3, undefined, 1), M("ae", "L:aa", "L:ab", 2, 3, 7), M("bw", "W:ba", "W:bb", 2, 3, undefined, 1), M("be", "L:ba", "L:bb", 2, 3, 7),
    M("ad", "L:aw", "W:ae", 3, 3, 5, 3), M("bd", "L:bw", "W:be", 3, 3, 5, 3)
  ],
  /* LEC 2023 赛段季后赛：两个小组第一在胜者组 */
  DE4: [M("u", "s1", "s2", 1, 5), M("l", "s3", "s4", 1, 5, 4), M("lf", "L:u", "W:l", 2, 5, 3), M("f", "W:u", "W:lf", 3, 5, 2, 1)],
  /* 瀑布赛（地区资格赛、LCK 2026 季后入围）：1v2 胜者第 1；3v4 胜者再打 1v2 负者争第 2 */
  WF4: [M("a", "s1", "s2", 1, 5, undefined, 1), M("b", "s3", "s4", 1, 5, 4), M("c", "L:a", "W:b", 2, 5, 3, 2)],
  /* LCK Road to MSI：5v6→4→3 的阶梯；1v2 胜者 MSI 1 号，负者对阶梯胜者争 2 号 */
  RTMSI: [M("m1", "s5", "s6", 1, 5, 6), M("m2", "s4", "W:m1", 2, 5, 5), M("m3a", "s1", "s2", 3, 5, undefined, 1), M("m3b", "s3", "W:m2", 3, 5, 4), M("m4", "L:m3a", "W:m3b", 4, 5, 3, 2)],
  /* LCK 杯入围赛：6 队、两队轮空，BO3 两轮 + 最后一场 BO5，取 3 */
  PI6: [M("a", "s3", "s6", 1, 3, 5), M("b", "s4", "s5", 1, 3, 5), M("c", "s1", "W:b", 2, 3, undefined, 1), M("d", "s2", "W:a", 2, 3, undefined, 2), M("e", "L:c", "L:d", 3, 5, 4, 3)],
  /* LTA 2025 第一赛段分区赛：8 队双败 BO3，每区取 4 */
  Q8: [
    M("a", "s1", "s8", 1, 3), M("b", "s4", "s5", 1, 3), M("c", "s2", "s7", 1, 3), M("d", "s3", "s6", 1, 3),
    M("ua", "W:a", "W:b", 2, 3, undefined, 1), M("ub", "W:c", "W:d", 2, 3, undefined, 2), M("la", "L:a", "L:b", 2, 3, 7), M("lb", "L:c", "L:d", 2, 3, 7),
    M("xa", "L:ua", "W:lb", 3, 3, 5, 3), M("xb", "L:ub", "W:la", 3, 3, 5, 4)
  ],
  /* 8 队单败：BO3，决赛 BO5（LTA 2025 跨区季后赛） */
  SE8: [M("q1", "s1", "s8", 1, 3, 5), M("q2", "s4", "s5", 1, 3, 5), M("q3", "s2", "s7", 1, 3, 5), M("q4", "s3", "s6", 1, 3, 5), M("sa", "W:q1", "W:q2", 2, 3, 3), M("sb", "W:q3", "W:q4", 2, 3, 3), M("f", "W:sa", "W:sb", 3, 5, 2, 1)],
  /* LTA 2025 美洲总决赛：s1 北区冠军 s2 南区冠军 s3 北 2 s4 南 2 s5 北 3 s6 南 3 */
  LTAC: [M("uf", "s1", "s2", 1, 5), M("l1a", "s3", "s6", 1, 5, 5), M("l1b", "s4", "s5", 1, 5, 5), M("l2", "W:l1a", "W:l1b", 2, 5, 4), M("lf", "L:uf", "W:l2", 3, 5, 3), M("f", "W:uf", "W:lf", 4, 5, 2, 1)],
  /* LPL 2026 第一赛段骑士之路：s1 登峰5 s2 坚毅2 s3 登峰6 s4 坚毅1 s5 坚毅3 s6 涅槃2 s7 坚毅4 s8 涅槃1；取 4 */
  KR3: [
    M("m1", "s1", "s2", 1, 5, undefined, 1), M("m2", "s3", "s4", 1, 5, undefined, 2), M("m3", "s5", "s6", 1, 5, 7), M("m4", "s7", "s8", 1, 5, 7),
    M("r3a", "L:m1", "W:m4", 2, 5, 5, 3), M("r3b", "L:m2", "W:m3", 2, 5, 5, 4)
  ]
};

/* 单场对决组（骑士之路、加赛）：n 场，第 i 场 s(2i-1) 对 s(2i)，胜者按场次排第 i */
export function krTpl(n: number, bo: BO): BM[] {
  const out: BM[] = [];
  for (let i = 1; i <= n; i++) out.push(M("k" + i, "s" + (2 * i - 1), "s" + (2 * i), 1, bo, n + i, i));
  return out;
}

export interface BState { tpl: string; seeds: string[]; res: Record<string, Series>; n?: number; bo?: BO }
export function bracketMatches(st: BState): BM[] {
  const base = st.tpl === "KR" ? krTpl(st.n || 1, st.bo || 5) : BRK[st.tpl];
  return st.bo && st.tpl !== "KR" ? base.map(m => ({ ...m, bo: st.bo! })) : base;
}
export function bracketRoundsCount(st: BState): number { return Math.max(0, ...bracketMatches(st).map(m => m.rd)); }

export function slotTeam(st: BState, slot: string): string | undefined {
  if (slot[0] === "s") return st.seeds[+slot.slice(1) - 1];
  const [k, ref] = slot.split(":");
  if (k === "W" || k === "L") { const r = st.res[ref]; return r ? (k === "W" ? r.w : r.l) : undefined; }
  const [m1, m2] = ref.split(","); const x = st.res[m1]?.l, y = st.res[m2]?.l;
  if (!x || !y) return undefined;
  const xi = st.seeds.indexOf(x), yi = st.seeds.indexOf(y);
  const hi = xi <= yi ? x : y, lo = xi <= yi ? y : x;
  return k === "HL" ? hi : lo;
}

/* 第 rd 轮要打的对阵（两边都已确定、还没打的） */
export function roundPairs(st: BState, rd: number): { m: BM; a: string; b: string }[] {
  return bracketMatches(st).filter(m => m.rd === rd && !st.res[m.id]).map(m => ({ m, a: slotTeam(st, m.a)!, b: slotTeam(st, m.b)! })).filter(x => x.a && x.b);
}

/* 名次：打完的场次给胜负双方的名次；并列按种子排。没有名次的队（还在打）不列出。 */
export function bracketPlaces(st: BState): { team: string; place: number }[] {
  const pl: Record<string, number> = {};
  bracketMatches(st).forEach(m => {
    const r = st.res[m.id]; if (!r) return;
    if (m.win !== undefined && r.w) pl[r.w] = m.win;
    if (m.lose !== undefined && r.l) pl[r.l] = m.lose;
  });
  return Object.keys(pl).map(team => ({ team, place: pl[team] })).sort((x, y) => (x.place - y.place) || (st.seeds.indexOf(x.team) - st.seeds.indexOf(y.team)));
}
export function bracketDone(st: BState): boolean { return bracketMatches(st).every(m => !!st.res[m.id]); }

/* 按「每周几轮」把第 1..rounds 轮分到周：返回某一周包含的轮号 */
export function roundsOfWeek(week: number, perWeek: number, rounds: number): number[] {
  const out: number[] = []; for (let r = (week - 1) * perWeek + 1; r <= Math.min(rounds, week * perWeek); r++) out.push(r); return out;
}
export const weeksFor = (rounds: number, perWeek: number) => Math.max(1, Math.ceil(rounds / Math.max(1, perWeek)));

/* 冠军积分：表按名次写（第 1 名下标 0）；名次超出表长为 0 */
export const ptsAt = (table: number[] | undefined, place: number) => (table && place >= 1 && place <= table.length) ? table[place - 1] : 0;
