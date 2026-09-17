/* ============================================================
   S6 开档 · 升降级与 2018 联盟化席位（2026-09-17 作者拍板 D5「都做」）
   真实赛制（formats_2016_2021.md 1.3）：LPL 2016 春、2016 夏、2017 春三个赛段结束后打升降级，
   两组第 5、6 名和 LSPL 第 2、3 名，两条分支全 BO5：
     ① 两个第 6 名互打，负者降级；胜者打 LSPL 第 2 名，赢了留下
     ② 两个第 5 名互打，胜者保级；负者打 LSPL 第 3 名，赢了留下
   LSPL 冠军直接升级 ⚠（原文没写，按惯例）。2017 夏季赛起不再降级，2018 年起 14 队联盟化。

   简化（只结算和你有关的那一支）：
   · 你的队不在升降级区 / 不在 LSPL 前三：什么都不发生，名单照真实历史走（真实历史里谁升谁降由下一年的年页决定）
   · 你的队卷进去了：系列赛按你们的真实赢面自动打完（和「本周其余几场自动打」同一口径），结果当场生效——
     降级：你的队换到 LSPL，顶上来的 LSPL 队去 LPL（两个联赛的赛程里互换名字）；升级反过来
   · 席位一旦因为你改变，之后每年换页都记着（S.seatOv），直到你离开这支队
   · 2017 年 LSPL 夏季赛前两名（你是首发）→ 2018 年拿到 LPL 联盟席位
   ============================================================ */
import { S } from "./state";
import { rnd } from "./rng";
import { playSeries } from "./fmt";
import { FMT_HOOKS, runOf, fmtSyncStandings } from "./fmtctl";
import { winProb } from "./intl";
import { pushEvent, isBenched } from "./main";

const clampP = (p: number) => Math.max(0.03, Math.min(0.97, p));
function bo5(a: string, b: string) {
  if (S.team && (a === S.team || b === S.team) && FMT_HOOKS.myP) {
    const opp = a === S.team ? b : a, q = clampP(FMT_HOOKS.myP(opp));
    return playSeries(a, b, 5, a === S.team ? q : 1 - q, rnd);
  }
  return playSeries(a, b, 5, winProb(a, b), rnd);
}
const line = (s: any) => `<b>${s.w}</b> ${s.sw}:${s.sl} ${s.l}`;

/* 两个联赛互换一支队：世界名单、赛程里的名字、你的赛区 */
function swap(up: string, down: string) {
  const w = S.world; if (!w || !w.LPL || !w.LDL) return;
  const i = w.LPL.findIndex((t: any) => t.name === down), j = w.LDL.findIndex((t: any) => t.name === up);
  if (i < 0 || j < 0) return;
  const d = w.LPL[i], u = w.LDL[j];
  w.LPL[i] = u; w.LDL[j] = d;
  (u.players || []).forEach((p: any) => { if (p) p.lg = "LPL"; });
  (d.players || []).forEach((p: any) => { if (p) p.lg = "LDL"; });
  delete u.parent; delete d.parent;
  [["LPL", down, up], ["LDL", up, down]].forEach(([lg, from, to]) => {
    const run = runOf(lg); if (!run) return;
    run.all = run.all.map(n => n === from ? to : n);
    run.prevRank = run.prevRank.map(n => n === from ? to : n);
  });
  if (S.team === down) S.homeLeague = "LDL";
  if (S.team === up) S.homeLeague = "LPL";
  try { fmtSyncStandings(); } catch (e) {}
}

/* 半年结算（endSeason 开头）调用：返回 true 表示发生了和你有关的升降级 / 席位变动 */
export function relegationCheck(split: number): boolean {
  const F = S.fmt; if (!F || !S.career || !S.team) return false;
  const y = F.y;
  const lpl = runOf("LPL"), lsp = runOf("LDL");
  if (!lpl || !lsp) return false;
  const lplOut = lpl.outs[split], lspOut = lsp.outs[split];
  if (!lplOut || !lspOut) return false;
  const HL = S.homeLeague || "LPL";

  /* 2018 联盟化：2017 年 LSPL 夏季赛前两名，你是首发 */
  if (y === 2017 && split === 1) {
    if (HL === "LDL" && lspOut.order.slice(0, 2).includes(S.team) && !isBenched()) {
      S.seatOv = { team: S.team, league: "LPL", y: 2018 };
      S.s6n = Object.assign({}, S.s6n || {}); S.s6n.rel = (S.s6n.rel || []).concat(["联盟席位"]);
      pushEvent(`<b>${S.team} 拿到 2018 年 LPL 联盟席位。</b>LSPL 夏季赛前二——明年起 LPL 实行联盟化，不再有降级，这个席位是你们打出来的。<span style="color:var(--ink-3)">真实历史里，这一年的席位名单里没有你们。</span>`, "big", "赛区");
      S.tlPop = { eyebrow: "2017 · LPL 联盟化", title: "拿到联盟席位", body: `<b>${S.team}</b> 在 LSPL 夏季赛打进前二。2018 年起 LPL 实行联盟化——你们会以正式席位加入 LPL。` };
      return true;
    }
    return false;
  }
  if (!(y === 2016 || (y === 2017 && split === 0))) return false;

  const rel: string[] = (lplOut as any).rel || [];   // [A5, B5, A6, B6]
  const [a5, b5, a6, b6] = rel;
  const lspTop = lspOut.order.slice(0, 3);            // LSPL 季后赛 1–3 名
  const mineLPL = HL === "LPL" && rel.includes(S.team);
  const mineLSP = HL === "LDL" && lspTop.includes(S.team);
  if (!mineLPL && !mineLSP) return false;
  if (rel.length < 4 || lspTop.length < 3) return false;

  const head = `${y} ${split ? "夏季" : "春季"}升降级赛`;
  const lines: string[] = [];
  // ① 两个第 6 名
  const s6 = bo5(a6, b6); lines.push(`第 6 名对决 ${line(s6)}（负者降级）`);
  const s6b = bo5(s6.w!, lspTop[1]); lines.push(`保级战 ${line(s6b)}`);
  // ② 两个第 5 名
  const s5 = bo5(a5, b5); lines.push(`第 5 名对决 ${line(s5)}（胜者保级）`);
  const s5b = bo5(s5.l!, lspTop[2]); lines.push(`保级战 ${line(s5b)}`);
  // 降级的：第 6 名对决负者（LSPL 冠军顶上）、两场保级战里输给 LSPL 的
  const moves: [string, string][] = [[lspTop[0], s6.l!]];
  if (s6b.w === lspTop[1]) moves.push([lspTop[1], s6.w!]);
  if (s5b.w === lspTop[2]) moves.push([lspTop[2], s5.l!]);
  const mine = moves.find(([u, d]) => u === S.team || d === S.team);
  pushEvent(`<b>${head}</b>（真实赛制：两组第 5、6 名对 LSPL 第 2、3 名，全 BO5）：${lines.join("；")}。`, "info", "升降级");
  if (!mine) {
    pushEvent(mineLPL ? `<b>${S.team} 保住了 LPL 席位。</b>` : `<b>${S.team} 没能升上 LPL。</b>明年再来。`, mineLPL ? "good" : "bad", "升降级");
    return true;
  }
  const [up, down] = mine;
  S.s6n = Object.assign({}, S.s6n || {}); S.s6n.rel = (S.s6n.rel || []).concat([down === S.team ? `降级${y}${split}` : `升级${y}${split}`]);
  swap(up, down);
  if (down === S.team) {
    S.seatOv = { team: S.team, league: "LDL", y };
    pushEvent(`<b>${S.team} 降级了。</b>下半年起在 LSPL 打——合同照旧，工资照发，但转会窗口里会有人来挖你。<span style="color:var(--ink-3)">真实历史里，这一年降级的不是你们。</span>`, "bad", "升降级");
    S.tlPop = { eyebrow: `${head}`, title: "降级", body: `<b>${S.team}</b> 输掉了升降级赛，席位让给 <b>${up}</b>。<br>接下来在 LSPL 打。合同照旧；想留在 LPL，就得靠转会，或者带着这支队打回来。` };
  } else {
    S.seatOv = { team: S.team, league: "LPL", y };
    pushEvent(`<b>${S.team} 升入 LPL！</b>顶掉了 <b>${down}</b>。下半年起你在 LPL 打。`, "big", "升降级");
    S.tlPop = { eyebrow: `${head}`, title: "升入 LPL", body: `<b>${S.team}</b> 赢下升降级赛，拿走了 <b>${down}</b> 的 LPL 席位。` };
  }
  return true;
}
