/* ---------------- 真实赛制自检（2026-09-13）----------------
   一、赛制表：每个联赛 2022–2028 逐年跑通——每个赛段打得完、名次不重复、种子不缺人、国际赛名额够数，
       外加几条真实结构（LPL 2026 登峰 6 / 坚毅 4 / 涅槃 4、涅槃垫底全年淘汰、LCK 第 3–5 轮三循环…）。
   二、整局：新档打到 2027（再战），First Stand 有冠军、2027 公告发了、2027 回到三段制；
       老档（没开真实时间线）一行都不走新赛制。 */
import { newYear, beginSplit, simWeek, LeagueRun, StageRun, YearSpec } from "./src/fmtrun";
import { yearSpec, INTL_SLOTS } from "./src/fmtspec2";

const COUNTS: Record<string, (y: number) => number> = {
  LPL: y => ({ 2022: 17, 2023: 17, 2024: 17, 2025: 16 } as Record<number, number>)[y] || 14,
  LCK: () => 10, LEC: () => 10, LCS: y => (y <= 2023 ? 10 : 8), PCS: () => 4,
  LDL: y => ({ 2022: 24, 2023: 20, 2024: 19, 2025: 10 } as Record<number, number>)[y] || 0
};

interface Sim { run: LeagueRun; ys: YearSpec; stages: Record<string, StageRun>; }
function simYear(lg: string, y: number, seed: number): Sim | null {
  const n = COUNTS[lg](y); if (!n) return null;
  let s = seed;
  const rng = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const teams = [...Array(n)].map((_, i) => `${lg}${i + 1}`);
  const str: Record<string, number> = {}; teams.forEach((t, i) => { str[t] = 80 - i * 1.2 + rng() * 4; });
  const ys = yearSpec(lg, y, n); if (!ys) return null;
  const run = newYear(lg, y, teams, teams);
  const iy = INTL_SLOTS[Math.min(2026, Math.max(2022, y))], key = lg === "PCS" ? "CBLOL" : lg;
  run.slots = { fst: (iy.fst && iy.fst[key]) || 0, msi: iy.msi[key] || 0, worlds: (iy.worlds[key] || 0) + (iy.bonus && (lg === "LPL" || lg === "LCK") ? 1 : 0) };
  const pG = (a: string, b: string) => 1 / (1 + Math.exp(-(str[a] - str[b]) / 6));
  const stages: Record<string, StageRun> = {};
  beginSplit(run, ys);
  let g = 0;
  while (!run.done && ++g < 600) {
    if (run.wait) { beginSplit(run, ys); continue; }
    const r = run.runs[run.stage]; if (r) stages[`${ys.splits[run.si].key}.${r.key}`] = r;
    simWeek(run, ys, pG, rng);
  }
  return { run, ys, stages };
}
const perTeam = (r: StageRun | undefined) => { const m: Record<string, number> = {}; (r ? r.games : []).forEach(x => { m[x.a] = (m[x.a] || 0) + 1; m[x.b] = (m[x.b] || 0) + 1; }); return m; };
const sizes = (r: StageRun | undefined) => (r ? r.groups.map(g => g.teams.length) : []).join("/");

export function fmtSpecChecks(): string[] {
  const bad: string[] = [];
  const sims: Record<string, Sim> = {};
  for (const y of [2022, 2023, 2024, 2025, 2026, 2027, 2028]) for (const lg of ["LPL", "LCK", "LEC", "LCS", "PCS", "LDL"]) {
    let sim: Sim | null = null;
    try { sim = simYear(lg, y, 9000 + y); } catch (e: any) { bad.push(`${lg} ${y} 赛制跑崩：${e && e.message}`); continue; }
    if (!sim) continue;
    sims[`${lg}|${y}`] = sim;
    const { run, ys, stages } = sim;
    if (!run.done) bad.push(`${lg} ${y} 没打完（停在第 ${run.si + 1} 个赛段）`);
    if (run.outs.length !== ys.splits.length) bad.push(`${lg} ${y} 赛段数 ${run.outs.length} ≠ 赛制表 ${ys.splits.length}`);
    run.outs.forEach((o, i) => {
      const sp = ys.splits[i];
      if (!o.champ) bad.push(`${lg} ${y} ${sp.name} 没有冠军`);
      if (new Set(o.order).size !== o.order.length) bad.push(`${lg} ${y} ${sp.name} 名次重复`);
      if (sp.after && o.intl && (new Set(o.intl).size !== o.intl.length || o.intl.some(t => !t))) bad.push(`${lg} ${y} ${sp.name} 国际赛名单缺人或重复`);
      const want = sp.after ? ((run.slots || {})[sp.after] || 0) : 0;
      if (sp.after && want && (!o.intl || o.intl.length !== want) && lg !== "LDL") bad.push(`${lg} ${y} ${sp.name} ${sp.after} 名额 ${o.intl ? o.intl.length : 0} ≠ ${want}`);
    });
    Object.keys(stages).forEach(k => { const r = stages[k]; if (r.br && (r.br.seeds.some(t => !t) || new Set(r.br.seeds).size !== r.br.seeds.length)) bad.push(`${lg} ${y} ${k} 种子缺人或重复`); });
  }
  const S = (k: string) => sims[k];
  /* 几条真实结构 */
  { const s = S("LPL|2026"); if (s) {
    if (sizes(s.stages["s1.g"]) !== "6/4/4") bad.push(`LPL 2026 第一赛段分组应为 登峰 6 / 坚毅 4 / 涅槃 4，实际 ${sizes(s.stages["s1.g"])}`);
    const a1 = s.stages["s1.g"] && s.stages["s1.g"].groups[0].teams[0];
    if (a1 && perTeam(s.stages["s1.g"])[a1] !== 10) bad.push(`LPL 2026 登峰组双循环每队应打 10 场，实际 ${perTeam(s.stages["s1.g"])[a1]}`);
    const out2 = s.run.outs[1] && s.run.outs[1].outSeason || [];
    if (out2.length !== 2) bad.push(`LPL 2026 第二赛段涅槃组 5–6 名应全年淘汰 2 队，实际 ${out2.length}`);
    const s3 = s.stages["s3.ru"]; if (s3 && s3.groups.reduce((a, g) => a + g.teams.length, 0) !== 12) bad.push("LPL 2026 第三赛段应只剩 12 队");
    if (sizes(s3) !== "8/4") bad.push(`LPL 2026 第三赛段应为 登峰 8 / 涅槃 4，实际 ${sizes(s3)}`);
  } }
  { const s = S("LPL|2025"); if (s) {
    if (sizes(s.stages["s2.ru"]) !== "10/6") bad.push(`LPL 2025 第二赛段应为 登峰 10 / 涅槃 6，实际 ${sizes(s.stages["s2.ru"])}`);
    if ((s.run.outs[1] && s.run.outs[1].outSeason || []).length !== 2) bad.push("LPL 2025 第二赛段涅槃 5–6 名应全年淘汰");
  } }
  { const s = S("LPL|2024"); if (s && (s.run.outs[1] && s.run.outs[1].outSeason || []).length !== 4) bad.push("LPL 2024 夏季赛涅槃组 5–8 名应提前结束全年"); }
  { const s = S("LPL|2027"); if (s) {
    if (s.run.outSeason.length) bad.push("LPL 2027 起不应再有赛季中途淘汰");
    if (s.ys.splits.map(x => x.key).join(",") !== "s1,s2,s3,rf") bad.push(`LPL 2027 应为三段制 + 地区资格赛，实际 ${s.ys.splits.map(x => x.key).join(",")}`);
    if (!s.stages["s2.kr"]) bad.push("LPL 2027 第二赛段应保留骑士之路");
    if (Object.keys(s.stages).some(k => /ru$/.test(k))) bad.push("LPL 2027 不应再分登峰 / 涅槃组");
  } }
  { const s = S("LCK|2025"); if (s) {
    const r12 = perTeam(s.stages["r12.rs"]), ru = perTeam(s.stages["r35.ru"]);
    if (Object.values(r12).some(v => v !== 18)) bad.push("LCK 2025 第 1–2 轮每队应打 18 场");
    if (Object.values(ru).some(v => v !== 12)) bad.push("LCK 2025 第 3–5 轮 Legend / Rise 组内三循环每队应打 12 场");
  } }
  { const s = S("LCK|2026"); if (s && Object.values(perTeam(s.stages["r35.ru"])).some(v => v !== 8)) bad.push("LCK 2026 第 3–4 轮（亚运会缩短）每队应打 8 场"); }
  { const s = S("LEC|2023"); if (s) {
    if (s.ys.splits.map(x => x.key).join(",") !== "winter,spring,summer,finals") bad.push("LEC 2023 应为 冬 / 春 / 夏 + 赛季总决赛");
    const f = s.stages["finals.po"]; if (f && f.br && f.br.seeds.length !== 6) bad.push("LEC 2023 赛季总决赛应为 6 队");
  } }
  { const s = S("LCS|2026"); if (s && Object.values(perTeam(s.stages["lockin.sw"])).some(v => v !== 3)) bad.push("LCS 2026 Lock-In 瑞士轮每队应打 3 场"); }
  /* 国际赛名额总数（MSI 挂钩的 2 个另算） */
  const sum = (o?: Record<string, number>) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const WANT: Record<number, [number, number, number]> = { 2022: [0, 11, 24], 2023: [0, 13, 23], 2024: [0, 12, 18], 2025: [5, 10, 15], 2026: [8, 11, 17] };
  Object.keys(WANT).forEach(k => { const y = +k, w = WANT[y], iy = INTL_SLOTS[y];
    const got: [number, number, number] = [sum(iy.fst), sum(iy.msi), sum(iy.worlds)];
    if (got.join() !== w.join()) bad.push(`${y} 国际赛名额 First Stand / MSI / 世界赛 = ${got.join(" / ")}，应为 ${w.join(" / ")}`); });
  return bad;
}

export function fmtCareerChecks(playOne: (o: any) => any, A: any): string[] {
  const bad: string[] = [];
  /* 新档打到 2027。一路上每隔几步把界面各页真的算一遍（批测机器人不画「世界」标签页，新的积分榜 / 对阵树只有这里跑得到） */
  const viewErr: string[] = [];
  let views = 0;
  const probe = (S0: any, A0: any, g: number) => {
    if (g % 13 !== 0 || !S0.career || !S0.fmt) return;
    const tab = S0.tab;
    const v = (name: string, fn: () => any) => { try { fn(); views++; } catch (e: any) { if (viewErr.length < 8) viewErr.push(`${name}（${S0.step}）：${e && e.message}`); } };
    try {
      if (S0.step === "season") { v("本周页", () => A0.viewSeason()); ["world", "me", "team", "news"].forEach(t => v(`标签页 ${t}`, () => A0.tabContent(t))); v("积分榜", () => A0.standingsCard()); v("对阵树", () => A0.bracketCard()); }
      if (S0.step === "match" && S0.match) v("比赛页", () => {
        const h = A0.viewMatch();
        if (!S0.match.done && S0.match.opp && !/实际差距/.test(h) && viewErr.length < 8) viewErr.push("比赛页（进行中）没写实际差距");
      });
      if (S0.step === "prep" && S0.prep) v("备战页", () => A0.viewPrep());
      if (S0.step === "offseason") { v("间歇页", () => A0.viewOffseason()); v("对阵树", () => A0.bracketCard()); }
      v("时钟", () => A0.nowLabel());
    } finally { S0.tab = tab; }
  };
  const r = playOne({ seed: 8801, strong: true, encore: true, noBondTalk: true, hook: probe });
  const S = A.S();
  if (!views) bad.push("真实赛制：界面渲染探针一次都没跑到");
  if (viewErr.length) bad.push("真实赛制界面渲染出错：" + viewErr.join("；"));
  if (!r.ok) bad.push("真实赛制：整局没打完");
  if (!S.tl) bad.push("真实赛制：新档没开真实时间线");
  const played = (si: number) => ((S.career && S.career.log) || []).some((x: any) => x.si === si && x.seg);
  if (!((S.career && S.career.log) || []).some((x: any) => x.seg)) bad.push("真实赛制：新档的生涯记录里没有真实赛段");
  const H = S.honors || {};
  [3, 4].forEach(si => { if (played(si) && !(H.fst && H.fst[si])) bad.push(`真实赛制：${2022 + si} 年打了联赛，却没有 First Stand 冠军记录`); });
  const T = S.fmtTitles || [];
  if (played(4) && T.filter((x: any) => x.y === 2026 && x.lg === "LPL").length !== 3) bad.push("真实赛制：2026 LPL 应决出三个赛段冠军");
  if (played(5)) {
    if (S.fmtAnn27 !== 1) bad.push("真实赛制：2027 赛制调整公告没发");
    const has = (lg: string, t: string) => T.some((x: any) => x.y === 2027 && x.lg === lg && x.t === t);
    if (!has("LPL", "第一赛段") || !has("LPL", "第二赛段") || !has("LPL", "第三赛段")) bad.push("真实赛制：2027 LPL 三个赛段冠军没记全");
    if (!has("LEC", "冬季赛")) bad.push("真实赛制：2027 LEC 没回到冬季赛");
    if (!has("LCK", " Cup") || !has("LCK", "季后赛")) bad.push("真实赛制：2027 LCK 杯 / 季后赛冠军没记全");
  }
  /* 老档：签约前把真实时间线关掉，一整局都不应碰新赛制 */
  const r2 = playOne({ seed: 8802, noBondTalk: true, hook: (S2: any) => { if (!S2.career && S2.tl) S2.tl = 0; } });
  const S2 = A.S();
  if (!r2.ok) bad.push("老档：整局没打完");
  if (S2.fmt) bad.push("老档（没开真实时间线）也走了真实赛制");
  if (((S2.career && S2.career.log) || []).some((x: any) => x.seg)) bad.push("老档的生涯记录里出现了真实赛段");
  if (((S2.career && S2.career.titles) || []).some((t: string) => /第[一二三]赛段| Cup| Versus| Lock|First Stand/.test(t))) bad.push("老档的冠军头衔出现了真实赛制的名字");
  return bad;
}
