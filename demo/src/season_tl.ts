/* ============================================================
   真实赛制 · 赛季流程（2026-09-13，只给真实时间线新档 S.tl）
   main.ts 的 startSeason / nextWeek / benchWeek / endSeason 开头判一句 fmtOn()，走到这里。
   · 合同、工资、注册窗仍按「上半年到 MSI、下半年到世界赛」：S.split 还是 0/1（半年），
     真实赛段嵌在半年里；endSeason 只在 MSI、世界赛前各跑一次（工资、合同、注册窗照旧）。
   · 每个真实赛段打完单独结算：冠军头衔、赛段奖金（按一年有几个冠军赛段摊薄）、生涯记录。
   · First Stand 在第一个赛段之后，打完回联赛（中间没有注册窗）。
   ============================================================ */
import { S } from "./state";
import { rnd } from "./rng";
import {
  SEASONS, SPREAD, POSN, apFor, addFat, addFans, ageRecoverMul, breakthrough, btkWeekEnd, endSeason, enterBreak, fanWeek,
  isBenched, lastSeason, myRoster, power, pushEvent, rankSeasonReset, render, startMatch, koTree, brTeam, tiltDrag, versionFit
} from "./main";
import { rivalBoost } from "./rivals";
import { checkAch } from "./achieve";
import { cerStart } from "./cer";
import { injuryTick, rollInjury } from "./injury";
import { spectateIntl, findTeam } from "./intl";
import { aiMarketWindow } from "./market";
import { weeklyEcho } from "./press";
import { questWeek } from "./quest";
import { fireEvent, tickBuffs, tryRandomEvent } from "./random";
import { teamLogo } from "./rankicon";
import { addRingTitle, mateInjuryRoll, mateInjuryTick } from "./rotation";
import { archiveWeek } from "./routine";
import { saveGame, escapeHtml } from "./save";
import { addMoney, ledgerRotate, PRIZE_PO, PRIZE_PO_LDL } from "./shop";
import { clampWinProb, defendPressure, oppMatchPw } from "./squad";
import { lgName, tlRivalCheck } from "./timeline";
import { REG_WEEKS, regRollOffer } from "./tryout";
import { Series } from "./fmt";
import { Pending, SplitOut, SplitSpec, ctxOf } from "./fmtrun";
import {
  FMT_HOOKS, FMT_MAJORS, fmtHome, runOf, specOf, fmtStartYear, fmtPump, fmtRecordMine, fmtSimOthers, fmtSyncStandings,
  fmtBoundary, fmtFastForward, fmtAfterEvent, fmtQualified, fmtIntlList, fmtStageNow, fmtFirstOfHalf, fmtFormatLine, fmtBracketRounds
} from "./fmtctl";

/* ---------- 钩子：你的队自动打的那几场 ----------
   和亲自上场同一口径（main.ts gameWinP）：版本相性、宿敌、心态崩盘都算，只是没有临场节点的摆动。 */
FMT_HOOKS.myP = (opp: string) => {
  const t = findTeam(opp); if (!t) return 0.5;
  const fav = SEASONS[S.si].fav, bench = !!(S.fmt && S.fmt.benchWk);
  const my = power(myRoster(), S.fatigue || 0, fav) + (bench ? 0 : versionFit() + rivalBoost(opp) - tiltDrag());
  const op = oppMatchPw(t.players) + defendPressure(opp);
  return clampWinProb(1 / (1 + Math.exp(-(my - op) / SPREAD)), my - op);
};
FMT_HOOKS.autoMine = (p: Pending, s: Series) => {
  const F = S.fmt, won = s.w === S.team, opp = p.a === S.team ? p.b : p.a, bench = !!F.benchWk;
  const sc = won ? [s.sw, s.sl] : [s.sl, s.sw];
  if (!bench) {
    S.record = S.record || { w: 0, l: 0 }; S.record[won ? "w" : "l"]++;
    // 自动打的那场：战绩照记，个人收益打折（人气、出场费一半，体能也少扣）——亲自上场才拿全份
    addFans(won ? 3 : -1); addFat(6); addMoney("match", fmtHome() === "LDL" ? (won ? 1 : 0) : (won ? 4 : 2));
  } else addFans(-0.8);
  (F.autoLines = F.autoLines || []).push(`${S.team} ${sc[0]}:${sc[1]} ${won ? "击败" : "负于"} <b>${escapeHtml(opp)}</b>（BO${p.bo}${bench ? "，你在替补席" : "，自动打完"}）`);
};

/* ---------- 年初 / 下半年开赛 ---------- */
const ANN27 = [
  "LPL：取消登峰组与涅槃组，赛季中途不再淘汰，所有队伍打满三个赛段；第二、三赛段 5–12 名仍打骑士之路。",
  "LCK：下半年恢复第 3–5 轮（Legend / Rise 组内三循环）。",
  "LEC：取消 LEC Versus，恢复冬季赛，夏季赛恢复分组。",
  "LCS：维持 2026 赛制（LTA 已解散，回不到 2025）。"
];
function tlAnnounce(y: number) {
  if (y !== 2027 || S.fmtAnn27) return;
  S.fmtAnn27 = 1;
  pushEvent(`<b>2027 赛季赛制调整：回到 2025 年的三段制</b>。第一赛段决出 First Stand 名额，第二赛段决出 MSI 名额，第三赛段决出世界赛名额，赛季积分决定二号种子。<br>${ANN27.join("<br>")}`, "big", "赛区");
  S.tlPop = { eyebrow: "2027 · 赛制调整", title: "赛制改回 2025",
    body: `联盟宣布：2027 赛季起，赛制回到 <b>2025 年的三段制</b>。<br>${ANN27.join("<br>")}<br><span style="color:var(--ink-3)">国际赛规模沿用 2026：First Stand 8 队、MSI 11 队、世界赛 19 队。</span>` };
  S.fmtAnnNews = { pressed: false };
}

export function tlSeasonStart(first: boolean, split?: number) {
  const newYear = split === undefined || split === 0;
  S.split = split === undefined ? 0 : split;
  if (newYear && !first) rankSeasonReset();
  S.carrySplit = 0; S.benchedPO = false; S.loseStreak = 0; S.benchLock = false;
  const y = SEASONS[S.si] ? SEASONS[S.si].y : 2022;
  if (newYear || !S.fmt || S.fmt.y !== y) { fmtStartYear(); tlAnnounce(y); }
  else fmtAfterEvent("msi");
  S.week = 0; S.ap = apFor("season"); S.record = { w: 0, l: 0 }; S.step = "season"; S.tab = "act"; S.schedule = [];
  tlWeekStart();
  ledgerRotate();
  saveGame("赛季开始");
  if (S.benchedThisSplit) { S.benchedSplits = (S.benchedSplits || 0) + 1; S.benchedThisSplit = false; }
  if (S.split === 0) S.seasonAttr0 = Object.assign({}, S.attrs);
  S.buff = {};
  try { tlRivalCheck(); } catch (e) {}   // S6 开档：真实签入的同位置竞争者（保护期过了才比）
  const sea = SEASONS[S.si], n = fmtStageNow();
  if (S.split === 1 && n) pushEvent(`<b>${sea.tag} ${lgName(fmtHome())}${n.sp.name}开赛</b>。世界赛名额就看下半年。`, "big", "赛段");
  if (!first && S.split === 0) {
    S.log.push(`<div class="hi">— ${sea.tag} 赛季开始（版本：${sea.ver}）—</div>`);
    pushEvent(`<b>${sea.tag} 开赛</b>，版本主题「${sea.ver}」。本赛季 ${sea.fav.map((x: string) => POSN[x]).join("、")} 是红利位，<b>${sea.dim}</b>的权重上升。`, "big", "版本");
    fireEvent("patch", 0.5);
  }
  if (n && S.career) pushEvent(`${sea.tag} ${lgName(fmtHome())}${n.sp.name}赛制：${fmtFormatLine(n.sp)}。`, "info", "赛制");
  if (S.career && fmtHome() !== "LDL") {
    if (S.extended && S.si === lastSeason() && S.split === 0) cerStart("farewell0");
    if (S.split === 0) cerStart("patch");
    cerStart("media");
  }
  render();
}

/* 新的一周：你所在联赛先打到轮到你那一场（或者这周你没比赛） */
export function tlWeekStart() {
  const F = S.fmt; if (!F) return;
  S.week = (S.week || 0) + 1; F.wk = 0; F.cur = null; F.benchWk = false; F.yw = (F.yw || 0) + 1;
  const p = fmtPump(false);
  S.schedule = S.schedule || [];
  S.schedule[S.week - 1] = p ? (p.a === S.team ? p.b : p.a) : null;
  fmtSyncStandings();
  const n = fmtStageNow();
  if (n && n.st && n.st.kind === "po" && n.r && n.r.br && S.team && n.r.br.seeds.includes(S.team)) {
    const k = `${F.y}|${n.sp.key}|${n.st.key}`; F.poSeen = F.poSeen || {};
    if (!F.poSeen[k]) {
      F.poSeen[k] = 1;
      const seed = n.r.br.seeds.indexOf(S.team) + 1; S.playoffSeed = seed;
      if (S.career) { S.career.best = Math.min(S.career.best || 99, seed); checkAch("playoff"); }
    }
  }
}

/* 这一场打完（或这周没你的比赛）点「继续」 */
export function tlNextWeek() {
  const F = S.fmt;
  if (F.cur && S.match && S.match.done) fmtRecordMine(S.match.sc);
  S.match = null;
  const nx = fmtPump(!!F.benchWk);
  if (nx) { S.step = "match"; startMatch(); return; }
  tlEndWeek();
}
export function tlBenchWeek() {
  const F = S.fmt;
  S.benchedThisSplit = true; F.benchWk = true; F.cur = null; S.match = null;
  fmtPump(true);
  tlEndWeek();
}

export function tlEndWeek() {
  const F = S.fmt;
  if (F.autoLines && F.autoLines.length) { pushEvent(F.autoLines.join("<br>"), "info", "赛程"); F.autoLines = []; }
  fmtSimOthers();
  fmtSyncStandings();
  tlProcessQueue();
  const E = fmtBoundary();
  if (E) { fmtFastForward(E); tlProcessQueue(); tlRouteEvent(E); return; }
  if (F.newSplit) {
    F.newSplit = false;
    // 地区资格赛紧跟最后一个赛段，不算新赛段：不歇、战绩不清零
    const run = runOf(fmtHome()), ys = specOf(fmtHome()), nx = run && ys ? ys.splits[run.si] : null;
    if (!nx || nx.key !== "rf") {
      enterBreak("seg", 1, "赛段间歇", `<b>${tlNextSplitName()}</b>下周开打。赛段之间歇一周：调整状态，把该补的补上。`);
      return;
    }
  }
  tlWeekAdvance();
}
export function tlWeekAdvance() {
  S.step = "season"; S.ap = apFor("season"); addFat(-10 * ageRecoverMul());
  tlWeekStart();
  if (S.week <= REG_WEEKS && S.career && fmtFirstOfHalf()) {
    if (S.week === 3) aiMarketWindow(false);
    if (S.week >= 2) regRollOffer();
  }
  if (S.assets && S.assets.apt) addFat(-4);
  weeklyEcho(); injuryTick(); rollInjury("赛季中"); mateInjuryTick(); mateInjuryRoll();
  archiveWeek(); btkWeekEnd(); tickBuffs(); fanWeek(); questWeek();
  if (rnd() < 0.14) tryRandomEvent();
  saveGame("S" + S.si + " 第" + S.week + "周");
  render();
}
export function tlNextSplitName(): string {
  const run = runOf(fmtHome()), ys = specOf(fmtHome());
  const sp = run && ys ? ys.splits[Math.min(run.si, ys.splits.length - 1)] : null;
  return sp ? sp.name : "下一个赛段";
}

/* 赛段间歇 / First Stand 结束：开下一个赛段 */
export function tlResumeSeg() {
  fmtAfterEvent("fst");
  S.match = null; S.step = "season"; S.ap = apFor("season"); S.record = { w: 0, l: 0 }; S.week = 0; S.schedule = []; S.tab = "act";
  tlWeekStart();
  const sea = SEASONS[S.si], n = fmtStageNow();
  if (n && !n.idle) pushEvent(`<b>${sea.tag} ${lgName(fmtHome())}${n.sp.name}开赛</b>。赛制：${fmtFormatLine(n.sp)}。`, "big", "赛段");
  if (S.career && fmtHome() !== "LDL") cerStart("media");
  saveGame("赛段开始");
  render();
}

/* ---------- 赛段结算 ---------- */
function myResultOf(out: SplitOut) {
  const place = out.places[S.team];
  if (!place) return { result: null as any, seed: 99, place: 99 };
  const inPo = (out.poSeeds || []).includes(S.team);
  const result: any = out.champ === S.team ? "champion" : !inPo ? null : place === 2 ? 3 : place <= 4 ? 2 : 1;
  return { result, seed: inPo ? out.poSeeds!.indexOf(S.team) + 1 : place, place };
}
function homeChampNews(lg: string, sp: SplitSpec, out: SplitOut) {
  if (sp.title === false || !out.champ) return;
  pushEvent(`<b>${escapeHtml(out.champ)}</b> 夺得 ${SEASONS[S.si].tag} ${lgName(lg)}${sp.title || sp.name}冠军。`, "big", "联赛");
}
function mySplitEnd(lg: string, sp: SplitSpec, out: SplitOut, splits: SplitSpec[]) {
  const sea = SEASONS[S.si], F = S.fmt;
  /* 地区资格赛（附属赛段）：不是一个联赛赛段，只报世界赛名额；名次、生涯记录、赛段结果都不动 */
  if (out.aux) {
    const i = (out.intl || []).indexOf(S.team);
    if (i >= 0) pushEvent(`${sp.name}结束：${S.team} 拿到<b>世界赛 ${i + 1} 号种子</b>。`, "good", "赛段");
    else if (out.places[S.team]) pushEvent(`${sp.name}结束：${S.team} 没能拿到世界赛名额。`, "bad", "赛段");
    return;
  }
  const { result, seed, place } = myResultOf(out);
  F.lastMine = { result, seed };
  if (sp.title !== false) S.career.best = Math.min(S.career.best || 99, place);
  S.career.log = (S.career.log || []).concat([{ si: S.si, split: S.split || 0, seg: sp.key, sname: sp.short, team: S.team, lg, seed: place, result, w: (S.record || {}).w || 0, l: (S.record || {}).l || 0 }]);
  const titled = sp.title !== false;
  // 卫冕压力的折算系数（2026-09-14）：这一年出冠军的赛段超过两个，每座联赛冠军按 2/n 算（三段制 = 2/3）
  const foldW = 2 / Math.max(2, splits.filter(s => s.title !== false).length);
  if (titled) {
    // 奖金：一年里有冠军的赛段变多了，每段按比例摊薄——全年奖金量和两段制持平
    const nT = splits.filter(s => s.title !== false).length, mul = 2 / Math.max(2, nT);
    const tbl = lg === "LDL" ? PRIZE_PO_LDL : PRIZE_PO;
    const base = result === "champion" ? tbl.champion : result === 3 ? tbl.runner : result === 2 ? tbl.semi : 0;
    const amt = Math.round(base * mul);
    if (amt) { addMoney("prize", amt); pushEvent(`${sp.name}奖金到账 <b>${amt} 万</b>。`, "good", "奖金"); }
  }
  const title = `${sea.tag} ${lgName(lg)}${sp.title || sp.name}`;
  if (titled && result === "champion") {
    if (isBenched()) {
      addRingTitle(title);
      pushEvent(`<b>${S.team} 夺得 ${title}冠军。</b>你在替补席见证了整个过程——<span style="color:var(--ink-3)">生涯表记为<b>随队冠军</b>。</span>`, "big", "联赛冠军");
    } else {
      S.career.titles.push(title);
      S.career.defW = Object.assign({}, S.career.defW || {}, { [title]: foldW });
      S.career.leagueTitles = (S.career.leagueTitles || 0) + 1;
      S.career.lgYears = (S.career.lgYears || []).concat([S.si]);
      S.career.lgStreak = (S.career.lgStreak || 0) + 1;
      checkAch("lgtitle"); checkAch("crown");
      fireEvent("afterchamp", 0.7);
      breakthrough("心态", 2.0, "捧过一次奖杯之后，大场面对你来说不一样了。", "lgtitle", "mile");
      const next = sp.after && fmtIntlList(lg, sp.after).includes(S.team)
        ? (sp.after === "fst" ? "下一站 First Stand。" : sp.after === "msi" ? "下一站 MSI。" : "世界赛资格到手。") : "";
      pushEvent(`<b>${S.team} 夺得 ${title}冠军。</b>${next}`, "big", "联赛冠军");
    }
  } else {
    if (titled) S.career.lgStreak = 0;
    homeChampNews(lg, sp, out);
    const how = result === 3 ? "决赛惜败" : result === 2 ? "止步四强" : result === 1 ? "季后赛出局" : `排第 ${place} 名，没进季后赛`;
    pushEvent(`${sp.name}收官：${S.team} ${how}。`, result ? "info" : "bad", "赛段");
  }
  if ((out.outSeason || []).includes(S.team))
    pushEvent(`<b>${S.team} 这一年剩下的联赛没有比赛了</b>——涅槃组垫底，按赛制提前结束全年。接下来的几个赛段，时间是你自己的。`, "bad", "赛段");
  // 赛段战绩在下一个赛段开打时才清零：MSI / 世界赛前的半年结算（赛季结算卡、状态重摇）读的是最后这个赛段的战绩
}
export function tlProcessQueue() {
  const F = S.fmt; if (!F || !F.queue || !F.queue.length) return;
  F.queue.splice(0).forEach((q: { lg: string; si: number }) => {
    const run = runOf(q.lg), ys = specOf(q.lg); if (!run || !ys) return;
    const sp = ys.splits[q.si], out = run.outs[q.si]; if (!sp || !out) return;
    if (q.lg === fmtHome()) { if (S.team && S.career) mySplitEnd(q.lg, sp, out, ys.splits); else homeChampNews(q.lg, sp, out); }
    else if (FMT_MAJORS.includes(q.lg) && sp.title !== false && out.champ)
      S.news = (S.news || []).concat([`<div>${SEASONS[S.si].tag} ${lgName(q.lg)} ${sp.name}：<b>${escapeHtml(out.champ)}</b> 夺冠。</div>`]);
  });
}

/* ---------- 国际赛边界 ---------- */
export function tlRouteEvent(E: string) {
  const F = S.fmt, lr = F.lastMine || { result: null, seed: 99 };
  if (E === "fst") {
    if (S.career && fmtHome() !== "LDL" && fmtQualified("fst")) {
      S.pendingIntl = { type: "fst", result: lr.result };
      enterBreak("intl", 1, "出征 First Stand 前 · 集结", `<b>First Stand 的名额到手了。</b>出发前还有一周——把状态调到最好。`);
      return;
    }
    spectateIntl("fst");
    return;
  }
  F.lastMine = null;
  endSeason(lr.result, lr.seed);
}

/* ---------- 界面 ---------- */
export function tlStageHead(): string {
  const n = fmtStageNow(); if (!n) return "";
  return `${n.sp.name} · ${n.st ? n.st.name : "已结束"}`;
}
export function tlPlayLabel(benched: boolean, opp: string | null): string {
  const n = fmtStageNow(), c = S.fmt && S.fmt.cur, stage = n && n.st ? n.st.name : "";
  if (benched) return `替补席观战 · ${stage || "本周"} →`;
  if (!c || !opp) return n && n.idle ? `这个赛段你们打完了 · 推进一周 →` : `这一轮没有你们的比赛 · 推进一周 →`;
  return `打 ${stage} · vs ${opp}（BO${c.bo}）→`;
}
/* 本周你们一共几场（循环赛能数出来；淘汰赛要看上一场的结果） */
export function tlWeekCount(): number {
  const n = fmtStageNow(); if (!n || !n.r || !S.team) return 0;
  const r = n.r; if (r.type === "br") return S.fmt.cur ? 1 : 0;
  const start = r.doneR - (r.doneR % r.perWeek), end = Math.min(r.rounds, start + r.perWeek);
  let k = 0; for (let i = start; i < end; i++) (r.sched[i] || []).forEach(p => { if (p.a === S.team || p.b === S.team) k++; });
  return k;
}
export function tlWeekNote(): string {
  const k = tlWeekCount(), c = S.fmt && S.fmt.cur;
  if (!c) return "";
  return `<p class="note">这一周你们${k > 1 ? `一共 <b>${k} 场</b>：第一场你亲自打，其余默认自动打完（战绩照记，个人收益打折）。` : "有一场比赛。"}
    <label style="margin-left:6px"><input type="checkbox" id="fmtman" ${S.fmtManual ? "checked" : ""}> 每场都亲自打</label></p>`;
}
export function tlNoMatchCard(): string {
  const n = fmtStageNow(); if (!n) return "";
  const r = S.standings && S.standings[fmtHome()] && S.standings[fmtHome()][S.team];
  return `<div class="card"><h2>本周<em>${SEASONS[S.si].tag} ${escapeHtml(tlStageHead())}</em></h2>
    <p class="note" style="margin:0">${n.idle ? `这个赛段你们的比赛打完了，别的队还在打。` : `这一轮没有你们的比赛（轮空或在等上一轮的结果）。`}${r ? `本赛段战绩 <b>${r.w}−${r.l}</b>。` : ""}</p></div>`;
}
export function tlStandingsCard(): string {
  const n = fmtStageNow(); if (!n) return "";
  let r = n.r && n.r.type !== "br" ? n.r : null, st = r ? n.st : null;
  if (!r && !n.idle) for (let i = n.run.stage - 1; i >= 0; i--) { const x = n.run.runs[i]; if (x && x.type !== "br") { r = x; st = n.sp.stages[i]; break; } }
  const c = ctxOf(n.run, n.ys);
  const tables = r && st ? r.groups.map(g => {
    const rows = c.rows(st!.key, r!.groups.length > 1 ? g.name : undefined);
    return `<div class="tw"><table><thead><tr><th>#</th><th>${escapeHtml(g.name || "战队")}</th><th>战绩</th><th>小分</th></tr></thead><tbody>${rows.map((x, i) =>
      `<tr class="${x.team === S.team ? "me" : ""}"><td class="n">${i + 1}</td><td>${teamLogo(x.team, 18)}${escapeHtml(x.team)}${x.team === S.team ? '<span class="tag">你</span>' : ""}</td><td class="n">${x.w}−${x.l}</td><td class="n">${x.gw}−${x.gl}</td></tr>`).join("")}</tbody></table></div>`;
  }).join("") : "";
  const done = (n.run.outs || []).filter(o => o && o.champ && !o.aux && (n.ys.splits.find(s => s.key === o.key) || {} as any).title !== false)
    .map(o => `${escapeHtml(o.name)} <b>${escapeHtml(o.champ!)}</b>`).join(" · ");
  return `<div class="card"><h2>${lgName(n.lg)} · ${escapeHtml(n.sp.name)}<em>${st ? escapeHtml(st.name) : "淘汰赛 / 已结束"} · 第 ${S.week} 周</em></h2>
    ${tables || `<p class="note">这个阶段没有积分榜${n.r && n.r.br ? "，看对阵树" : ""}。</p>`}
    <p class="note">赛制：${fmtFormatLine(n.sp)}${done ? `<br>今年已决出：${done}` : ""}${(n.run.outSeason || []).length ? `<br>全年淘汰：${n.run.outSeason.map(escapeHtml).join("、")}` : ""}</p></div>`;
}
export function tlBracketCard(): string {
  if (!S.career || !S.team) return "";
  const n = fmtStageNow(); if (!n || !n.r || !n.r.br || !n.st) return "";
  const rounds = fmtBracketRounds(n.r), last = rounds[rounds.length - 1];
  const champ = last && last.final ? last.winners[0] : null;
  const cur = S.fmt.cur, opp = cur ? (cur.a === S.team ? cur.b : cur.a) : null;
  const seedCol = `<div class="bcol"><div class="bh">种子</div>${n.r.br.seeds.map((t, i) => `<div class="bm seed ${t === S.team ? "now" : ""}">${brTeam(t)}<span class="bsd">#${i + 1}</span></div>`).join("")}</div>`;
  return `<div class="card"><h2>${escapeHtml(n.sp.name)} · ${escapeHtml(n.st.name)}<em>对阵树</em></h2>
    <div class="brk-tree">${seedCol}${koTree(rounds, champ).replace('<div class="brk-tree">', "").replace(/<\/div>$/, "")}</div>
    <p class="note">${champ ? `冠军 <b>${escapeHtml(champ)}</b>。` : opp ? `下一场 vs <b>${escapeHtml(opp)}</b>（BO${cur.bo}）。` : ""}亮字是赢了的队、划掉的是被淘汰的，晨光橙框是你。</p></div>`;
}
