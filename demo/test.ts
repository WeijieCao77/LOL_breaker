/* 无头测试：直接 import demo/src 里的引擎模块，在 Node 里跑完整生涯。
     npm test                 # 随机种子，打印出来
     SEED=123 npm test        # 原样重放
   原来是把 career.html 里的 <script> 抽出来 new Function 跑；现在源码就是 ES 模块，直接 import。 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* 随机数固定种子：SEED 环境变量给了就用它，没给就用时间戳并打印出来——
   回归跑挂了拿这个种子能原样重放。mulberry32 够用。游戏自己的随机数走 S.seed（rng.ts），
   这里只管建档时的天赋分配等零星 Math.random。 */
const SEED = process.env.SEED ? (parseInt(process.env.SEED, 10) >>> 0) : (Date.now() >>> 0);
(function (seed) {
  let a = seed >>> 0;
  Math.random = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(SEED);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const g: any = globalThis;

/* 没有 DOM 桩了：引擎模块在没有 document 的环境里也能整局跑完——
   render() 把视图文案算出来就到头，写 DOM 和绑事件只在浏览器里做（见 main.ts 的 render / hud / pinbar）。
   界面本身的测试在 test-ui.ts（jsdom 里装载构建产物）。 */
/* localStorage 桩——存档模块全程被 try/catch 包着，没有桩的话它会静默失败，等于没测。 */
const _ls: Record<string, string> = {};
g.localStorage = {
  getItem(k: string) { return k in _ls ? _ls[k] : null; },
  setItem(k: string, v: string) { _ls[k] = String(v); },
  removeItem(k: string) { delete _ls[k]; }
};
g.alert = () => {};

/* 头像表由 bundle.mjs 生成；没跑过构建时先放一个空表 */
if (!fs.existsSync(path.join(HERE, "src", "gen", "avatars.js"))) {
  fs.mkdirSync(path.join(HERE, "src", "gen"), { recursive: true });
  fs.writeFileSync(path.join(HERE, "src", "gen", "avatars.js"), 'export const AVATARS_JSON = "{}";\n');
}

/* 把所有模块的导出合成一个 API 对象（原来 __api 那张手写名单）。
   顺序载入，不再 Promise.all：achieve ↔ achieve_more 之间隔着 team 有一个循环引用
   （achieve → achieve_more → team → achieve），并行载入时谁先被求值看文件系统的脸色——
   赶上 achieve_more 先求值那一次，achieve 的模块体会在 ACH_MORE 还没初始化时执行
   `ACHIEVEMENTS.push(...ACH_MORE)`，抛 "Cannot access 'ACH_MORE' before initialization"。
   低概率、和这次的改动无关（改前改后各连跑 12 次都没复现，但两边都各撞见过一次），
   顺序载入让求值顺序固定下来，CI 不再看运气。循环引用本身还在，另开一条待办。 */
const MODULES = ["state", "data", "main", "intl", "team", "rivals", "rankart", "rankicon", "avatar", "shop", "origins", "achieve", "achieve_more", "squad", "random", "form", "postmatch", "boxscore", "injury", "rotation", "clout", "routine", "auto", "quest", "trait", "nodes", "cup", "save", "tryout", "press", "audio", "stats", "stars", "market", "cer"];
const state = await import("./src/state.ts");
const mods = [];
for (const m of MODULES) mods.push(await import(`./src/${m}.ts`));
const A: any = Object.assign({}, ...mods, { S: () => state.S, setS: state.setS });
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/* ---------------- 跑一局完整生涯 ---------------- */
function playOne(opts?) {
  opts = opts || {};
  A.screenCreate(typeof opts.seed === "number" ? opts.seed : undefined);   // 指定这一局的随机种子（rng.ts），出身卡也按它抽
  let S = A.S();
  S.name = "T"; S.pos = opts.pos || "mid"; S.origin = opts.origin || "academy";
  S.ageIdx = opts.ageIdx === undefined ? 1 : opts.ageIdx;
  S.bgPick = S.bgOffer[0].k;
  S.talent = Object.assign({}, opts.talent || (opts.strong ? { 操作: 8, 运营: 6, 心态: 3, 指挥: 2, 体质: 1 } : { 操作: 7, 运营: 5, 心态: 4, 指挥: 2, 体质: 2 }));
  A.startPre();
  S = A.S();
  // --strong：模拟一个把加点和训练都用对了的强玩家（起步属性 +8、封顶不超），量「强玩家眼里的难度」
  if (opts.strong) A.DIMS.forEach((d: string) => { S.attrs[d] = Math.min(A.capOf(d), S.attrs[d] + 8); });

  let guard = 0, preYears = 0, rankUps = 0, lockers = 0;
  let lastPreWeek = 1, signAt = 0, signRank = 0, signFans = 0;   // 第一次签约：职业前累计第几周、当时段位读数与粉丝
  let w1: any = null, y1Inv = 0, y1Try = 0, y1Pass = 0;   // 第一年开窗那周的快照、第一年收到几次邀请 / 试训几次 / 过几次
  const worldsSeen = new Set<number>(), msiSeen = new Set<number>();   // 进过世界赛 / MSI 的赛季（含随队）
  let firstSi = -1;   // 第一份合同在哪个赛季签的
  const intlLog: any[] = [];   // 诊断「打 T1 第五局必输」：国际赛每场开打时的疲劳与首局赢面、打到第五局时的赢面与结果
  const tierYears: Record<string, number> = {};   // 每个赛季结算时所在俱乐部的档次
  let signups = 0, cupMatches = 0, preps = 0, cupPick = 0;
  let invites = 0, tryPick = 0, dealPick = 0, transfers = 0, renewTalks = 0;
  let maxRank = 0, scrims = 0, trials = 0, trialWins = 0, mateInj = 0, benchWeeks = 0, _trialOn = false, _injOn = false;
  const cupRuns = [], grades = [], deals = [];
  while (A.S().step !== "end" && guard++ < 40000) {
    S = A.S();
    // 仪式与小游戏：机器人一律按跳过（银档）走，和托管同一条路；不走 render，不碰种子。
    // 不 continue：仪式只是压在界面上的一层，结掉之后这一步该做什么照做——
    // 否则统计口（w1 / signAt / intlVs）会晚一拍取样，批测数字就漂了（2026-09-08 抓到的）。
    while (S.cer) A.cerApply(S.cer.k, "silver", true);
    if (S.step === "pre" && S.pre) lastPreWeek = S.pre.week;
    if (S.intl && S.intl.type === "worlds") worldsSeen.add(S.si);
    if (S.intl && S.intl.type === "msi") msiSeen.add(S.si);
    if (S.step === "offseason" && !S.off && S.career && S.contract) { const k = S.contract.clubTier || S.contract.tier || "?"; tierYears[S.si + ":" + k] = 1; }
    if (S.step === "pre" && S.pre && preYears === 0 && !w1 && S.pre.week >= A.WND_OPEN) {
      const av = A.DIMS.reduce((a: number, d: string) => a + S.attrs[d], 0) / A.DIMS.length;
      w1 = { rank: Math.round(S.pre.rank * 10) / 10, fans: Math.round(S.fans), score: Math.round(A.preScore()), attrs: Math.round(av * 10) / 10, fat: Math.round(S.fatigue) };
    }
    if (!signAt && S.career) { signAt = preYears * A.PRE_YEAR + lastPreWeek; signRank = Math.round(((S.pre && S.pre.rank) || 0) * 10) / 10; signFans = Math.round(S.fans || 0); firstSi = S.si; }
    if (opts.hook) opts.hook(S, A, guard);   // 场景测试用：每步先给外部一次改状态的机会
    if (S.scrim && S.scrim.trial) { if (!_trialOn) trials++; _trialOn = true; }
    else { if (_trialOn && S.promoted && !S.understudy) trialWins++; _trialOn = false; }
    if (S.mateInjury) { if (!_injOn) mateInj++; _injOn = true; } else _injOn = false;
    if (S.rankUp) { rankUps++; S.rankUp = null; continue; }
    if (S.rndEv) { A.resolveRandom(0); continue; }
    if (S.streamOffer) {                  // 平台独家：三条路轮着走，都要测到
      const pick = guard % 3;
      if (pick === 0) A.declineStreamDeal();
      else if (pick === 1) A.signStreamDeal("club");
      else A.signStreamDeal("rival");
      continue;
    }
    if (S.signup) {                       // 报名弹窗：钱够就报
      const mm = S.signup; S.signup = null;
      if (S.money >= mm.fee) { S.money -= mm.fee; A.enterCup(mm.signup); signups++; }
      continue;   // 报名现在发生在这一周的开头，答完不推进周数
    }
    if (S.cupResult) { cupRuns.push(S.cupResult); S.cupResult = null; continue; }
    if (S.cupMatch) {                     // 一轮杯赛：节点决策 + 三局两胜
      const cm = S.cupMatch;
      if (cm.node) { A.resolveCupNode(cupPick++ % cm.node.a.length); }
      else if (cm.done) { A.cupDismissMatch(); }
      else { throw new Error("杯赛卡住：既没有节点也没结束"); }
      continue;
    }
    if (S.locker) { lockers++; A.resolveLocker(0); continue; }
    // ---- 试训链路：邀请 → 四天评估 → 谈判 → 签字 ----
    if (S.pre && S.pre.invite && S.pre.invite.pending) {
      const iv = S.pre.invite; iv.pending = false;
      // 模拟一个会权衡的玩家：业余赛季还没打完时，不为了一份青训合同
      // 就把整年的比赛机会扔掉——反正拒了后面还会有别的队来。
      // （机器人如果一律接受，测出来的就永远是「最贪」那条路。）
      if (iv.tier === "acad" && S.pre.week < 15) continue;
      invites++; if (preYears === 0 && !signAt) y1Inv++;
      A.startTryout(iv.tier, iv.team, iv.expect);   // 来了就去，测试要覆盖到
      continue;
    }
    if (S.tryout) {
      const t = S.tryout;
      if (t.done) { grades.push(t.result.g); if (preYears === 0 && !signAt) { y1Try++; if (/[AB]/.test(String(t.result.g))) y1Pass++; } A.afterTryout(); }
      else A.resolveTryoutDay(tryPick++ % 3);       // 轮着选，覆盖三种选项
      continue;
    }
    // 升队调令：界面上玩家必须表态才开赛；机器人按默认「接受」——
    // 和旧版无声升队的数值完全一致（提案就是原来那套 ×2.4），基线可比
    if (S.promoteDeal) { A.acceptPromote(); continue; }
    if (S.deal) {
      const d = S.deal;
      if (d.dead) { A.dropDeal(); continue; }
      // 还一次价再签——要测到谈判分支
      if (d.asks < 1) { A.askDeal(A.DEAL_ASKS[dealPick++ % A.DEAL_ASKS.length].k); continue; }
      deals.push({ salary:d.salary, sign:d.sign, years:d.years, buyout:d.buyout, grade:d.grade });
      // 转会合同必须走 signTransfer——界面上就是这么分派的
      // （career_template.html：(S.deal&&S.deal.transfer) ? signTransfer() : signDeal()）。
      // 这里原来无条件调 signDeal，把下面 offseason 分支里那句正确的分派整个遮蔽了，
      // 于是机器人从来没换过赛区：实测 30 局发出 136 次外赛区报价，0 局在外赛区结束。
      // 那是这个测试脚本的 bug，不是游戏的 bug。
      if (d.renew) A.signRenewDeal(); else if (d.transfer) A.signTransfer(); else A.signDeal();
      continue;
    }
    if (S.step === "pre") {
      // 本周有到点的杯赛就先打——这是新赛程流程的主路径
      const due = A.activeCups().find(c => c.nextWeek <= S.pre.week);
      if (due) { cupMatches++; A.startCupMatch(due.kind); continue; }
      if (S.pre.ap > 0) {
        // 备战改成真的练队：赛前两周做战队行动（默契/战术直接乘进赛事战力）
        const _b = S.pre.ap;
        const soon = A.activeCups().find(c => c.nextWeek - S.pre.week <= 2);
        if (soon && S.fatigue < 70 && S.pre.mates && S.pre.mates.length) {
          preps++; A.doSquad(["scrim", "vod", "drill", "duo"][preps % 4]);
        }
        else if (S.fatigue > 75) A.preAct("rest");
        else A.preAct(S.pre.week % Math.max(2, Math.round(A.PRE_YEAR / 5)) === 0 ? "stream" : "rank");   // 每年约五分之一的周开播（跟年长走，20 周时是每 4 周一次）
        // 异化点数后剩 1 点付不起 2 点行动：落到 1 点的排位，别空转
        if (S.pre.ap === _b) A.preAct("rank");
        if (S.pre.ap === _b) S.pre.ap = 0;
        if (S.pre.rank > maxRank) maxRank = S.pre.rank;
      } else { const w = S.pre.week; A.preNextWeek(); if (A.S().pre && A.S().pre.week < w) preYears++; }
    } else if (S.step === "offer") {
      // 年末报价现在也只是试训机会
      const idx = S.pre.offers.findIndex(o => !o.used);
      if (idx < 0) { S.step = "pre"; A.preNextYear(); continue; }   // 都试过了，再练一年
      const of = S.pre.offers[idx];
      const tier = { sub:"top", foreign:"top", start:"mid", core:"low" }[of.k] || "mid";
      A.startTryout(tier, of.team, A.CLUB_TIERS[tier].expect);
    } else if (S.step === "season") {
      if (S.proOffer && !opts.noOffers) { transfers++; A.takeProOffer(); continue; }   // 赛段注册期的问询也接（测赛程重排）
      for (const x of A.SPEND) if (S.money >= x.cost && !(S.buff && S.buff[x.k])) { S.money -= x.cost; x.run(); break; }
      // 替补：有点数就先打一场训练赛对位（跑通对位挑战与试用链路）
      if (!S.promoted && S.understudy && A.scrimCanStart().ok) {
        A.startScrim(); scrims++;
        let g = 0; while (S.scrim && S.scrim.live && !S.scrim.live.done && g++ < 8) A.scrimPick(0);
        if (S.scrim) S.scrim.live = null;
      }
      if (S.pre && typeof S.pre.rank === "number" && S.pre.rank > maxRank) maxRank = S.pre.rank;
      if (S.ap > 0) {
        const _b = S.ap;
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 70) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("stream");
        if (S.ap === _b) A.doAction("solo");   // 剩 1 点：打排位收尾
        if (S.ap === _b) S.ap = 0;
      } else {
        if (A.isBenched()) { benchWeeks++; A.benchWeek(); } else A.startMatch(false);
      }
    } else if (S.step === "prep") {
      // 淘汰赛之间的备战：把行动点用掉再上场
      if (S.ap > 0) {
        const _b = S.ap;
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 55) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("solo");
        if (S.ap === _b) A.doAction("solo");
        if (S.ap === _b) S.ap = 0;
      } else A.prepGo();
    } else if (S.step === "match") {
      if (S.intl && S.match && !S.match.done && !(S.match.gameLog || []).length && !S.match._logged) {
        S.match._logged = true;
        try { intlLog.push({ si: S.si, opp: S.match.oppName, lck: !!(S.world.LCK || []).some((t: any) => t.name === S.match.oppName), fat: Math.round(S.fatigue), p1: Math.round(A.gameWinP(S.match.swing) * 100), need: S.match.need }); } catch (e) {}
      }
      if (S.intl && S.match && S.match.need === 3 && S.match.sc[0] === 2 && S.match.sc[1] === 2 && !S.match._g5) {
        S.match._g5 = true;
        const row = intlLog[intlLog.length - 1]; if (row && row.opp === S.match.oppName) { row.g5 = true; row.p5 = Math.round(A.gameWinP(S.match.swing) * 100); }
      }
      if (S.match.node) A.resolveNode(1);
      else if (S.match.done) {
        const row = intlLog[intlLog.length - 1];
        if (row && row.opp === S.match.oppName && row.win === undefined) { row.win = S.match.sc[0] > S.match.sc[1]; if (row.g5) row.g5win = row.win; }
        A.nextWeek();
      }
      else A.playGame();
    } else if (S.step === "offseason") {
      // 休赛期现在是可玩的几周：先把结算页点掉，再把每周的行动点用完
      if (!S.off) { if (opts.encore && S.si === A.BASE_LAST && !S.extended) A.encore(); else A.doOffseason(); continue; }
      // 合同到期续约：测试里默认接受（留在想留你的队）；opts.declineRenew 走「拒绝进市场」
      // 只在转会窗真的开着时才处理续约——界面上那张卡就是这么出现的。
      // 原来不看窗口，机器人在世界赛那一段就把字签了，于是「季中窗只有一周」
      // 和「托管抢在玩家看到之前代签」这类 bug 批测里永远抓不到（2026-09-08）。
      if (S.pendingRenew && !S.deal && A.txWindowOpen()) {
        if (opts.declineRenew) A.declineRenew();
        else if (opts.negotiateRenew) { renewTalks++; A.renewNegotiate(); }   // 谈一轮再签（覆盖谈判/谈崩两条路）
        else A.acceptRenew();
        continue;
      }
      // 自由身桌上的邀请：先谈第一家（opts.noOffers 一律回绝）
      if (S.faOffers && S.faOffers.length && !S.proOffer && !S.tryout && !S.deal) { if (opts.noOffers) A.dropFaOffer(0); else { transfers++; A.takeFaOffer(0); } continue; }
      // 有队来挖：表现好就走人（测试里一律接受，用来量频率）；opts.noOffers 一律回绝（逼出自由身没人签）
      if (S.proOffer) {
        const champ = ((S.career && S.career.worldsYears) || []).some((y: number) => y >= S.si - 1) || ((S.career && S.career.msiYears) || []).some((y: number) => y >= S.si - 1);
        if (opts.noOffers || (opts.loyal && champ)) { A.dropProOffer(); } else { transfers++; A.takeProOffer(); } continue; }
      if (S.tryout) { const t=S.tryout; if(t.done) A.afterTryout(); else A.resolveTryoutDay(1); continue; }
      if (S.deal) { if(S.deal.transfer) A.signTransfer(); else A.signDeal(); continue; }
      if (S.ap > 0) {
        const _b = S.ap;
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 70) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("solo");
        if (S.ap === _b) A.doAction("solo");
        if (S.ap === _b) S.ap = 0;
      } else A.offNextWeek();
    }
  }
  S = A.S();
  return {
    ok: S.step === "end", steps: guard, preYears, rankUps, lockers, signAt, signRank, signFans, w1, y1Inv, y1Try, y1Pass,
    si: S.si, extended: !!S.extended,
    worlds: (S.career && S.career.worlds) || 0, msi: (S.career && S.career.msi) || 0, lg: (S.career && S.career.leagueTitles) || 0,
    worldsApps: worldsSeen.size, msiApps: msiSeen.size, bestIntl: (S.career && S.career.bestIntl) || 0, bestRank: (S.career && S.career.best) || 99,
    worldsYears: (S.career && S.career.worldsYears) || [], msiYears: (S.career && S.career.msiYears) || [], firstSi: firstSi,
    intlLog,
    tiers: Object.keys(tierYears).map(k => k.split(":")[1]),
    attrsAvg: +(A.DIMS.reduce((a: number, d: string) => a + S.attrs[d], 0) / A.DIMS.length).toFixed(1),
    dims: Object.fromEntries(A.DIMS.map((d: string) => [d, [Math.round(S.attrs[d] * 10) / 10, Math.round(A.capOf(d) * 10) / 10]])),   // 每维 [现值, 上限]
    teamGap: (() => { try { const all: number[] = []; let mine = 0, lgBest = 0, lgRank = 0; const hl = S.homeLeague || "LPL";
      Object.keys(S.world || {}).forEach(lg => (S.world[lg] || []).forEach((t: any) => { const p = A.power(t, 0, A.SEASONS[Math.min(S.si, A.SEASONS.length - 1)].fav); all.push(p); if (t.name === S.team) mine = p; if (lg === hl && p > lgBest) lgBest = p; }));
      all.sort((a, b) => b - a); const wr = mine ? all.indexOf(mine) + 1 : 0; const lgAll = (S.world[hl] || []).map((t: any) => A.power(t, 0, A.SEASONS[Math.min(S.si, A.SEASONS.length - 1)].fav)).sort((a: number, b: number) => b - a); lgRank = mine ? lgAll.indexOf(mine) + 1 : 0;
      return { mine: +mine.toFixed(1), worldRank: wr, lgRank, top1: +all[0].toFixed(1), top8: +all[7].toFixed(1) }; } catch (e) { return null; } })(),
    streak: A.worldsStreakBest ? A.worldsStreakBest() : 0,
    signups, cupMatches, preps, cupRuns,
    invites, grades, deals, transfers,
    scrims, trials, trialWins, mateInj, benchWeeks, maxRank: Math.round(maxRank*10)/10,
    scrimWins: (S.scrim && S.scrim.wins) || 0,
    contract: S.contract && S.contract.salary !== undefined ? S.contract : null,
    saved: A.hasSave(),
    team: S.team || "未签约", age: S.age,
    ach: A.ACHIEVEMENTS.filter(a => A.hasAch(a.id)).map(a => a.n),
    ending: A.ending().n,
    money: Math.round(S.money), fame: A.fanTier(),
    fans: Math.round(S.fans), heat: Math.round(S.heat||0),
    titles: (S.career && S.career.titles) || [],
    streets: S.streets || 0, everCut: !!S.everCut, renewTalks,
    poBracket: !!(S.lastPo && S.lastPo.br),
    events: (S.events || []).length
  };
}

/* 不碰 DOM 的几何与消毒：导览说明卡永远不能盖在聚光框上；导入的存档只能带几个排版标签 */
function unitChecks() {
  const bad = [];
  const overlap = (h, c, ch, cw, vw) => {
    const cl = c.left === null ? 10 : c.left, cr = c.left === null ? vw - 10 : c.left + cw;
    return !(c.top >= h.top + h.height || c.top + ch <= h.top || cl >= h.left + h.width || cr <= h.left);
  };
  // 目标高过一屏（行动区）、目标贴底（底栏）、目标在上半屏：手机与桌面各量一遍
  [[320, 568, 300, 209], [375, 812, 355, 244], [390, 844, 370, 180], [1280, 720, 380, 220], [1024, 600, 380, 300]].forEach(([vw, vh, cw, ch]) => {
    const mobile = vw <= 560;
    [{ left: 0, top: 39, right: vw, bottom: vh }, { left: 0, top: vh - 52, right: vw, bottom: vh }, { left: 12, top: 80, right: vw - 12, bottom: 200 }, { left: 0, top: 0, right: vw, bottom: vh }].forEach(r => {
      const L = A.tourLayout(r, vw, vh, cw, ch, mobile);
      if (!(L.card.top >= 10 && L.card.top + ch <= vh - 10 + 1)) bad.push(`导览说明卡出屏 ${vw}×${vh} r=${r.top}-${r.bottom} top=${L.card.top}`);
      if (L.hole.height < 12) bad.push(`导览聚光框裁没了 ${vw}×${vh} r=${r.top}-${r.bottom}`);
      if (overlap(L.hole, L.card, ch, cw, vw)) bad.push(`导览说明卡压住聚光框 ${vw}×${vh} r=${r.top}-${r.bottom} hole=${L.hole.top}+${L.hole.height} card=${L.card.top}`);
    });
  });
  // 三套配色（theme.css）：浅色 / 米色里正文三档、金、青、红、橙和七个域色在面板和地面上都得 ≥ 4.5:1；
  // 深色只查三档墨色（红在深色面板上本来就只有 3.3，是历史问题，不在这次范围里）。改 token 时这里先炸。
  try {
    const css = fs.readFileSync(path.join(HERE, "theme.css"), "utf8");
    const block = (sel: string) => { const i = css.indexOf(sel + "{"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
    const toks = (b: string) => { const m: Record<string, string> = {}; b.replace(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g, (_: string, k: string, v: string) => { m[k] = v; return ""; }); return m; };
    const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const root = toks(block(":root"));
    const ALL = ["ink", "ink-2", "ink-3", "gold", "gold-hi", "cyan", "red", "dawn", "z-act", "z-me", "z-team", "z-world", "z-money", "z-rec", "z-auto"];
    for (const [name, sel, keys] of [["深色", ":root", ["ink", "ink-2", "ink-3"]], ["浅色", '[data-theme="light"]', ALL], ["米色", '[data-theme="cream"]', ALL]] as [string, string, string[]][]) {
      const t = { ...root, ...toks(block(sel)) };
      if (!t.panel || !t.void) { bad.push("配色块 " + name + " 缺 --panel / --void"); continue; }
      for (const k of keys) for (const bg of ["panel", "void"]) { const r = cr(t[k], t[bg]); if (!(r >= 4.5)) bad.push(`${name} --${k} ${t[k]} 在 --${bg} ${t[bg]} 上只有 ${r.toFixed(2)}:1`); }
    }
  } catch (e) { bad.push("配色对比度自检没跑起来：" + e); }
  const dirty = { S: { name: "x", log: ['<div class="hi">ok</div> <span style="color:var(--cyan)">c</span> <b>b</b><br>',
    '<img src=x onerror=alert(1)><a href="https://evil">link</a><div style="position:fixed;inset:0;background:#000">cover</div><span class="hi" onclick="x()">t</span><!-- c --><script>bad()</script>'] } };
  const out = A.sanitizeSave(dirty).S.log;
  if (out[0] !== '<div class="hi">ok</div> <span style="color:var(--cyan)">c</span> <b>b</b><br>') bad.push("消毒把正常标签弄坏了：" + out[0]);
  if (/<img|<a\b|href|onerror|onclick|position:fixed|<script|<!--/.test(out[1])) bad.push("消毒漏了危险标签：" + out[1]);
  if (out[1] !== 'link<div>cover</div><span class="hi">t</span>') bad.push("消毒结果和预期不同：" + out[1]);
  // 段位徽章 / 队标 / 头像是游戏自己写进战报的内嵌图，必须原样保留；外链图、javascript: 图整个去掉
  const badge = '<span class="rankbadge"><img class="rankicon" src="data:image/png;base64,iVBORw0KGgo=" width="18" height="18" alt="钻石一"><b>钻石一</b></span>';
  const img = A.sanitizeSave({ S: { log: [badge, '<img src="https://evil.example/x.png" onerror="x()"><img src="javascript:alert(1)"><img class="tlogo" src="data:image/svg+xml;base64,PHN2Zz4=">ok'] } }).S.log;
  if (img[0] !== badge) bad.push("消毒弄丢了段位徽章：" + img[0]);
  if (img[1] !== "ok") bad.push("消毒放过了外链 / 非 png 图：" + img[1]);
  // 同一个存档种子跑两局必须一模一样：所有影响结果的随机都得走 rnd()（S.rng），漏一处这里就会炸
  const pick = r => JSON.stringify({ steps: r.steps, ending: r.ending, team: r.team, money: r.money, fans: r.fans, ach: r.ach, titles: r.titles, maxRank: r.maxRank, age: r.age });
  const r1 = playOne({ seed: 4242 }), r2 = playOne({ seed: 4242 });
  if (pick(r1) !== pick(r2)) bad.push("同种子两局结果不同（有随机没走 rnd）：\n     " + pick(r1) + "\n     " + pick(r2));
  const r3 = playOne({ seed: 4243 });
  if (pick(r1) === pick(r3)) bad.push("换了种子结果还一样（种子没起作用）");
  // 再战三年：五年到了选「再打」，要能一路打到 S19 收官、结局照常出；没选的档仍然停在 S16
  const r4 = playOne({ seed: 4242, encore: true });
  if (!r4.ok) bad.push("再战三年没走到结局");
  if (r4.signAt && !r4.extended) bad.push("机器人选了再战但 S.extended 没记上");
  if (r4.signAt && r4.extended && r4.si !== A.SEASONS.length - 1) bad.push("再战后没打到 S19 就结束了：si=" + r4.si);
  if (r4.signAt && r4.steps > 4000) bad.push("再战一局的步数异常：" + r4.steps);
  if (r1.si !== A.BASE_LAST && r1.signAt) bad.push("没选再战的档没停在 S16：si=" + r1.si);
  // 仪式与小游戏（2026-09-08）：跳过 = 银档、托管跳过、效果只覆盖一段、颁奖夜算得出来、特训营一年一次；五维和天花板全程不动
  try {
    A.screenCreate(777); const S0 = A.S(); S0.name = "T"; S0.pos = "mid"; S0.origin = "academy"; S0.ageIdx = 1; S0.bgPick = S0.bgOffer[0].k;
    S0.talent = { 操作: 7, 运营: 5, 心态: 4, 指挥: 2, 体质: 2 }; A.startPre();
    const S = A.S();
    S.career = { w: 0, l: 0, titles: [], best: 99 }; S.team = S.world.LPL[0].name; S.homeLeague = "LPL"; S.promoted = true;
    const attrs0 = JSON.stringify(S.attrs), caps0 = JSON.stringify(A.DIMS.map((d: string) => A.capOf(d)));
    if (A.focusTier(24) !== "gold" || A.focusTier(30) !== "silver" || A.focusTier(36) !== "bronze") bad.push("专注档位线不对");
    if (A.rhythmTier(70) !== "gold" || A.rhythmTier(120) !== "silver" || A.rhythmTier(200) !== "bronze") bad.push("节奏档位线不对");
    A.cerStart("draw"); if (!S.cer || S.cer.k !== "draw") bad.push("抽签仪式没开场");
    if (!/抽签仪式/.test(A.cerCard())) bad.push("抽签仪式的卡没渲染");
    A.cerFinish("gold", { sec: 20 }); if (!S.cer || S.cer.tier !== "gold" || A.cerStepName() !== "result") bad.push("小游戏结算没翻到结算页");
    A.cerClose(); if (S.cer || S.poForm !== 3) bad.push("抽签金档没给季后赛状态 +3：poForm=" + S.poForm);
    const f0 = A.myForm(); S.poForm = 0; const f1 = A.myForm(); if (Math.round(f0 - f1) !== 3) bad.push("myForm 没算上 poForm：" + f0 + " vs " + f1);
    A.cerStart("draw"); A.cerSkip(); if (S.cer || S.poForm !== 0) bad.push("跳过没按银档走：poForm=" + S.poForm);
    S.auto = { career: true }; A.cerStart("draw"); if (S.cer) bad.push("托管里仪式还弹了"); if (S.poForm !== 0) bad.push("托管跳过改了状态"); S.auto = null;
    A.cerStart("depart"); if (!S.cer || S.cer.k !== "depart") bad.push("出征仪式没开场");
    A.cerNext(); A.cerNext(); A.cerNext(); if (A.cerStepName() !== "game") bad.push("出征仪式三张卡后不是小游戏：" + A.cerStepName());
    A.cerFinish("bronze", { ms: 300 }); A.cerClose();
    if (!S.cerRec || S.cerRec.mul !== 0.8) bad.push("出征铜档没记恢复倍率");
    S.off = { week: 1, weeks: 2, next: "intl" }; S.fatigue = 50; A.addFat(-10); const drop = 50 - S.fatigue;
    S.cerRec = null; S.fatigue = 50; A.addFat(-10); const base = 50 - S.fatigue;
    if (!(Math.abs(drop - base * 0.8) < 0.01)) bad.push(`出征倍率没进 addFat：${drop} vs ${base}`);
    S.off = null;
    const aw = A.computeAwards(); if (!aw || aw.first.length !== 5 || !aw.mvp) bad.push("颁奖夜算不出一阵 / MVP");
    if (aw && new Set(aw.first.map((x: any) => x.pos)).size !== 5) bad.push("一阵五个位置不齐");
    A.cerStart("awards"); if (!S.cer || S.cer.k !== "awards") bad.push("颁奖夜没开场");
    S.achPop = []; S.rankUp = null;   // 成就弹窗先散场，仪式才开（真实界面里也是这个顺序）
    if (!/年度颁奖夜/.test(A.cerCard())) bad.push("颁奖夜的卡没渲染");
    A.cerClose(); if (S.cer) bad.push("颁奖夜散不了场");
    S.auto = { career: true }; A.cerStart("awards"); if (S.cer) bad.push("托管里颁奖夜还弹了"); S.auto = null;
    // ---- 第二批仪式（2026-09-08）：反应 / 决策的档位线、决赛之夜、试训上机、版本发布会、媒体日、排队 ----
    if (A.reactTier(0.8, 300) !== "gold" || A.reactTier(0.8, 420) !== "silver" || A.reactTier(0.5, 300) !== "bronze" || A.reactTier(0.8, 430, true) !== "gold" || A.reactTier(0.8, 430, false) !== "silver") bad.push("反应档位线不对");
    if (A.decideTier(5) !== "gold" || A.decideTier(4) !== "gold" || A.decideTier(3) !== "silver" || A.decideTier(2) !== "silver" || A.decideTier(1) !== "bronze") bad.push("决策档位线不对");
    // 决赛之夜：只在决赛开场；金档 = 这一场战力 +2、节点 +5%；跳过 = 0
    S.playoff = { round: 3, alive: true, seed: 1, beaten: [] }; S.intl = null;
    S.match = { opp: { players: [] }, oppName: "X", sc: [0, 0], game: 1, lines: [], node: null, swing: 0, done: false, need: 3, bo5: true };
    if (!A.isFinalMatch()) bad.push("季后赛第三轮没被判成决赛");
    S.playoff.round = 2; if (A.isFinalMatch()) bad.push("半决赛被判成决赛"); S.playoff.round = 3;
    A.cerStart("final"); if (!S.cer || S.cer.k !== "final") bad.push("决赛之夜没开场");
    S.achPop = []; S.rankUp = null;   // 成就弹窗先散场，仪式才开
    if (!/入场/.test(A.cerCard())) bad.push("决赛之夜的卡没渲染");
    A.cerFinish("gold", { rate: 0.8, ms: 300, hit: 12, total: 15 }); A.cerClose();
    if (S.cer || !S.match.cerFinal || S.match.cerFinal.pw !== 2 || A.cerFinalPw() !== 2 || Math.abs(A.cerFinalNode() - 0.05) > 1e-9) bad.push("决赛金档没给这一场 +2 / +5%：" + JSON.stringify(S.match.cerFinal));
    A.cerStart("final"); A.cerSkip(); if (S.cer || A.cerFinalPw() !== 0) bad.push("决赛跳过没按银档走");
    S.match = null; S.playoff = null;
    // 版本发布会 + 媒体日：同一周撞上要排队；金档进 versionFit；媒体日「狂」加热度并把心态压力倍率抬到 1.5
    A.cerStart("patch"); A.cerStart("media");
    if (!S.cer || S.cer.k !== "patch" || !S.cerQ || S.cerQ.length !== 1 || S.cerQ[0].k !== "media") bad.push("两场仪式没排队：" + (S.cer && S.cer.k) + " / " + JSON.stringify(S.cerQ));
    A.cerStart("media"); if (S.cerQ.length !== 1) bad.push("同一种仪式排了两次");
    const pq = A.patchQuiz(); if (!pq || pq.qs.length !== 5 || pq.qs.some((q: any) => q.a.filter((x: any) => x.ok).length !== 1 || q.a.length !== 3)) bad.push("版本发布会题库不对（要五道题、每题三选一、恰好一个正确）");
    const mq = A.mediaQuiz(); if (!mq || mq.qs.length !== 3 || mq.qs.some((q: any) => q.a.length !== 3 || !q.a.every((x: any) => ["bold", "steady", "blame"].includes(x.tone)))) bad.push("媒体日题库不对");
    S.achPop = []; S.rankUp = null;   // 成就弹窗先散场，仪式才开
    if (!/版本发布会/.test(A.cerCard())) bad.push("版本发布会的卡没渲染");
    const vf0 = A.versionFit();
    A.cerFinish("gold", { n: 5, total: 5 }); A.cerClose();
    if (!S.verCer || S.verCer.adj !== 0.5 || Math.abs(A.versionFit() - vf0 - 0.5) > 1e-9) bad.push("发布会金档没进版本相性：" + JSON.stringify(S.verCer) + " " + vf0 + "→" + A.versionFit());
    if (!S.cer || S.cer.k !== "media") bad.push("发布会散场后媒体日没接上：" + (S.cer && S.cer.k));
    S.achPop = []; S.rankUp = null;   // 成就弹窗先散场，仪式才开
    if (!/媒体日/.test(A.cerCard())) bad.push("媒体日的卡没渲染");
    const h0 = S.heat || 0; S.tilt = 0;
    A.cerFinish("silver", { tone: "bold", picks: ["bold", "bold", "steady"] }); A.cerClose();
    if (S.cer || !S.media || S.media.tone !== "bold" || (S.heat || 0) - h0 !== 15 || A.mediaTiltMul() !== 1.5) bad.push("媒体日「狂」的效果不对：heat " + h0 + "→" + S.heat + " mul " + A.mediaTiltMul());
    S.media = null; if (A.mediaTiltMul() !== 1) bad.push("没有媒体日时心态压力倍率不是 1");
    A.cerStart("media"); A.cerSkip(); if (S.cer || S.media) bad.push("媒体日跳过还留了口径");
    S.verCer = null;
    // 试训上机：职业前（S.career 为空）也要能开；金档 = 评级 +1 档
    { const car = S.career; S.career = null;
      S.tryout = { tier: "mid", team: "T", expect: 60, day: 0, score: 0, lines: [], fat: 0, done: false, days: [0, 1, 2, 3] };
      A.cerStart("bench"); if (!S.cer || S.cer.k !== "bench") bad.push("试训上机在职业前没开场");
      S.achPop = []; S.rankUp = null;   // 成就弹窗先散场，仪式才开
      if (!/上机/.test(A.cerCard())) bad.push("试训上机的卡没渲染");
      A.cerFinish("gold", { rate: 0.9, ms: 350, hit: 14, total: 15 }); A.cerClose();
      if (S.cer || S.tryout.cerAdj !== 1) bad.push("上机金档没给评级 +1 档");
      S.tryout = null; S.career = car; }
    // 托管里四场都不弹
    S.auto = { career: true }; S.match = { opp: { players: [] }, oppName: "X", sc: [0, 0], lines: [], swing: 0, done: false, need: 3 }; S.playoff = { round: 3, alive: true };
    A.cerStart("final"); A.cerStart("patch"); A.cerStart("media");
    if (S.cer || (S.cerQ && S.cerQ.length)) bad.push("托管里第二批仪式还弹了"); if (A.cerFinalPw() !== 0 || A.verCerAdj() !== 0 || S.media) bad.push("托管跳过改了数值");
    S.auto = null; S.match = null; S.playoff = null; S.verCer = null;
    // ---- 首发竞争与续约判据（2026-09-08 玩家反馈）：一把尺、斜率、红线；留队意愿的标定；队魂按赛段数 ----
    {
      const sc = A.starterComp();
      if (Math.abs(sc.me - A.myStrength()) > 1e-9) bad.push("首发竞争用的实力和「我的」页不是同一把尺：" + sc.me + " vs " + A.myStrength());
      if (!(sc.comp >= 5 && sc.comp <= 98)) bad.push("首发竞争条越界：" + sc.comp);
      // 斜率要在条没顶到 98 的地方量：先把五维放到队友均值上（条约 55 附近），再 +1
      const a0 = JSON.parse(JSON.stringify(S.attrs));
      A.DIMS.forEach((dd: string) => { S.attrs[dd] = sc.tavg; }); const c1 = A.starterComp().comp;
      A.DIMS.forEach((dd: string) => { S.attrs[dd] = sc.tavg + 1; }); const d = A.starterComp().comp - c1; S.attrs = a0;
      if (!(Math.abs(d - (A.COMP_SLOPE + A.COMP_LEAGUE)) < 0.6)) bad.push(`首发竞争的斜率不对：五维 +1 条动了 ${d.toFixed(2)}，应约 ${A.COMP_SLOPE + A.COMP_LEAGUE}`);
      if (A.COMP_RED !== 35) bad.push("首发竞争红线不是 35");
      // 留队意愿：策划稿第三节的四个例子 + 一票否决 + 标定（信任全 50、刚来 → 线在实力差 −6）
      const ev = (gap: number, ct: number, mt: number, tr: number, ten: number, extra: any = {}) => A.renewEval(Object.assign({ gap, ct, mt, tr, ten, wonTitle: false, aw: null }, extra));
      if (!ev(-6, 50, 50, 50, 0).ok || ev(-6.5, 50, 50, 50, 0).ok) bad.push("留队意愿的标定漂了：信任全 50、刚来的人，线应在实力差 −6");
      if (!ev(-3, 75, 65, 84, 4).ok) bad.push("例 1（−3 / 教练 75 / 4 赛段）应该续约");
      if (!ev(-8, 75, 70, 84, 5).ok) bad.push("例 2（−8 / 教练 75 / 经理 70 / 5 赛段）——玩家说的队魂——应该留下");
      if (ev(-8, 35, 50, 60, 1).ok) bad.push("例 3（−8 / 教练 35 / 1 赛段）应该放走");
      if (ev(-14, 90, 90, 90, 6).ok) bad.push("例 4（−14 / 教练 90 / 6 赛段）信任救不回崩掉的实力，应该放走");
      const maxOff = ev(-11, 90, 90, 90, 6).ok && !ev(-13, 90, 90, 90, 6).ok;
      if (!maxOff) bad.push("信任 + 队魂能抵的实力差应在 5～6 分之间（满信任 6 赛段：−11 留、−13 走）");
      if (ev(+4, 80, 80, 30, 4).ok || !ev(+4, 80, 80, 30, 4).veto) bad.push("队友信任跌破 35 应一票否决");
      if (!ev(-20, 30, 30, 30, 0, { wonTitle: true }).ok) bad.push("今年冠军应铁续约");
      if (ev(-7, 50, 50, 50, 1).ok || !ev(-7, 50, 50, 50, 1, { aw: "mvp" }).ok) bad.push("年度 MVP 的 +12 没进式子");
      // 队魂按赛段数：老档从尾巴往前数同一支队；新档按加入时的 log 长度
      const log0 = S.career.log, team0 = S.team, tss0 = S.teamSinceSplit;
      S.career.log = [{ team: "A" }, { team: "A" }, { team: "B" }, { team: "B" }]; S.team = "B"; S.teamSinceSplit = undefined;
      if (A.teamTenureSplits() !== 2) bad.push("老档的在队赛段数没从尾巴往前数：" + A.teamTenureSplits());
      S.teamSinceSplit = 1; if (A.teamTenureSplits() !== 3) bad.push("新档的在队赛段数不对：" + A.teamTenureSplits());
      S.career.log = log0; S.team = team0; S.teamSinceSplit = tss0;
      // 端到端：合同到期 → contractCheck 按评分走；实力崩了放走、正常续约；卡上有账
      const c0 = S.contract, fa0 = S.freeAgent, pr0 = S.pendingRenew, cr0 = S.cutReason, at0 = JSON.parse(JSON.stringify(S.attrs));
      S.contract = { years: 1, left: 1, salary: 300, clubTier: "mid" }; S.pendingRenew = null; S.freeAgent = false;
      A.DIMS.forEach((d: string) => { S.attrs[d] = 30; });
      const r1 = A.contractCheck(); if (r1 !== "cut" || !/留队意愿/.test(S.cutReason || "")) bad.push("实力崩到 30 还没被放走 / 原因里没写账：" + r1 + " " + S.cutReason);
      // 「正常实力」= 和队友持平再高一点（测试人物本来是个坐在强队里的新人，差 20 分，那本来就该走）
      { const tv = A.starterComp().tavg; A.DIMS.forEach((dd: string) => { S.attrs[dd] = tv + 1; }); }
      S.contract = { years: 1, left: 1, salary: 300, clubTier: "mid" }; S.pendingRenew = null; S.freeAgent = false;
      const r2 = A.contractCheck(); if (r2 !== "renew" || !S.pendingRenew || S.pendingRenew.score === undefined) bad.push("正常实力没续约 / 报价里没带评分：" + r2 + " " + (S.cutReason || ""));
      S.attrs = JSON.parse(JSON.stringify(at0));
      if (!/续约桌上/.test(A.roleCard()) || !/留队意愿/.test(A.roleCard())) bad.push("队内身份卡没有「续约桌上」的账");
      S.contract = c0; S.freeAgent = fa0; S.pendingRenew = pr0; S.cutReason = cr0;
    }
    // ---- 第三批仪式（2026-09-08）：突破试炼、康复期、全明星、见面会、退役赛季、职业前杯赛决赛 ----
    {
      const pops = () => { S.achPop = []; S.rankUp = null; };
      // 突破试炼：撞顶的那一维开场；金档 = 天花板 +1（里程碑池）；没过记「这个赛段试过」，同赛段不再弹
      const d0 = A.DIMS.find((d: string) => S.attrs[d] >= A.capOf(d) - 0.05) || "操作";
      const a0 = JSON.parse(JSON.stringify(S.attrs)), cb0 = JSON.stringify(S.capBonus), cm0 = JSON.stringify(S.capMile);
      S.attrs[d0] = A.capOf(d0); S.btkTrial = {};
      const cap0 = A.capOf(d0);
      A.btkTrialCheck(); if (!S.cer || S.cer.k !== "trial" || S.cer.dim !== d0) bad.push("撞顶没开突破试炼：" + JSON.stringify(S.cer));
      pops(); if (!/突破试炼/.test(A.cerCard())) bad.push("突破试炼的卡没渲染");
      S.cer.step = 1; pops(); const gm = A.cerCard(); if (!new RegExp(`data-game="${A.TRIAL_MECH[d0]}"`).test(gm)) bad.push(`试炼的机制没按维度分发：${d0} → ${A.TRIAL_MECH[d0]}`);
      A.cerFinish("gold", { rate: 0.9, ms: 300 }); A.cerClose();
      if (S.cer || S.btkTrial[d0] !== "pass" || !(A.capOf(d0) > cap0 + 0.5)) bad.push(`试炼金档没顶开天花板：${cap0} → ${A.capOf(d0)}，${JSON.stringify(S.btkTrial)}`);
      S.attrs[d0] = A.capOf(d0); A.btkTrialCheck(); if (S.cer) bad.push("过了关的那一维又弹了试炼");
      S.btkTrial = {}; A.btkTrialCheck(); if (!S.cer) bad.push("重新贴顶没弹试炼"); A.cerFinish("bronze", {}); A.cerClose();
      if (S.cer || S.btkTrial[d0 + "_si"] !== S.si) bad.push("试炼没过应该记「这个赛段试过」：" + JSON.stringify(S.btkTrial));
      A.btkTrialCheck(); if (S.cer) bad.push("同一个赛段试炼弹了两次");
      S.attrs = a0; S.btkTrial = {}; S.capBonus = cb0 ? JSON.parse(cb0) : undefined; S.capMile = cm0 ? JSON.parse(cm0) : undefined;
      // 康复期：受伤开场；金档少养一周；伤只剩 1 周不再减
      S.injury = { k: "wrist", n: "手腕劳损", d: "x", left: 3, hit: { 操作: -4 } };
      A.cerStart("rehab"); if (!S.cer || S.cer.k !== "rehab") bad.push("康复期没开场");
      pops(); if (!/康复期/.test(A.cerCard())) bad.push("康复期的卡没渲染");
      A.cerFinish("gold", { ms: 60, hit: 8, total: 8 }); A.cerClose(); if (S.cer || S.injury.left !== 2) bad.push("康复金档没少养一周：" + S.injury.left);
      S.injury.left = 1; A.cerStart("rehab"); A.cerFinish("gold", { ms: 60 }); A.cerClose(); if (S.injury.left !== 1) bad.push("只剩 1 周还被减了");
      S.injury = null; A.cerStart("rehab"); if (S.cer) bad.push("没受伤也开了康复期");
      // 全明星：没资格 → 落选卡、零效果；有资格 → 技巧赛；金档 +20 人气；跳过 0
      S.career.awards = []; S.career.lgYears = []; S.career.msiYears = []; S.career.worldsYears = []; const f0 = S.fans; S.fans = 100;
      if (A.allstarSelected()) bad.push("没奖项没冠军人气 100 也入选了全明星");
      A.cerStart("allstar"); if (!S.cer || S.cer.sel !== false || A.cerStepName() !== "miss") bad.push("落选的全明星没走落选卡：" + JSON.stringify(S.cer));
      pops(); if (!/没有你的名字/.test(A.cerCard())) bad.push("落选卡没渲染");
      A.cerClose(); if (S.cer || S.fans !== 100) bad.push("落选还改了人气");
      S.career.awards = [{ si: S.si, kind: "second" }];
      A.cerStart("allstar"); if (!S.cer || S.cer.sel !== true) bad.push("二阵没入选全明星");
      const hA = S.heat || 0;
      A.cerFinish("gold", { rate: 0.9, ms: 300, hit: 15, total: 16 }); A.cerClose();
      const dA = (S.heat || 0) - hA;   // +20，成就「技巧赛之王」第一次解锁再 +15
      if (S.cer || !(dA === 20 || dA === 35)) bad.push("技巧赛金档没给人气 +20：" + hA + "→" + S.heat);
      const hB = S.heat || 0; A.cerStart("allstar"); A.cerSkip(); if (S.cer || (S.heat || 0) !== hB) bad.push("全明星跳过改了人气");
      S.fans = f0; S.career.awards = [];
      // 见面会：人气够、休赛期、一年一次；办成了钱和人气动；疲劳低不会砸
      S.off = { week: 1, weeks: 3, next: "year" }; S.fans = 500; S.money = 1000; S.fatigue = 20; S.meet = {};
      if (!A.meetOpen() || !/粉丝见面会/.test(A.meetCard())) bad.push("见面会该开而没开 / 卡没渲染");
      const m0 = S.money, h0 = S.heat || 0; A.pickMeet("mid");
      const M = A.MEETS.find((x: any) => x.k === "mid");
      if (S.money !== m0 - M.cost + Math.round(Math.min(500, M.cap) * M.per) || (S.heat || 0) !== h0 + M.heat + M.fans) bad.push(`见面会办成的账不对：钱 ${m0}→${S.money} 热 ${h0}→${S.heat}（应 +${M.heat + M.fans}）`);
      if (A.meetOpen()) bad.push("见面会一年办了两次");
      S.fans = 100; S.meet = {}; if (A.meetOpen() || A.meetCard() !== "") bad.push("人气不够也能办见面会");
      S.off = null; S.meet = {}; S.fans = f0;
      // 退役赛季：只在再战的最后一年；开场卡、名片行、最后一场常规赛 +2 走 cerFinalPw
      S.extended = true; const si0 = S.si; S.si = A.lastSeason(); S.farewell = null;
      A.cerStart("farewell0"); if (!S.cer || S.cer.k !== "farewell0") bad.push("退役赛季开场卡没开");
      pops(); if (!/最后一年/.test(A.cerCard())) bad.push("退役赛季开场卡没渲染");
      A.cerClose(); if (S.cer || !S.farewell || S.farewell.si !== S.si) bad.push("退役赛季没记下来：" + JSON.stringify(S.farewell));
      S.match = { opp: { players: [] }, oppName: "X", sc: [0, 0], lines: [], swing: 0, done: false, need: 2, farewellPw: 2 };
      if (A.cerFinalPw() !== 2) bad.push("最后一场常规赛的 +2 没进战力");
      S.match = null;
      if (!/退役赛季/.test(A.careerPoster())) bad.push("名片上没有「退役赛季」");
      A.cerStart("farewell"); pops(); if (!S.cer || !/退役仪式/.test(A.cerCard())) bad.push("退役仪式卡没开 / 没渲染"); A.cerClose(); if (S.cer) bad.push("退役仪式散不了场");
      S.farewell = null; S.extended = false; S.si = si0;
      // 职业前杯赛决赛：S.cupMatch 上也能开决赛之夜，加成挂在 cupMatch 上
      { const car = S.career; S.career = null;
        S.cupMatch = { kind: "city", opp: "市队", op: 55, sc: [0, 0], need: 2, game: 1, lines: [], node: null, swing: 0, done: false };
        A.cerStart("final"); if (!S.cer || S.cer.k !== "final") bad.push("杯赛决赛没开决赛之夜");
        pops(); if (!/网吧包场/.test(A.cerCard())) bad.push("杯赛决赛的入场词不是网吧版");
        S.cer.step = 1; pops(); if (!/data-pre="1"/.test(A.cerCard())) bad.push("杯赛决赛没用职业前那条线");
        A.cerFinish("gold", { rate: 0.9, ms: 300 }); A.cerClose();
        if (S.cer || !S.cupMatch.cerFinal || S.cupMatch.cerFinal.pw !== 2 || A.cupFinalPw(S.cupMatch) !== 2) bad.push("杯赛决赛金档没挂到 cupMatch 上：" + JSON.stringify(S.cupMatch.cerFinal));
        const p0 = A.cupWinP(S.cupMatch, 0); S.cupMatch.cerFinal = null; const p1 = A.cupWinP(S.cupMatch, 0); if (!(p0 > p1)) bad.push("杯赛决赛的 +2 没进赢面");
        S.cupMatch = null; S.career = car; }
    }
    // ---- 赛后拆解 简洁 / 详细（2026-09-08）：默认简洁；tab 在；简洁没有临场账本、详细有；档案回放与杯赛同一套 ----
    {
      const m0 = S.match, arc0 = S.archive, pv0 = S.pmView, pm0 = S.pmMode, cm0 = S.cupMatch;
      const rows = [{ n: "个人能力", v: -1.8, fix: "a" }, { n: "默契", v: 1.1, fix: "b" }, { n: "状态", v: -0.6, fix: "c" }, { n: "战术", v: 0.3, fix: "d" }, { n: "体能", v: -0.2, fix: "e" }];
      S.match = { opp: { players: [] }, oppName: "X", sc: [1, 2], game: 4, lines: [], node: null, swing: 0, done: true, pmSeen: true, need: 2,
        attr: { rows, myTotal: 78, opTotal: 80 }, nodeLog: [{ g: 1, t: "抢龙", dim: "操作", p: 61, ok: true, d: 4 }], luck: ["第2局赢面 <b>72%</b> 还是丢了：骰子背。"], gameLog: [], box: null };
      S.pmMode = undefined;
      if (A.pmMode() !== "brief") bad.push("拆解默认不是简洁");
      let h = A.postMatchCard();
      if (!/data-pm="brief"/.test(h) || !/data-pm="full"/.test(h)) bad.push("拆解卡上没有简洁 / 详细 tab");
      if (!/pmrows lite/.test(h) || /临场账本 · 概率/.test(h) || (h.match(/class="pmr /g) || []).length !== 3) bad.push("简洁版不对：应只有三根条、没有临场账本：" + (h.match(/class="pmr /g) || []).length);
      if (!/这场输在<b>个人能力/.test(h)) bad.push("简洁版没有一句结论");
      S.pmMode = "full"; h = A.postMatchCard();
      if (!/临场账本 · 概率/.test(h) || (h.match(/class="pmr /g) || []).length !== 5 || /pmrows lite/.test(h)) bad.push("详细版不对：应五根条、有临场账本");
      // 档案回放
      S.archive = [{ si: S.si, tag: "第1周", opp: "Y", win: true, sc: [2, 0], pm: { my: 80, op: 76, rows, nodes: [], luck: [], adv: { personal: [], team: [] } } }]; S.pmView = 0;
      S.pmMode = "brief"; h = A.pmReplayCard(); if (!/data-pm="full"/.test(h) || !/pmrows lite/.test(h) || !/这场赢在/.test(h)) bad.push("档案回放的简洁版不对");
      S.pmMode = "full"; h = A.pmReplayCard(); if (/pmrows lite/.test(h) || (h.match(/class="pmr /g) || []).length !== 5) bad.push("档案回放的详细版不对");
      // 杯赛
      S.cupMatch = { kind: "city", opp: "市队", op: 55, sc: [2, 1], need: 2, game: 4, lines: [], node: null, swing: 0, done: true, pmSeen: true, nodeLog: [], gameLog: [], snap: { round: 4, prep: 0, my: 58, teamName: "T", hasMates: false, teamAvg: 58, syn: 50, tac: 50, mor: 50, legacyPrep: 0 } };
      S.pmMode = "brief"; h = A.cupPostCard(S.cupMatch); if (!/data-pm="full"/.test(h) || !/pmrows lite/.test(h)) bad.push("杯赛拆解的简洁版不对");
      S.pmMode = "full"; h = A.cupPostCard(S.cupMatch); if (/pmrows lite/.test(h) || !/临场账本|复盘/.test(h)) bad.push("杯赛拆解的详细版不对");
      S.match = m0; S.archive = arc0; S.pmView = pv0; S.pmMode = pm0; S.cupMatch = cm0;
    }
    // 特训营：一年一次，钱不够不能选，卡渲染得出来
    S.off = { week: 1, weeks: 3, next: "year" }; S.money = 1000;
    if (!/特训营/.test(A.campCard())) bad.push("特训营卡没渲染");
    A.pickCamp("abroad"); if (S.money !== 740 || !(S.camp && S.camp[S.si] === "abroad")) bad.push("海外集训没扣对钱：" + S.money);
    A.pickCamp("fitness"); if (S.money !== 740) bad.push("特训营一年选了两次");
    S.off = null;
    if (JSON.stringify(S.attrs) !== attrs0) bad.push("仪式 / 特训营动了五维");
    if (JSON.stringify(A.DIMS.map((d: string) => A.capOf(d))) !== caps0) bad.push("仪式 / 特训营动了天花板");
    /* 抽签仪式必须在季后赛开打之前（玩家实锤 2026-09-08：打到 1:0 才弹出抽签）。
       原来 cerStart("draw") 写在 startMatch 后面，S.cer 已经被这场比赛自己的仪式占住时
       抽签只能排队，等演完已经是系列赛打到一半。这里钉死：startPlayoff 之后
       当场站在台上的就是抽签，且队列里没有它。放在自检最后，动过的字段跑完还原。 */
    const poKeys = ["cer","cerQ","achPop","auto","split","week","record","match","playoff","step","pendingEnd","brk","playoffSeed","benchedPO"];
    const poSnap: any = {}; poKeys.forEach(k => { poSnap[k] = S[k] === undefined ? undefined : JSON.parse(JSON.stringify(S[k] === undefined ? null : S[k])); });
    S.cer = null; S.cerQ = []; S.achPop = null; S.auto = {};
    S.split = 1; S.week = 9; S.record = { w: 9, l: 0 };
    A.startPlayoff();
    if (!(S.cer && S.cer.k === "draw")) bad.push("季后赛开打时台上不是抽签仪式：" + JSON.stringify(S.cer && S.cer.k));
    if ((S.cerQ || []).some((c: any) => c.k === "draw")) bad.push("抽签仪式被排进了队列（会在打到一半才弹）");
    if (S.match && (S.match.w || S.match.l)) bad.push("抽签仪式还没演，比赛已经打出了比分");
    poKeys.forEach(k => { S[k] = poSnap[k]; });

  } catch (e) { bad.push("仪式自检没跑起来：" + (e && (e as any).stack || e)); }
  return bad;
}

/* ---------------- 话语权自检 ----------------
   2026-09-08：「挂牌队友」曾经整整一个生涯只有 4.9% 的赛季周能用
  （普通玩家是 0.0%），因为门槛要教练信任 >= 68，而它的自然平衡点只有 46~54——
   功能事实上是关着的，而单跑一局根本看不出来。这里把三件事钉死：
     (1) 一个夺过冠的生涯里，挂牌至少要有真实可用的时间；
     (2) 冠军必须进教练/经理信任（以前两个式子里都没有荣誉项，
         三连冠的人在教练眼里和一个赢球多的普通首发没区别）；
     (3) 点名引援的候选池要有梯度，不能永远是「够得着的人里最难的五个」。 */
function cloutChecks() {
  const bad: string[] = [];
  let weeks = 0, listOk = 0, maxCt = 0, honorRows = 0, spread = 0, pools = 0;
  const r = playOne({ seed: 7701, strong: true, hook: (S: any, A: any) => {
    if (!S.career || !S.team || S.step !== "season" || S.homeLeague === "LDL") return;
    weeks++;
    if (A.canList().ok) listOk++;
    maxCt = Math.max(maxCt, A.coachTrust());
    const L = S.staffLog;
    if (L && L.coach.some((x: any) => /冠军/.test(x.why) && x.v > 0)) honorRows++;
    if (A.canSign().ok) {
      const os = A.signTargets().map((x: any) => A.signOdds(x));
      if (os.length >= 2) { pools++; if (Math.max(...os) - Math.min(...os) > 0.02) spread++; }
    }
  }});
  if (!weeks) { bad.push("话语权自检：这一局没有打到赛季阶段"); return bad; }
  if (!(listOk / weeks >= 0.05))
    bad.push(`挂牌队友几乎用不了：${listOk}/${weeks} = ${(listOk / weeks * 100).toFixed(1)}% 的赛季周（要 >= 5%）`);
  if (!(maxCt >= A.LIST_GATE.coach))
    bad.push(`教练信任整局最高只有 ${maxCt.toFixed(1)}，够不到挂牌门槛 ${A.LIST_GATE.coach}——门槛又变成摆设了`);
  const titles = (r.lg || 0) + (r.msi || 0) + (r.worlds || 0);
  if (titles > 0 && !honorRows)
    bad.push(`拿了 ${titles} 座冠军，但教练信任的收支里一次都没出现荣誉项——荣誉又从公式里掉了`);
  if (pools >= 20 && !(spread / pools >= 0.5))
    bad.push(`点名引援的候选池没有梯度：${spread}/${pools} 次给出的成算有差别（要 >= 50%）`);
  return bad;
}

export { playOne, unitChecks, A, SEED };

/* 批测：npx tsx demo/test.ts --batch 30
   固定种子 1..N 各跑一局，只打统计不做断言。用来校准职业前压缩（20→14 周）前后的上岸节奏：
   一年内上岸率、上岸周数 p50/p90、上岸时段位读数、结局分布——改前改后各跑一次对比。 */
function batch(n: number, encore = false, strong = false, loyal = false) {
  const rs = [];
  for (let i = 1; i <= n; i++) { rs.push(playOne({ seed: 1000 + i, encore, strong, loyal })); process.stderr.write("."); }
  process.stderr.write("\n");
  const q = (arr: number[], p: number) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : 0; };
  const signed = rs.filter(r => r.signAt > 0);
  const weeks = signed.map(r => r.signAt);
  const yr = A.PRE_YEAR;
  const count = (f: (r: any) => string) => { const m: Record<string, number> = {}; rs.forEach(r => { const k = f(r); m[k] = (m[k] || 0) + 1; }); return m; };
  console.log(JSON.stringify({
    runs: n, preYear: yr, apPre: A.AP_PRE,
    signedRate: +(signed.length / n).toFixed(2),
    signedYear1: +(signed.filter(r => r.signAt <= yr).length / n).toFixed(2),
    signAtP50: q(weeks, 0.5), signAtP90: q(weeks, 0.9), signAtMean: +(weeks.reduce((a, b) => a + b, 0) / Math.max(1, weeks.length)).toFixed(1),
    signRankMean: +(signed.reduce((a, r) => a + r.signRank, 0) / Math.max(1, signed.length)).toFixed(1),
    signFansMean: Math.round(signed.reduce((a, r) => a + r.signFans, 0) / Math.max(1, signed.length)),
    preYears: count(r => String(r.preYears)),
    w1: (() => { const ws = rs.map(r => r.w1).filter(Boolean); const m = (k: string) => +(ws.reduce((a, w) => a + w[k], 0) / Math.max(1, ws.length)).toFixed(1); return { n: ws.length, rank: m("rank"), fans: m("fans"), score: m("score"), attrs: m("attrs"), fat: m("fat") }; })(),
    y1: { invites: +(rs.reduce((a, r) => a + r.y1Inv, 0) / n).toFixed(2), tryouts: +(rs.reduce((a, r) => a + r.y1Try, 0) / n).toFixed(2), passed: +(rs.reduce((a, r) => a + r.y1Pass, 0) / n).toFixed(2) },
    // 冠军来得早还是晚：按赛季下标数世界赛 / MSI 冠军，以及「签约后第几年拿到第一座世界冠军」
    // 国际赛遇到 LCK / T1 时的处境：开打时平均疲劳、首局赢面、BO5 胜率；打到 2–2 时第五局的赢面与实际胜率
    intlVs: (() => { const all = rs.flatMap(r => r.intlLog || []);
      const sum = (rows: any[]) => { const n = rows.length; if (!n) return null;
        const g5 = rows.filter(x => x.g5);
        return { n, fatAvg: +(rows.reduce((a, x) => a + x.fat, 0) / n).toFixed(1), p1Avg: +(rows.reduce((a, x) => a + x.p1, 0) / n).toFixed(1),
          winRate: +(rows.filter(x => x.win).length / n).toFixed(3), fatOver40: +(rows.filter(x => x.fat >= 40).length / n).toFixed(2),
          g5: g5.length ? { n: g5.length, p5Avg: +(g5.reduce((a, x) => a + x.p5, 0) / g5.length).toFixed(1), winRate: +(g5.filter(x => x.g5win).length / g5.length).toFixed(3) } : null }; };
      return { vsLCK: sum(all.filter(x => x.lck)), vsT1: sum(all.filter(x => x.opp === "T1")), vsOthers: sum(all.filter(x => !x.lck)), bo5all: sum(all.filter(x => x.need === 3)) }; })(),
    byYear: (() => { const w: Record<string, number> = {}, m: Record<string, number> = {}, first: Record<string, number> = {};
      rs.forEach(r => { (r.worldsYears || []).forEach((y: number) => { const k = A.SEASONS[y] ? A.SEASONS[y].tag : String(y); w[k] = (w[k] || 0) + 1; });
        (r.msiYears || []).forEach((y: number) => { const k = A.SEASONS[y] ? A.SEASONS[y].tag : String(y); m[k] = (m[k] || 0) + 1; });
        if ((r.worldsYears || []).length) { const k = "签约后第" + (Math.min(...r.worldsYears) - r.firstSi + 1) + "年"; first[k] = (first[k] || 0) + 1; } });
      return { worldsByYear: w, msiByYear: m, firstWorldsAfterSigning: first }; })(),
    // 冠军率的病因：队伍档次、世界排名、你的属性、进过几次国际赛、走到多深
    end: (() => { const m = (f: (r: any) => number) => +(rs.reduce((a, r) => a + (f(r) || 0), 0) / n).toFixed(2);
      const dims: Record<string, any> = {}; A.DIMS.forEach((d: string) => { dims[d] = { v: m(r => r.dims && r.dims[d][0]), cap: m(r => r.dims && r.dims[d][1]), atCap: +(rs.filter(r => r.dims && r.dims[d][1] - r.dims[d][0] < 1).length / n).toFixed(2) }; });
      const tiers: Record<string, number> = {}; rs.forEach(r => (r.tiers || []).forEach((t: string) => { tiers[t] = (tiers[t] || 0) + 1; }));
      const depth: Record<string, number> = {}; rs.forEach(r => { depth[String(r.bestIntl)] = (depth[String(r.bestIntl)] || 0) + 1; });
      return { attrsAvg: m(r => r.attrsAvg), myTeamPower: m(r => r.teamGap && r.teamGap.mine), worldTop1: m(r => r.teamGap && r.teamGap.top1), worldTop8: m(r => r.teamGap && r.teamGap.top8),
        teamWorldRank: m(r => r.teamGap && r.teamGap.worldRank), teamLgRank: m(r => r.teamGap && r.teamGap.lgRank), inWorldTop8: +(rs.filter(r => r.teamGap && r.teamGap.worldRank > 0 && r.teamGap.worldRank <= 8).length / n).toFixed(2),
        worldsApps: m(r => r.worldsApps), msiApps: m(r => r.msiApps), bestIntlDist: depth, bestRankMean: m(r => r.bestRank), tierSeasons: tiers, dims }; })(),
    endings: count(r => r.ending),
    titlesMean: +(rs.reduce((a, r) => a + r.titles.length, 0) / n).toFixed(2),
    // 夺冠概率：任一冠军 / 联赛 / MSI / 世界赛 / 破局者（MSI+世界赛各一）/ 两冠 / 三连（王朝）
    rates: (() => { const f = (g: (r: any) => boolean) => +(rs.filter(g).length / n).toFixed(3); return {
      anyTitle: f(r => r.titles.length > 0), league: f(r => r.lg > 0), msi: f(r => r.msi > 0), worlds: f(r => r.worlds > 0),
      worlds2: f(r => r.worlds >= 2), breaker: f(r => r.msi > 0 && r.worlds > 0), dynasty: f(r => r.streak >= 3),
      backToBack: f(r => r.streak >= 2), worldsPerCareer: +(rs.reduce((a, r) => a + r.worlds, 0) / n).toFixed(2),
      worldsPerApp: +(rs.reduce((a, r) => a + r.worlds, 0) / Math.max(1, rs.reduce((a, r) => a + r.worldsApps, 0))).toFixed(3),
      appsPerCareer: +(rs.reduce((a, r) => a + r.worldsApps, 0) / n).toFixed(2),
      legend: f(r => r.ending === "传奇"), extended: f(r => r.extended) }; })(),
    stepsMean: Math.round(rs.reduce((a, r) => a + r.steps, 0) / n),
  }, null, 1));
}

if (isMain && process.argv.includes("--batch")) {
  const i = process.argv.indexOf("--batch");
  batch(parseInt(process.argv[i + 1] || "20", 10) || 20, process.argv.includes("--encore"), process.argv.includes("--strong"), process.argv.includes("--loyal"));   // --encore：再战；--strong：强玩家；--loyal：夺冠后不走
} else if (isMain) {
  console.log("随机种子：", SEED, "（SEED=" + SEED + " npm test 可原样重放）");
  { const cb = cloutChecks();
    if (cb.length) { console.error("话语权自检不通过：\n  " + cb.join("\n  ")); process.exit(1); }
    console.log("话语权自检通过：挂牌门槛够得着 · 冠军进教练/经理信任 · 引援候选有梯度"); }
  const unit = unitChecks();
  if (unit.length) { console.error("单元检查失败：\n - " + unit.join("\n - ")); process.exit(1); }
  console.log("单元检查通过：导览几何 · 存档消毒");
  // 背景卡折算表（资金 60 万 / 人气 10 / 信任 3 ≈ 1 点，属性 1 点 = 1 点）：各卡并不等值，差异在形状——见 origins.js 顶部注释
  console.log("背景折算：", A.BACKGROUNDS.map(b => b.k + " " + (Object.values<number>(b.mod || {}).reduce((a, v) => a + v, 0)
    + (b.money || 0) / 60 + (b.fame || 0) / 10 + (b.trust || 0) / 3).toFixed(1)).join(" · "));
  console.log("模块自检：赛季", A.SEASONS.length, "| 背景", A.BACKGROUNDS.length,
    "| 成就", A.ACHIEVEMENTS.length, "| 年龄", A.AGES.length, "| 段位", A.RANKS.length);
  const r = playOne();
  console.log(JSON.stringify(r, null, 1));
  // 断言：跑不完、数值坏了都要以非零退出码失败——CI 靠这个
  const S = A.S();
  const bad = [];
  if (!r.ok) bad.push("生涯没有走到结局（step=" + S.step + "，steps=" + r.steps + "）");
  A.DIMS.forEach(d => { const v = S.attrs && S.attrs[d]; if (typeof v !== "number" || !isFinite(v) || v < 0 || v > 100) bad.push("属性异常 " + d + "=" + v); });
  if (typeof S.fatigue !== "number" || S.fatigue < 0 || S.fatigue > 100) bad.push("疲劳越界 " + S.fatigue);
  if (!r.saved) bad.push("存档没有写入");
  // 外设每一档都得比上一档贵、也比上一档强（外部测评抓的：320 万的鼠标比 130 万的还弱）
  Object.keys(A.GEAR).forEach(k => A.GEAR[k].forEach((g, i) => {
    if (i === 0) return;
    const pv = A.GEAR[k][i - 1], d = Object.keys(g.e)[0];
    if (!(g.cost > pv.cost) || !((g.e[d] || 0) > (pv.e[d] || 0))) bad.push("外设反向升级 " + k + " → " + g.n);
  }));
  if (S.scaleVer !== 2 || !S.born) bad.push("新档缺少 scaleVer/born（审计 P0 回归）");
  if (bad.length) { console.error("自检失败：\n - " + bad.join("\n - ")); process.exit(1); }
  console.log("自检通过");
}
