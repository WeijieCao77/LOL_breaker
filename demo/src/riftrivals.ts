/* ============================================================
   S6 开档 · 洲际赛（Rift Rivals LCK-LPL-LMS，2017–2019；作者 2026-09-17 D6「一期就做」）
   真实赛制（formats_2016_2021.md 第 5 节）：夏季赛开打前一周（7 月初），每个赛区春季赛前 4 名参赛。
   · 小组赛：只打其他赛区的同名次队伍，BO1；按赛区总胜场排名（2019 年 LMS 2 队 + VCS 2 队合算一个赛区）
   · 淘汰赛：第 2 名赛区对第 3 名赛区（半决赛），胜者对第 1 名赛区（决赛）；都是 BO5「接力」——
     每局双方各派一支队，打满五局时每队都要上场、任何队最多两次（这里按 1→2→3→4→1 轮着派）
   · 算荣誉「洲际赛冠军」、加名望；不算进 MSI / 世界赛冠军数，也不算卫冕压力。
   你的队是本赛区春季赛前 4：你随队参赛（按你们的真实赢面打），否则在新闻里看结果。
   ============================================================ */
import { S } from "./state";
import { rnd } from "./rng";
import { FMT_HOOKS, runOf } from "./fmtctl";
import { winProb } from "./intl";
import { SEASONS, pushEvent, addFans } from "./main";

const REGION_NAME: Record<string, string> = { LCK: "LCK", LPL: "LPL", PCS: "LMS", VCS: "VCS" };
const DATES: Record<number, string> = { 2017: "7 月 6–9 日 · 高雄", 2018: "7 月 5–8 日 · 大连", 2019: "7 月 4–7 日 · 首尔" };

function pGame(a: string, b: string) {
  if (S.team && FMT_HOOKS.myP && (a === S.team || b === S.team)) {
    const q = Math.max(0.03, Math.min(0.97, FMT_HOOKS.myP(a === S.team ? b : a)));
    return a === S.team ? q : 1 - q;
  }
  return winProb(a, b);
}
const game = (a: string, b: string) => (rnd() < pGame(a, b) ? a : b);

/* 一场接力 BO5：两个赛区各 4 队轮着派 */
function relay(A: string[], B: string[]) {
  let wa = 0, wb = 0, i = 0;
  while (wa < 3 && wb < 3) { const a = A[i % A.length], b = B[i % B.length]; if (game(a, b) === a) wa++; else wb++; i++; }
  return { wa, wb };
}

export function riftRivals() {
  const y = S.fmt && S.fmt.y;
  if (!y || y < 2017 || y > 2019 || S.rrDone === y) return;
  S.rrDone = y;
  const top4 = (lg: string, n = 4) => { const run = runOf(lg); const o = run && run.outs && run.outs[0]; return o ? o.order.slice(0, n) : []; };
  const regions: { key: string; name: string; teams: string[] }[] = [
    { key: "LCK", name: "LCK", teams: top4("LCK") }, { key: "LPL", name: "LPL", teams: top4("LPL") },
    y === 2019 ? { key: "PCS", name: "LMS / VCS", teams: top4("PCS", 2).concat(top4("VCS", 2)) } : { key: "PCS", name: "LMS", teams: top4("PCS") }
  ].filter(r => r.teams.length === 4);
  if (regions.length < 3) return;
  const wins: Record<string, number> = {};
  regions.forEach(r => { wins[r.key] = 0; });
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++)
    for (let k = 0; k < 4; k++) { const a = regions[i].teams[k], b = regions[j].teams[k]; wins[game(a, b) === a ? regions[i].key : regions[j].key]++; }
  const rank = regions.slice().sort((x, z) => wins[z.key] - wins[x.key]);
  const sf = relay(rank[1].teams, rank[2].teams), sfW = sf.wa > sf.wb ? rank[1] : rank[2], sfL = sfW === rank[1] ? rank[2] : rank[1];
  const fi = relay(rank[0].teams, sfW.teams), champ = fi.wa > fi.wb ? rank[0] : sfW, runner = champ === rank[0] ? sfW : rank[0];
  const fs = champ === rank[0] ? `${fi.wa}:${fi.wb}` : `${fi.wb}:${fi.wa}`;
  const tag = SEASONS[S.si] ? SEASONS[S.si].tag : String(y);
  const mine = regions.find(r => S.team && r.teams.includes(S.team));
  const lineup = regions.map(r => `${r.name}：${r.teams.join("、")}`).join("<br>");
  pushEvent(`<b>${tag} 洲际赛</b>（${DATES[y]}，真实赛制：各赛区春季赛前 4，同名次 BO1 → 接力 BO5）：小组赛 ${rank.map(r => `${r.name} ${wins[r.key]} 胜`).join(" · ")}；半决赛 ${sfW.name} 胜 ${sfL.name}；决赛 <b>${champ.name}</b> ${fs} ${runner.name}。`, "info", "洲际赛");
  if (mine) {
    const won = mine === champ;
    S.career.rrTitles = (S.career.rrTitles || []).concat(won ? [`${tag} 洲际赛`] : []);
    addFans(won ? 25 : 8);
    pushEvent(won ? `<b>${S.team} 随 ${mine.name} 拿下 ${tag} 洲际赛冠军。</b>赛区荣誉，不算进 MSI / 世界赛——但所有人都记住了这个夏天。`
      : `${S.team} 代表 ${mine.name} 出战洲际赛，止步于${mine === runner ? "决赛" : mine === sfL ? "半决赛" : "小组赛"}。`, won ? "big" : "info", "洲际赛");
    S.tlPop = { eyebrow: `${tag} · 洲际赛（${DATES[y]}）`, title: won ? `${mine.name} 夺冠` : `${champ.name} 夺冠`,
      body: `你们是本赛区春季赛前四，代表 <b>${mine.name}</b> 出战。<br>${lineup}<br><br>小组赛：${rank.map(r => `${r.name} ${wins[r.key]} 胜`).join(" · ")}<br>决赛：<b>${champ.name}</b> ${fs} ${runner.name}` };
  }
  void REGION_NAME;
}
