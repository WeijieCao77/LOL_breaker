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
const MODULES = ["state", "data", "main", "intl", "team", "rivals", "rankart", "rankicon", "avatar", "shop", "origins", "achieve", "achieve_more", "squad", "random", "form", "postmatch", "boxscore", "injury", "rotation", "clout", "routine", "auto", "quest", "trait", "nodes", "cup", "save", "tryout", "press", "audio", "stats", "stars", "market", "cer", "share", "bond"];
const state = await import("./src/state.ts");
const mods = [];
for (const m of MODULES) mods.push(await import(`./src/${m}.ts`));
const A: any = Object.assign({}, ...mods, { S: () => state.S, setS: state.setS });
/* 读源码做自检时统一行尾：Windows 上 git 检出的是 CRLF，而下面有好几处拿
   "\n…" 字面去 indexOf。不归一的话 CI（Linux/LF）全绿、作者本机却一条报错、
   几条静默失效——那几条自检等于没跑。 */
const readText = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8").replace(/\r\n/g, "\n");

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
  let bondTalks = 0;   // 羁绊：这一局用了几次「找人聊聊」
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
      /* 找人聊聊（羁绊第三批）：机器人把每赛段的次数用满——难度批测要量的正是
         「一个把这条通道用到底的人」。
         ⚠️ 用这里做难度对照的人注意：机器人是贪心花点，8 点正好四次训练。
         任何 1 点的新行动都会把它挤成 3 训练 + 1 排位，而排位涨状态、
         状态直接乘在战力上——光比「开 / 关这个功能」会凭空多出七个点的夺冠率，
         那是工具的位移不是游戏的。要比就比**同样消耗行动点、效果开 vs 关**
         （把 bond.ts 的 BOND_TALK 全部置零跑一遍当对照）。 */
      if (!opts.noBondTalk && S.career && S.team && S.ap > 0 && A.bondTalkLeft() > 0) {
        const cand = A.myRoster().filter((p: any) => !p.me && A.bondTalkCan(p.id).ok);
        if (cand.length) { A.doBondTalk(cand[0].id); bondTalks++; }
      }
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
    bondTalks, bondMates: Object.keys(S.mates||{}).length,
    bondPassed: Object.keys(S.mates||{}).filter(k => (S.mates[k]||{}).passed).length,
    bondHandover: Object.keys(S.mates||{}).filter(k => (S.mates[k]||{}).handover).length,
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
  /* 「选项灰的时候也会触发做不了的事件」（玩家实锤 2026-09-09）：
     练操作已经因为「机械路径已刷满」变灰，周末却还在弹「冲击操作瓶颈断了」。
     按钮灰不灰、面板显不显示、周末审不审判，三处必须给出同一个答案。 */
  {
    const S: any = A.S();
    const bak = { attrs: S.attrs && Object.assign({}, S.attrs), capB: S.capBonus && Object.assign({}, S.capBonus),
                  capMile: S.capMile, capSeen: S.capSeen,
                  btk: S.btk, ev: S.events, ap: S.ap, step: S.step, career: S.career, team: S.team };
    S.step = "season"; S.events = []; S.ap = 8;
    S.btk = { opStreak: 2, opThisWeek: 0, vod: 0, rest: 0, apWeek: 8 };
    S.capSeen = {}; S.capMile = {};
    // 顶到瓶颈、机械池还没满 → 三处都说「在冲击」
    S.capBonus = Object.assign({}, S.capBonus, { 操作: 0 });
    A.DIMS.forEach((d: string) => { S.attrs[d] = A.capOf(d); });
    const chasing1 = A.btkChasing("操作");
    const note1 = A.btkChaseNote();
    const btn1 = A.trainBtn("操作", 8);
    if (!chasing1) bad.push("突破：顶到瓶颈、机械池没满，却说不在冲击");
    if (!note1) bad.push("突破：在冲击却不显示冲击面板");
    if (btn1.dis) bad.push("突破：在冲击的时候练操作按钮却是灰的");
    // 机械池刷满 → 按钮灰、面板不显示、周末也不该再骂人
    S.capBonus = Object.assign({}, S.capBonus, { 操作: A.CAP_MECH_MAX });
    A.DIMS.forEach((d: string) => { S.attrs[d] = A.capOf(d); });
    const chasing2 = A.btkChasing("操作");
    const note2 = A.btkChaseNote();
    const btn2 = A.trainBtn("操作", 8);
    if (chasing2) bad.push("突破：机械路径已刷满，还说在冲击");
    if (note2) bad.push("突破：机械路径已刷满，冲击面板还挂着");
    if (!btn2.dis) bad.push("突破：机械路径已刷满，练操作按钮却还能点");
    S.events = [];
    A.btkWeekEnd();
    const nag = (S.events || []).some((e: any) => /冲击操作瓶颈/.test(e.text || ""));
    if (nag) bad.push("突破：按钮已经灰了，周末还在弹「冲击操作瓶颈断了」——这正是要修的那件事");
    // 一次性收益已经领过：同样三处一致
    S.capBonus = Object.assign({}, S.capBonus, { 操作: 0 });
    A.DIMS.forEach((d: string) => { S.attrs[d] = A.capOf(d); });
    S.capSeen = { op3w: 1 };
    if (A.btkChasing("操作") !== !A.btkPathDead("操作")) bad.push("突破：一次性收益领过之后三处判断又不一致了");
    S.attrs = bak.attrs; S.capBonus = bak.capB; S.capMile = bak.capMile; S.capSeen = bak.capSeen; S.btk = bak.btk;
    S.events = bak.ev; S.ap = bak.ap; S.step = bak.step; S.career = bak.career; S.team = bak.team;
  }
  /* 「歇够 ×N」必须和连点 N 次休息**一模一样**（玩家实锤 2026-09-09：
     「回体力点击困难，每回合都要点半天」）。这是个纯点击数的改动，
     一个数值都不能动——所以拿两条路跑同一个初始状态，逐项对齐。 */
  {
    const S: any = A.S();
    const bak = { ap: S.ap, fat: S.fatigue, tilt: S.tilt, xin: S.attrs && S.attrs.心态,
                  step: S.step, off: S.off, buff: S.buff, bg: S.bg, assets: S.assets, ev: S.events };
    const setup = () => { S.step = "season"; S.off = null; S.buff = {}; S.assets = {};
      S.ap = 8; S.fatigue = 88; S.tilt = 40; S.attrs.心态 = 50; S.events = []; };
    setup();
    const n = A.restRoom();
    if (n < 2) bad.push(`歇够：体能 12 剩 8 点，该能连歇好几次，实得 ${n}`);
    A.doRestAll();
    const one = { ap: S.ap, fat: +S.fatigue.toFixed(4), tilt: S.tilt, xin: +S.attrs.心态.toFixed(4) };
    setup();
    for (let i = 0; i < n; i++) A.doAction("rest");
    const many = { ap: S.ap, fat: +S.fatigue.toFixed(4), tilt: S.tilt, xin: +S.attrs.心态.toFixed(4) };
    (["ap", "fat", "tilt", "xin"] as const).forEach(k => {
      if (one[k] !== many[k]) bad.push(`歇够：${k} 和连点 ${n} 次对不上（歇够 ${one[k]} / 连点 ${many[k]}）`);
    });
    // 体能已经够高就不该再冒出这个入口
    setup(); S.fatigue = 10;
    if (A.restRoom() !== 0) bad.push("歇够：体能已经 90 了还提示继续歇");
    // 行动点不够就不歇
    setup(); S.ap = 0;
    if (A.restRoom() !== 0) bad.push("歇够：没有行动点也算得出次数");
    S.ap = bak.ap; S.fatigue = bak.fat; S.tilt = bak.tilt; if (S.attrs) S.attrs.心态 = bak.xin;
    S.step = bak.step; S.off = bak.off; S.buff = bak.buff; S.bg = bak.bg; S.assets = bak.assets; S.events = bak.ev;
  }
  /* 抗韩 / 内战：两条都得看**你自己在哪个赛区**，不只看对手
     （玩家实锤 2026-09-09：「效力 LCK 战队也能触发抗韩成就」）。 */
  {
    const lck = A.ACHIEVEMENTS.find((x: any) => x.id === "beatlck");
    const civil = A.ACHIEVEMENTS.find((x: any) => x.id === "lpl_civil");
    if (!lck || !civil) bad.push("抗韩 / 内战成就不见了");
    else {
      // 抗韩：触发点已经保证了「国际赛 + 赢 + 对手是 LCK」，条件只负责排除「你就是 LCK」
      if (!lck.cond({ myLeague: "LPL" })) bad.push("抗韩：LPL 选手赢下 LCK 却不算");
      if (!lck.cond({ myLeague: "LEC" })) bad.push("抗韩：LEC 选手赢下 LCK 却不算");
      if (!lck.cond({ myLeague: "LDL" })) bad.push("抗韩：二队选手赢下 LCK 却不算");
      if (lck.cond({ myLeague: "LCK" })) bad.push("抗韩：效力 LCK 的人赢下 LCK 也算——这正是要修的那件事");
      // 内战无强敌：这是 LPL 的梗，说明里写死了「另一支 LPL 队伍」
      const civ = (my: string, opp: string) => civil.cond({ intl: true, won: true, myLeague: my, oppLeague: opp });
      if (!civ("LPL", "LPL")) bad.push("内战：LPL 打 LPL 却不算");
      if (civ("LCK", "LCK")) bad.push("内战：LCK 打 LCK 也弹「另一支 LPL 队伍」——文案穿帮");
      if (civ("LPL", "LCK")) bad.push("内战：打的是 LCK，不该算内战");
      if (civ("LCK", "LPL")) bad.push("内战：你在 LCK，赢 LPL 不是内战");
      // 「韩流克星」是同一把锁的另一半（玩家实锤 2026-09-09 的第二封反馈）
      const k3 = A.ACHIEVEMENTS.find((x: any) => x.id === "beat3lck");
      if (!k3) bad.push("韩流克星成就不见了");
      else {
        const S: any = A.S(); const bk = S.lckBeaten;
        S.lckBeaten = ["T1", "GEN", "DK"];
        if (!k3.cond({ myLeague: "LPL" })) bad.push("韩流克星：LPL 选手打赢三支 LCK 却不算");
        if (k3.cond({ myLeague: "LCK" })) bad.push("韩流克星：效力 LCK 的人也能拿——和抗韩同一个口子");
        S.lckBeaten = bk;
      }
    }
  }
  /* 替补席（作者拍板 2026-09-09）：不再替首发交默契的学费，媒体日换替补版。 */
  {
    const S: any = A.S();
    const bak = { career: S.career, team: S.team, promoted: S.promoted, understudy: S.understudy,
                  benched: S.benchedThisSplit, squad: S.squad, media: S.media, si: S.si, split: S.split,
                  ap: S.ap, bondCoach: S.bondCoach, rel: S.rel };
    S.career = S.career || { w: 0, l: 0, titles: [], log: [] }; S.team = S.team || "TEST";
    S.si = 1; S.split = 0; S.squad = { syn: 70, tac: 70 };
    // 替补：面板换成替补版，训练赛和合练收起来
    S.promoted = false; S.understudy = { id: "INC", pos: "top", age: 22, r: { 操作: 70, 运营: 70, 心态: 70, 指挥: 70, 体质: 70 } };
    S.benchLock = true;
    const benchHtml = A.squadActs();
    if (/data-squad="scrim"/.test(benchHtml) || /data-squad="drill"/.test(benchHtml))
      bad.push("替补席上还摆着训练赛 / 合练——那是喂首发默契池的");
    if (!/data-bench="film"/.test(benchHtml)) bad.push("替补席上没有「看录像」");
    // 默契在替补赛段冻结
    S.benchedThisSplit = true; S.squad = { syn: 70, tac: 70 };
    A.squadDecay();
    if (S.squad.syn !== 70 || S.squad.tac !== 70)
      bad.push(`替补赛段的默契还是掉了：${S.squad.syn}/${S.squad.tac}（该冻结在 70）`);
    const cc = S.champCore; S.champCore = null;   // 冠军班底也会冻结默契，别和替补那条混在一起
    S.benchedThisSplit = false; S.squad = { syn: 70, tac: 70 }; A.squadDecay();
    if (S.squad.syn >= 70) bad.push("不是替补的赛段默契也不掉了——冻结冻错了人");
    S.champCore = cc;
    // 媒体日替补版：一题、只有稳和狂
    const q = A.mediaQuizBench();
    if (!q || q.qs.length !== 1) bad.push("替补版媒体日不是一题");
    else {
      const tones = q.qs[0].a.map((x: any) => x.tone).sort().join(",");
      if (tones !== "bold,steady") bad.push("替补版媒体日的口径应该只有稳和狂，实得 " + tones);
    }
    // 替补版「狂」的代价是对位挑战，不是心态
    S.media = { si: 1, split: 0, tone: "bold", bench: true };
    if (A.mediaTiltMul() !== 1) bad.push("替补版说了狂话却还吃心态那一刀（他根本不上场）");
    if (A.mediaScrimAdj() !== -0.05) bad.push("替补版狂话没留下对位挑战的代价，实得 " + A.mediaScrimAdj());
    S.media = { si: 1, split: 0, tone: "bold" };
    if (A.mediaTiltMul() === 1) bad.push("首发说了狂话，心态那一刀不见了");
    if (A.mediaScrimAdj() !== 0) bad.push("首发的狂话不该扣对位挑战成功率");
    // 找教练聊：每赛段一次，且不给任何数值
    S.ap = 8; S.bondCoach = null;
    if (!A.bondCoachCan().ok) bad.push("找教练聊：一次没用就说用不了（" + A.bondCoachCan().why + "）");
    S.bondCoach = A.bondCoachKey();
    if (A.bondCoachCan().ok) bad.push("找教练聊：一个赛段能聊两次");
    S.promoted = bak.promoted; S.understudy = bak.understudy; S.benchLock = false;
    S.career = bak.career; S.team = bak.team; S.benchedThisSplit = bak.benched; S.squad = bak.squad;
    S.media = bak.media; S.si = bak.si; S.split = bak.split; S.ap = bak.ap; S.bondCoach = bak.bondCoach;
  }
  /* 更衣室关系：卡面上写着能缓和的那几件事，现在真的碰这个数了 */
  {
    const S: any = A.S();
    const bakRel = S.rel;
    /* relAll 走的是当前名单（myRoster），所以键要用真实队友的 id 拼 */
    let ids: string[] = [];
    try { ids = A.myRoster().filter((p: any) => !p.me).map((p: any) => p.id); } catch (e) { ids = []; }
    if (ids.length >= 2) {
      S.rel = {}; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) S.rel[[ids[i], ids[j]].sort().join("|")] = 50;
      const n = Object.keys(S.rel).length;
      A.relAll(2);
      const moved = Object.keys(S.rel).filter(k => S.rel[k] !== 50).length;
      if (moved !== n) bad.push(`relAll 只动了 ${moved}/${n} 对关系（该是全队每一对）`);
      A.relAll(-2);
      if (Object.keys(S.rel).some(k => Math.abs(S.rel[k] - 50) > 0.01)) bad.push("relAll 的正负不对称，加回来对不上");
    } else bad.push("关系自检：这一局没有可用的队友名单");
    S.rel = bakRel;
    const pot = (A.RELAX || []).find((x: any) => x && x.k === "hotpot");
    if (!pot) bad.push("商店里找不到「约队友吃火锅」");
    else if (!pot.rel) bad.push("约队友吃火锅的卡面写着「关系一起补」，但它没有 rel");
  }
  /* 共事账本（羁绊第一批）。作者点名的那条弧线本来在数值里就跑着，缺的是记忆：
     原来 syncTrust 里一行 delete 就把离队队友的一切抹掉了。 */
  {
    const S: any = A.S();
    const bak = { mates: S.mates, acc: S.bondAcc, si: S.si, split: S.split, age: S.age, trust: S.trust, attrs: S.attrs, talk: S.bondTalk, ap: S.ap };
    S.mates = null; S.si = 1; S.split = 0; S.age = 20; S.trust = { M1: 71 };
    const mate = (id: string, age: number) => ({ id, cn: "", pos: "top", age, r: {} });
    // 建档 + 峰值信任
    const e1 = A.bondSee(mate("M1", 26));
    if (!e1 || e1.id !== "M1") bad.push("共事账本：登记不上队友");
    if (e1.peakTrust !== 71) bad.push("共事账本：没记下他对你的峰值信任，实得 " + e1.peakTrust);
    S.trust.M1 = 40; A.bondSee(mate("M1", 26));
    if (e1.peakTrust !== 71) bad.push("共事账本：信任掉下来之后峰值被覆盖了");
    // 离队 / 退役都只标记，不删
    A.bondRetire("M1");
    if (!A.bondOf("M1")) bad.push("共事账本：队友退役之后记录被删掉了（这正是要修的那件事）");
    if (A.bondOf("M1").gone !== "retired") bad.push("共事账本：退役没标成 retired");
    // 角色是对每一个人判的，两根轴（强弱 / 老少）正好是作者说的那四段
    S.attrs = { 操作: 60, 运营: 60, 心态: 60, 指挥: 60, 体质: 60 };
    S.age = 22;
    const vs = (ovr: number, age: number) => A.bondRoleVs({ id: "X", age, r: { 操作: ovr, 运营: ovr, 心态: ovr, 指挥: ovr, 体质: ovr } }).role;
    if (vs(66, 27) !== "被带") bad.push("角色：比你强又比你老，该是「被带」，实得 " + vs(66, 27));
    if (vs(54, 27) !== "扛旗") bad.push("角色：比你弱又比你老，该是「扛旗」，实得 " + vs(54, 27));
    if (vs(66, 19) !== "被带飞") bad.push("角色：比你强又比你年轻，该是「被带飞」，实得 " + vs(66, 19));
    if (vs(54, 19) !== "带人") bad.push("角色：比你弱又比你年轻，该是「带人」，实得 " + vs(54, 19));
    if (vs(61, 19) !== "并肩") bad.push("角色：只差 1 分不该分强弱，该是「并肩」，实得 " + vs(61, 19));
    /* 场均评分要算进去（玩家 2026-09-09：「我是个 rating 很高的院长还被人带感觉有点奇怪」）。
       五维比他低 3 分本来判「被带」；这个赛段你场均评分比他高 0.6，折 +4（封顶），
       净 +1 就不该再说是他在带你了。改回只看五维的话，这三条一起红。 */
    S.bondAcc = { k: "1-0", n: 5, me: 5 * 1.60, mates: { R1: { n: 5, sum: 5 * 1.00 } } };
    const carry = A.bondRoleVs({ id: "R1", age: 27, r: { 操作: 63, 运营: 63, 心态: 63, 指挥: 63, 体质: 63 } });
    if (carry.role === "被带") bad.push("角色：你场均评分比他高 0.6，还判成「被带」");
    if (!carry.rGap) bad.push("角色：场均评分差没读出来，rGap=" + carry.rGap);
    if (Math.abs(carry.radj) > A.BOND_R_CAP + 1e-6) bad.push("角色：评分修正没封顶，radj=" + carry.radj);
    // 同场不够 3 个系列赛就不拿评分说话——两场的手感不该改判
    S.bondAcc = { k: "1-0", n: 2, me: 2 * 1.60, mates: { R1: { n: 2, sum: 2 * 1.00 } } };
    if (A.bondRoleVs({ id: "R1", age: 27, r: { 操作: 63, 运营: 63, 心态: 63, 指挥: 63, 体质: 63 } }).role !== "被带")
      bad.push("角色：只同场两个系列赛就拿评分改判了");
    S.bondAcc = null;
    // 判断依据要能说出口：玩家问「考虑了 rating 吗」，界面得答得上
    S.bondAcc = { k: "1-0", n: 5, me: 5 * 1.60, mates: { R1: { n: 5, sum: 5 * 1.00 } } };
    const why = A.bondRoleWhy({ id: "R1", age: 27, r: { 操作: 63, 运营: 63, 心态: 63, 指挥: 63, 体质: 63 } });
    if (!/五维均值/.test(why) || !/场均评分/.test(why) || !/岁/.test(why))
      bad.push("角色依据没把三条依据都说出来：" + why);
    S.bondAcc = null;
    /* 标签得是人话（玩家 2026-09-09：「扛旗、带人之类的玩家看不懂是什么意思」）。
       存档里存的仍是原来那五个键，只有界面换说法——两边都要在。 */
    A.BOND_ROLES.forEach((k: string) => {
      const n = A.bondRoleName(k);
      if (!n) bad.push("角色标签：" + k + " 没有对应的说法");
      if (k !== "并肩" && n === k) bad.push("角色标签：" + k + " 还是原样吐出来，玩家看不懂的正是这四个词");
      if (!A.BOND_ROLE_TXT[k]) bad.push("角色标签：" + k + " 没有解释");
    });
    // 样本不够不下结论
    S.bondAcc = { k: "1-0", n: 2, me: 2.0, mates: { M1: { n: 2, sum: 3.0 } } };
    if (A.bondRolesNow()) bad.push("共事账本：只打了两场就给这个赛段定了角色");
    S.bondAcc = null;
    if (A.bondRolesNow()) bad.push("共事账本：没有任何场次也定出了角色");
    // 名片两行：共事 1 个赛段不上卡，2 个才上
    S.mates = { M1: { id: "M1", splits: 1, titles: [], roles: {} } };
    if (A.bondCardLines().length) bad.push("共事账本：只共事过一个赛段就上了名片");
    S.mates = { M1: { id: "M1", splits: 4, titles: ["S13 LPL春季赛"], roles: {} },
                M2: { id: "M2", splits: 2, titles: [], roles: { "2-0": "带人", "2-1": "带人" } } };
    const lines = A.bondCardLines();
    if (lines.length !== 2) bad.push("共事账本：名片该有两行，实得 " + lines.length);
    else {
      if (!/M1/.test(lines[0].v) || !/4 个赛段/.test(lines[0].v) || !/1 冠/.test(lines[0].v))
        bad.push("共事账本：「并肩最久」那行写错了 " + lines[0].v);
      if (!/M2/.test(lines[1].v) || !/2 个赛段/.test(lines[1].v))
        bad.push("共事账本：「你带过最久」那行写错了 " + lines[1].v);
    }
    /* 作者原话那一整条弧线：你带过他，后来他综评超过了你。
       有这个人的时候，第二行必须写他，而且必须写清楚是哪一年被超过的。 */
    S.mates = { M1: { id: "M1", splits: 6, titles: [], roles: {} },
                M2: { id: "M2", splits: 3, titles: [], roles: { "2-0": "带人", "2-1": "带人", "3-0": "带人" } },
                M3: { id: "M3", splits: 3, titles: [], roles: { "1-0": "带人", "3-1": "被带飞", "4-0": "被带飞" } } };
    const arc = A.bondCardLines();
    if (arc.length !== 2 || !/M3/.test(arc[1].v))
      bad.push("共事账本：带过、后来被他超过的人没被写上名片（写的是 " + (arc[1] ? arc[1].v : "没有第二行") + "）");
    else if (!/综评超过你/.test(arc[1].v) || !/S15/.test(arc[1].v))
      bad.push("共事账本：「你带出来的」那行没写清是哪一年被超过 " + arc[1].v);
    /* 退役仪式点名（第二批）：陪你最久的、你带出来的，各说一句，而且必须带名字。
       原来这里是一句通用台词，因为队友一离开名单，你和他的一切就被删了。 */
    S.mates = { M1: { id: "M1", splits: 6, titles: ["S13 LPL夏季赛"], roles: {} },
                M2: { id: "M2", splits: 3, titles: [], roles: { "2-0": "带人", "3-1": "被带飞" } } };
    const fl = A.bondFarewellLines();
    if (fl.length !== 2) bad.push("退役仪式：该有两个人说话，实得 " + fl.length);
    else if (!/M1/.test(fl[0]) || !/M2/.test(fl[1])) bad.push("退役仪式：说话的人没有名字 " + fl.join(" / "));
    S.mates = {};
    if (A.bondFarewellLines().length) bad.push("退役仪式：没有共事记录时不该硬凑台词");

    /* 找人聊聊（第三批）的两道闸和一条定价约束 */
    S.mates = null; S.bondTalk = null; S.si = 1; S.split = 0; S.ap = 8;
    S.career = S.career || { w: 0, l: 0, titles: [], log: [] }; S.team = S.team || "TEST";
    if (!A.bondTalkCan("A").ok) bad.push("找人聊聊：一次都没用就说用不了（" + A.bondTalkCan("A").why + "）");
    S.bondTalk = { k: A.bondTalkKey(), n: 0, ids: ["A"] };
    if (A.bondTalkCan("A").ok) bad.push("找人聊聊：同一个人一个赛段能聊两次");
    if (!A.bondTalkCan("B").ok) bad.push("找人聊聊：次数还没用完，换个人却聊不了");
    S.bondTalk = { k: A.bondTalkKey(), n: A.BOND_TALK_PER_SPLIT, ids: ["A"] };
    if (A.bondTalkCan("C").ok) bad.push("找人聊聊：这个赛段的次数用完了还能聊");
    S.ap = 0; S.bondTalk = null;
    if (A.bondTalkCan("A").ok) bad.push("找人聊聊：没有行动点也能聊");
    /* 定价：1 个行动点换到的属性，必须低于训练的单点收益（2 点约换 1.0，即 0.5/点），
       否则它会变成新的最优解，把这条通道从「关系」变成「刷属性」。 */
    Object.keys(A.BOND_TALK).forEach((k: string) => {
      const v = A.BOND_TALK[k];
      if (!(v.self < 0.5)) bad.push(`找人聊聊：「${k}」给自己 ${v.self}，不比训练的单点收益低——会变成刷属性的新最优解`);
      if (!v.t) bad.push(`找人聊聊：「${k}」没有文案`);
    });
    // 陪练补的是他最弱的一维，请教学的是他最强的一维
    const fake = { id: "X", pos: "top", age: 20, r: { 操作: 70, 运营: 40, 心态: 55, 指挥: 60, 体质: 50 } };
    if (A.bondTopDim(fake) !== "操作") bad.push("找人聊聊：请教该学他最强的一维，实得 " + A.bondTopDim(fake));
    if (A.bondTopDim(fake, true) !== "运营") bad.push("找人聊聊：陪练该补他最弱的一维，实得 " + A.bondTopDim(fake, true));

    S.mates = bak.mates; S.bondAcc = bak.acc; S.si = bak.si; S.split = bak.split; S.age = bak.age; S.trust = bak.trust; S.attrs = bak.attrs;
    S.bondTalk = bak.talk; S.ap = bak.ap;
  }
  /* 赛后狠话（作者实锤 2026-09-09：「新档没放过狠话，却提示狠话被记录下来成了热梗」）。
     两条：① 没在媒体日定「狂」就不该有口径；② 回旋镖判的是说完之后那两周，
     不是整个赛段的累计负场。 */
  {
    const S: any = A.S();
    const media0 = S.media, si0 = S.si, sp0 = S.split, rec0 = S.record, ev0 = S.events;
    S.si = 1; S.split = 0;
    S.media = null;
    if (A.mediaToneNow()) bad.push("狠话：没开过媒体日却报出了口径");
    S.media = { si: 1, split: 0, tone: "steady" };
    if (A.mediaToneNow() !== "steady") bad.push("狠话：这个赛段定的是「稳」，读出来却不是");
    S.media = { si: 0, split: 0, tone: "bold" };
    if (A.mediaToneNow()) bad.push("狠话：上个赛季的口径还在这个赛季生效");
    // 回旋镖：同一个赛段，说完之后 2 胜 0 负 → 好结局；0 胜 2 负 → 弹幕热梗
    const fire = (w: number, l: number) => {
      S.events = []; S.record = { w, l };
      A.FOLLOWUPS.bigTalk.run({ opp: "TEST", si: 1, sp: 0, w0: 1, l0: 1 });
      return (S.events[0] || {}).text || "";
    };
    S.si = 1; S.split = 0;
    if (!/宣传片/.test(fire(3, 1))) bad.push("狠话：说完之后 2 胜 0 负，回旋镖却没给好结局");
    if (!/弹幕热梗/.test(fire(1, 3))) bad.push("狠话：说完之后 0 胜 2 负，回旋镖却没给坏结局");
    if (!/宣传片/.test(fire(1, 1))) bad.push("狠话：说完之后没输过，却被判成战绩不好");
    /* 作者说的正是这一种：赛段前面已经输了几场（「俱乐部战绩不好」），
       但说完之后这两周是赢的——旧写法只看累计负场，照样判坏结局。 */
    S.events = []; S.record = { w: 3, l: 3 };
    A.FOLLOWUPS.bigTalk.run({ opp: "TEST", si: 1, sp: 0, w0: 1, l0: 3 });
    if (!/宣传片/.test((S.events[0] || {}).text || ""))
      bad.push("狠话：赛段前面输过三场，但说完之后 2 胜 0 负，回旋镖仍判成战绩不好");
    S.media = media0; S.si = si0; S.split = sp0; S.record = rec0; S.events = ev0;
  }
  /* 名片图的「存到相册」那条路（作者实测 2026-09-09：手机上点「下载图片」，
     图落进「文件」App 的下载项而不是相册）。navigator.share 只收 File，
     所以 dataURL 得先拆成 File；node / jsdom 里没有 share，必须安静地退回长按那条路。 */
  {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const f: any = A.dataUrlToFile(png, A.SHARE_FILE);
    if (!f) bad.push("名片图：dataURL 拆不成 File");
    else {
      if (f.type !== "image/png") bad.push("名片图：拆出来的 File 类型不是 image/png，是 " + f.type);
      if (!(f.size > 0)) bad.push("名片图：拆出来的 File 是空的");
      if (f.name !== A.SHARE_FILE) bad.push("名片图：文件名不对 " + f.name);
    }
    if (A.dataUrlToFile("这不是 dataURL", "x.png")) bad.push("名片图：不是 dataURL 也拆出了 File");
    if (A.canShareFile(f)) bad.push("名片图：这台机器上没有 navigator.share，canShareFile 却说能分享");
    if (A.canShareFile(null)) bad.push("名片图：canShareFile(null) 应该是 false");
  }
  /* 成就「零杀十死也能赢」判的是真实数据行，不是临场决策（玩家实锤 2026-09-09：
     19/6/15、评分 1.15 照样弹）。好数据的胜场绝不能命中，全队垫底的胜场才命中。 */
  {
    const z = A.ACHIEVEMENTS.find((x: any) => x.id === "zero_ten");
    if (!z) bad.push("成就 zero_ten 不见了");
    else {
      const good = { won: true, nodeFails: 3, myRating: 1.15, meWorst: false, meGap: 0.22 };
      const ugly = { won: true, nodeFails: 0, myRating: 0.86, meWorst: true, meGap: -0.31 };
      const lost = { won: false, nodeFails: 3, myRating: 0.80, meWorst: true, meGap: -0.40 };
      const near = { won: true, nodeFails: 3, myRating: 1.02, meWorst: true, meGap: -0.20 };
      if (z.cond(good)) bad.push("零杀十死：好数据的胜场也命中了（评分 1.15、全队不垫底）");
      if (!z.cond(ugly)) bad.push("零杀十死：全队垫底且比队友低 0.31 的胜场没命中");
      if (z.cond(lost)) bad.push("零杀十死：输了也命中");
      if (z.cond(near)) bad.push("零杀十死：只差 0.20 就命中了，门槛是 0.25");
    }
  }
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
    const css = readText(HERE, "theme.css");
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
  /* 桌面出口条（.row.dock）两条硬约束——玩家 2026-09-09 截图里的「互相遮挡」两条都踩了。
     jsdom 不算布局，量不到遮挡，所以这里改成量**成因**：
     ① 它是 sticky 的，只压得住排在它后面的兄弟 → 它必须是「本周」那张卡的最后一个孩子；
     ② 背景不能是半透的 → 底下的字会透上来，看着就是重影。 */
  try {
    const ms = readText(HERE, "src", "main.ts");
    const dock = ms.indexOf('<div class="row dock">');
    if (dock < 0) bad.push("出口条：main.ts 里找不到 .row.dock");
    else {
      ["scrimPanel()", "本周对手"].forEach(k => {
        const i = ms.indexOf(k, dock);
        // 同一张卡里排在出口条后面 = 会被它糊住。卡片以 `\n  </div>` 收口。
        const cardEnd = ms.indexOf("\n  </div>", dock);
        if (i > 0 && cardEnd > 0 && i < cardEnd) bad.push("出口条：「" + k + "」排在 .row.dock 后面，宽屏上会被它盖住");
      });
    }
    const css = readText(HERE, "theme.css");
    const dockCss = css.slice(css.indexOf(".row.dock{"), css.indexOf("}", css.indexOf(".row.dock{")));
    if (/rgba\(var\(--panel-rgb\),\s*\.[0-8]/.test(dockCss) || /backdrop-filter/.test(dockCss))
      bad.push("出口条：背景是半透的 / 带 backdrop-filter，底下的字会透上来：" + dockCss.slice(0, 160));
    /* 桌面密度那一块必须写在基准值**后面**：媒体查询不加权重，写在前面一条都不生效。
       第一版就是写在 .wrap 旁边（文件中段之前），改完字号和格子宽度页面纹丝不动。 */
    const wideAt = css.indexOf("/* ---- 桌面密度");
    if (wideAt < 0) bad.push("桌面密度自检：theme.css 里找不到那一块（注释头被改了？）");
    else ["\n.g5{", "\n.note{", "\n.act .d{", "\n.opt .d,"].forEach(k => {
      const base = css.indexOf(k);
      if (base < 0) { bad.push("桌面密度自检：theme.css 里找不到基准值 " + k.trim()); return; }
      if (wideAt < base) bad.push("桌面密度：整块写在基准值 " + k.trim() + " 前面，媒体查询不加权重，一条都不会生效");
    });
  } catch (e) { bad.push("出口条 / 桌面密度自检没跑起来：" + e); }
  /* 「本周」页的主列 + 右栏（作者拍板 2026-09-09，参照 VAL Player）。
     jsdom 不算布局，所以这里量的是结构和源码顺序，不是像素。 */
  try {
    const ms = readText(HERE, "src", "main.ts");
    const g = ms.indexOf('<div class="wkgrid">');
    if (g < 0) bad.push("本周页：找不到 .wkgrid（主列 + 右栏的容器）");
    else {
      // 源码顺序 = 窄屏顺序：下一场 → 行动卡 → 周报。手机上先看对手再动手，最后才是报纸。
      const iNext = ms.indexOf('class="wk-next"', g);
      const iMain = ms.indexOf('class="wk-main"', g);
      const iPress = ms.indexOf('class="wk-press"', g);
      if (!(iNext > 0 && iMain > iNext && iPress > iMain))
        bad.push(`本周页：单列顺序该是「下一场 → 行动 → 周报」，实得 next=${iNext} main=${iMain} press=${iPress}`);
      // 行动卡（含出口条）必须整个装在主列里，否则宽屏上它会跑到右栏底下
      const dock = ms.indexOf('<div class="row dock">', g);
      if (!(dock > iMain && dock < iPress)) bad.push("本周页：行动卡的出口条不在 .wk-main 里");
    }
    const css = readText(HERE, "theme.css");
    // 三块的摆位都得写全，少一条就会有一块掉回文档流、压到别的格子上
    ["\.wkgrid>\.wk-main\{grid-column:1", "\.wkgrid>\.wk-next\{grid-column:2", "\.wkgrid>\.wk-press\{grid-column:2"]
      .forEach(re => { if (!new RegExp(re).test(css)) bad.push("本周页：theme.css 缺摆位规则 " + re.replace(/\\/g, "")); });
    // 分栏必须在媒体查询里——单列是基准，宽屏才分。写反了手机上会变成 360px 的右栏
    const wide = css.indexOf("@media(min-width:1180px){\n  /* 360px 的右栏");
    const base = css.indexOf(".wkgrid{display:grid");
    if (base < 0 || wide < 0 || wide < base) bad.push("本周页：分栏没写在 @media(min-width:1180px) 里，或写在了基准值前面");
    /* 右栏「最近的比赛」的「拆解」按钮点了要真能开——data-pmv 只是把 S.pmView 设上，
       画出来的是 pmReplayCard()，而它原来只挂在 tabContent 上，「本周」这一页没有。
       第一版就是这么漏的：按钮在、绑定在、点下去什么也不发生。 */
    if (g >= 0) {
      const act = ms.indexOf("return `${champ}", g > 0 ? 0 : 0);
      const seasonRet = ms.lastIndexOf("return `${champ}", g);
      if (seasonRet < 0 || ms.indexOf("pmReplayCard()", seasonRet) < 0 || ms.indexOf("pmReplayCard()", seasonRet) > g)
        bad.push("本周页：viewSeason 没画 pmReplayCard，右栏的「拆解」按钮点了不会有反应");
      if (ms.indexOf('data-pmv', ms.indexOf("export function railRecent")) < 0)
        bad.push("最近的比赛：没给每场挂「拆解」按钮（data-pmv）");
    }
    /* 封面页页头：标语必须排在主视觉**下面**。原来图高和 padding-top 各写一条 clamp，
       两条曲线随宽度分开走，1320px 上标语正好压在图里那行「电竞选手生涯模拟」上。
       现在两者共用 --art，文字起点 = 图高 + 一段固定间距，宽度再怎么变都叠不上去。 */
    if (!/header\.top:not\(\.compact\)\{--art:/.test(css))
      bad.push("封面页头：没有 --art（图高和文字起点必须由同一个值决定）");
    if (!/padding-top:calc\(var\(--art\)/.test(css))
      bad.push("封面页头：文字起点没有跟着 --art 走，标语会压回图上");
    if (!/\.keyart\{bottom:auto;height:var\(--art\)\}/.test(css))
      bad.push("封面页头：主视觉没有用 --art 定高，它会铺满整个页头、把标语盖在图里");
    /* 职业前那一页也得是同一套（玩家实锤 2026-09-09：「我没看到界面改动，
       我的电竞周报去哪里了」——上一版只改了签约之后的 viewSeason）。 */
    const pg = ms.indexOf('<div class="wkgrid pre">');
    if (pg < 0) bad.push("职业前页：没有 .wkgrid.pre（主列 + 右栏那一套没铺到 viewPre）");
    else ["wk-next", "wk-main", "wk-coach", "wk-press"].forEach(k => {
      if (ms.indexOf('class="' + k + '"', pg) < 0 || ms.indexOf('class="' + k + '"', pg) > pg + 900)
        bad.push("职业前页：右栏缺 " + k);
    });
    // 「谁在看你」是从行动卡里**搬**过来的，主列不该再说一遍
    const ap = ms.indexOf("export function actPanelPre(){");
    const apEnd = ms.indexOf("\nexport function", ap + 10);
    if (ap > 0 && ms.slice(ap, apEnd).indexOf("还没有俱乐部会看你") >= 0)
      bad.push("职业前页：试训门槛在行动卡和右栏各写了一遍");
    /* 主列比右栏高得多，跨行时多出来的高度会被平摊到各行，把右栏卡拉开
       （实测 328 / 789 / 1296）。末尾必须留一行 1fr 把富余高度吸走。 */
    [[".wkgrid.pre{grid-template-rows:", "span 3"], [".wkgrid{grid-template-rows:", "span 4"]].forEach(([k]) => {
      if (css.indexOf(k) < 0) bad.push("本周页：" + k + " 缺末尾吸高度的那一行 1fr，右栏会被拉开");
    });
    if (!/\.wkgrid\.pre>\.wk-main\{grid-column:1;grid-row:1\/span 4\}/.test(css))
      bad.push("职业前页：主列跨的行数和 grid-template-rows 对不上");
    if (!/\.wkgrid>\.wk-main\{grid-column:1;grid-row:1\/span 5\}/.test(css))
      bad.push("赛季页：主列跨的行数和 grid-template-rows 对不上");
    /* 四个「本周」形态必须用同一套骨架（玩家实锤 2026-09-09：「在休赛期或者季后赛
       或者其他世界赛大赛的时候，界面又变回老模式，我要的是保证这个界面一致」）。
       每加一个新形态都得自己进 .wkgrid，否则又会漏一个。 */
    [["viewSeason", "赛季"], ["viewPre", "职业前"], ["viewPrep", "备战 / 季后赛 / 国际赛"],
     ["viewOffseason", "休赛期"]].forEach(([fn, name]) => {
      const at = ms.indexOf("export function " + fn + "(){");
      if (at < 0) { bad.push("布局一致性：找不到 " + fn); return; }
      const end = ms.indexOf("\nexport function", at + 10);
      const body = ms.slice(at, end < 0 ? ms.length : end);
      // 只看画「本周」那一支：别的标签页走 tabContent，不在范围内
      if (body.indexOf('class="wkgrid') < 0)
        bad.push("布局一致性：" + name + "（" + fn + "）还是老的单列，没进 .wkgrid");
    });
  } catch (e) { bad.push("本周页布局自检没跑起来：" + e); }
  /* 「教练怎么看你」的卡头和正文不许各说各的（玩家实锤 2026-09-09：
     一边写「轮换」一边写「你是他认定的首发」）。根子是卡头放了 cloutTier 的档次名——
     那是**话语权**档次，不是**阵容位置**。两个状态各跑一遍：卡头必须和正文同一个口径，
     而且卡头里不许出现任何一个话语权档次名。 */
  {
    const S: any = A.S();
    const bak = { promoted: S.promoted, understudy: S.understudy, career: S.career,
                  team: S.team, staff: S.staff, benchLock: S.benchLock, scrim: S.scrim };
    S.career = S.career || { w: 0, l: 0, titles: [] };
    S.team = S.team || "T1";
    const TIERS = ["队魂", "核心", "主力", "轮换", "新人"];
    // understudy 是「你顶谁的位」，isBenched 会拿他的五维和你比，桩必须带 r；
    // 再把他调得比你强 + 上 benchLock，否则 isBenched 会当场把你提成首发
    const strong: any = {}; A.DIMS.forEach((d: string) => strong[d] = 99);
    const inc = { id: "老将", pos: S.pos || "mid", age: 24, r: strong };
    const head = (h: string) => (h.match(/<h2>教练怎么看你<em>([^<]*)<\/em>/) || [])[1] || "";
    // ① 首发
    S.promoted = true; S.understudy = null;
    let html = A.railCoach();
    if (head(html) !== "首发") bad.push("教练卡：是首发，卡头却写「" + head(html) + "」");
    if (html.indexOf("你是他认定的首发") < 0) bad.push("教练卡：首发状态下正文没说是首发");
    // ② 替补
    S.promoted = false; S.understudy = inc; S.benchLock = true; S.scrim = null;
    html = A.railCoach();
    if (head(html) !== "替补") bad.push("教练卡：在替补席，卡头却写「" + head(html) + "」");
    if (html.indexOf("你还在替补席上") < 0) bad.push("教练卡：替补状态下正文没说在替补席");
    // 两种状态下卡头都不许是话语权档次名
    ["首发", "替补"].forEach((_, i) => {
      S.promoted = i === 0; S.understudy = i === 0 ? null : inc;
      const h = head(A.railCoach());
      if (TIERS.includes(h)) bad.push("教练卡：卡头写成了话语权档次「" + h + "」，那不是阵容位置");
    });
    Object.assign(S, bak);
  }
  /* 职业前右栏那两张卡：数据都得从 S.pre 上读，别摸 S.career / S.team */
  {
    const S: any = A.S();
    const bak = { pre: S.pre, career: S.career, team: S.team };
    S.career = null; S.team = null;
    S.pre = Object.assign({}, bak.pre || {}, { week: 1, ap: 10, rank: 30, log: [], mates: [] });
    let n = "", sc = "";
    try { n = A.railNext(); sc = A.railScout(); } catch (e) { bad.push("职业前右栏画不出来：" + e); }
    if (n.indexOf("转会窗口") < 0) bad.push("下一个节点：没说距离转会窗口还有几周");
    if (!sc || sc.indexOf("谁在看你") < 0) bad.push("谁在看你：卡片没画出来");
    S.pre = null;
    if (A.railNext() !== "" || A.railScout() !== "") bad.push("职业前右栏：没有 S.pre 时该返回空串");
    Object.assign(S, bak);
  }
  /* 赛季结算卡上的「XX 冠军」必须念这一季实际所在的赛区（玩家实锤 2026-09-09：
     在 T1 拿了联赛冠军，标签却写「LPL 冠军」）。源码扫描那条只管「有没有写死」，
     这条管「换个赛区跑一遍，念出来的对不对」。 */
  {
    const S: any = A.S();
    const bak = { ls: S.lastSeason, hl: S.homeLeague, si: S.si, off: S.off, tab: S.tab,
                  team: S.team, career: S.career, attrs: S.attrs, sa0: S.seasonAttr0 };
    S.homeLeague = "LCK"; S.team = "T1"; S.off = null; S.tab = "act"; S.si = 2;
    S.seasonAttr0 = Object.assign({}, S.attrs);
    S.career = Object.assign({}, S.career, { worldsYears: [], msiYears: [], log: [] });
    S.lastSeason = { result: "champion", seed: 1, lg: "LCK", rec: { w: 7, l: 0 },
                     grow: A.DIMS.map((d: string) => ({ d, g: 0 })) };
    let html = "";
    try { html = A.viewOffseason(); } catch (e) { bad.push("赛季结算卡画不出来：" + e); }
    if (html) {
      if (html.indexOf("LCK 冠军") < 0) bad.push("赛季结算：在 LCK 夺冠，标签没写「LCK 冠军」");
      if (html.indexOf("LPL 冠军") >= 0) bad.push("赛季结算：在 LCK 夺冠，标签却写了「LPL 冠军」（玩家报的就是这个）");
    }
    // 老档没记 lg，得退回当前赛区，不能又变回 LPL
    S.lastSeason.lg = undefined;
    let old2 = "";
    try { old2 = A.viewOffseason(); } catch (e) {}
    if (old2 && old2.indexOf("LPL 冠军") >= 0) bad.push("赛季结算：老档缺 lg 时退回成了写死的 LPL");
    // 生涯口径的赛区按打得最多的算，不是退役那一刻的
    S.career.log = [{ lg: "LPL" }, { lg: "LPL" }, { lg: "LPL" }, { lg: "LCK" }];
    if (A.careerLeague() !== "LPL") bad.push("生涯赛区：四个赛段里三个在 LPL，该算 LPL，实得 " + A.careerLeague());
    S.career.log = [];
    if (A.careerLeague() !== "LCK") bad.push("生涯赛区：没有日志时该退回当前赛区 LCK，实得 " + A.careerLeague());
    Object.assign(S, { lastSeason: bak.ls, homeLeague: bak.hl, si: bak.si, off: bak.off,
                       tab: bak.tab, team: bak.team, career: bak.career, seasonAttr0: bak.sa0 });
  }
  /* 存档卡右半边：只准读存档 blob，一个全局都不许碰（那是别人那一局的数据）。
     传一个纯对象进去——如果实现里偷偷用了 S / titleCount() 之类，这里就炸。 */
  {
    const blob = { name: "阿甲", pos: "mid", si: 1, week: 3, split: 1, age: 21, team: "EDG",
      homeLeague: "LPL", attrs: { 操作: 70, 运营: 70, 心态: 70, 指挥: 70, 体质: 70 },
      ach: { a: 1, b: 1 }, career: { w: 10, l: 5, titles: ["S13 LPL春季赛"], worldsYears: [1] } };
    const html = A.saveStats(blob);
    ["EDG", "S13 LPL春季赛", "10−5", "阿甲".slice(0, 0) || "冠军", "成就"].forEach(k => {
      if (k && html.indexOf(k) < 0) bad.push("存档卡数据：少了「" + k + "」");
    });
    if (A.saveStats({}).indexOf("undefined") >= 0) bad.push("存档卡数据：空存档吐出了 undefined");
    // 职业前的档没有 career，也得有东西可看，不能是空白
    const pre = A.saveStats({ name: "乙", pos: "top", si: 0, age: 18, pre: { week: 7 },
      attrs: { 操作: 50, 运营: 50, 心态: 50, 指挥: 50, 体质: 50 } });
    if (pre.indexOf("职业前") < 0) bad.push("存档卡数据：职业前的存档没写进度");
    /* 摘要行只报「你是谁」，处境交给格子——两边不许说同一件事
       （作者实锤：右边第一格「进度 S12 职业前 第 1 周」和左边摘要一字不差）。 */
    const sum = A.saveSummary(blob);
    if (sum.indexOf("21 岁") < 0) bad.push("存档卡摘要：不报年龄了");
    ["EDG", "S13", "冠军"].forEach(k => {
      if (sum.indexOf(k) >= 0) bad.push("存档卡摘要：又把「" + k + "」写进摘要了，右边格子已经在报它");
    });
    const preSum = A.saveSummary({ name: "乙", pos: "top", si: 0, age: 18, pre: { week: 7 } });
    if (preSum.indexOf("职业前") >= 0) bad.push("存档卡摘要：职业前的进度又写回摘要了，右边「进度」格已经在报");
  }
  /* 周报两个落点，各干各的：本期在「本周」，往期在「新闻」，两边不重复 */
  {
    const S: any = A.S();
    const bak = S.pressIssues;
    S.pressIssues = [
      { n: 9, label: "本期", heads: [{ c: "赛事战况", t: "本期头条" }] },
      { n: 8, label: "上期", heads: [{ c: "选手个人", t: "往期头条甲" }] },
      { n: 7, label: "上上期", heads: [{ c: "转会风声", t: "往期头条乙" }] }
    ];
    const now = A.pressCard(), all = A.pressCard("all");
    if (!/本期头条/.test(now)) bad.push("周报：本周页那份没登本期头条");
    if (/往期头条甲/.test(now)) bad.push("周报：本周页那份把往期版面也铺出来了（那是新闻页的事）");
    if (!/在「新闻」栏目里/.test(now)) bad.push("周报：本周页那份没说往期去哪儿翻");
    if (!/往期头条甲/.test(all) || !/往期头条乙/.test(all)) bad.push("周报：新闻页那份没把往期版面登全");
    if (!/本期头条/.test(all)) bad.push("周报：新闻页那份连本期都没有");
    S.pressIssues = bak;
  }
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
    /* 团队加分的上限必须落在这条带里——两头各有一次玩家投诉钉着：
       下限：太低，横扫的队也进不了一阵（2026-09-09：「LNG 黄金之路了，一阵二阵只有一个辅助入选」）
       上限：太高，冠军队整体被抬过所有人（2026-09-07：「为什么都是一个战队的」「68 分进一阵、84 分落选」）
       10–13 这条带是扫了五档实测出来的（见 cer.ts 里那张表）。要挪出这条带，先重新量。 */
    {
      const B = A.AWARD_BONUS, cap = B.worlds + B.msi + B.league + B.top4;
      if (!(cap >= 10 && cap <= 13))
        bad.push(`颁奖夜团队加分上限 ${cap} 掉出 10–13：低了横扫进不去一阵，高了冠军队整体抬过所有人。改之前先重新量。`);
      if (B.worlds <= B.msi) bad.push("颁奖夜：世界赛冠军的分不该低于 MSI");
      if (A.AWARD_TEAM_CAP !== 3) bad.push(`一阵单队席位上限成了 ${A.AWARD_TEAM_CAP}——它才是挡「都是一个战队的」那道闸，动它要先量`);
    }
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

    /* ---- 2026-09-09 玩家实锤的一批：预览和生效必须是同一个数 ---- */
    // 战队行动：卡面写的默契涨幅＝真正涨进去的（原来卡面印配置表原始值，没过收益递减）
    S.squad = { syn: 78, tac: 50 };
    const synBefore = S.squad.syn;
    const bit = A.sumBit("syn", 5.1);                       // 卡面那一小段
    const shown = parseFloat((bit.match(/\+([0-9.]+)/) || [])[1] || "0");
    A.addSquad("syn", 5.1);
    const real = +(S.squad.syn - synBefore).toFixed(1);
    if (Math.abs(shown - real) > 0.05) bad.push(`战队行动卡面虚标：写 +${shown}，实际 +${real}`);
    if (shown > 5.0) bad.push("默契 78 还印着原始值 5.1，收益递减没算进卡面");

    /* 训练卡面写的涨幅＝真正涨进去的（玩家实锤 2026-09-09：卡面「操作 +0.9」，点完涨了 1.3）。
       职业前实际走 gain × 0.85 × PRE_PACE，卡面原来只乘了 0.85，每次少报三分之一。 */
    {
      const tSnap = { step: S.step, ap: S.ap, pre: S.pre ? { ...S.pre } : null, attrs: { ...S.attrs }, career: S.career };
      const numWas0 = A.uiNum(); A.uiSetNum(true);
      // 职业前：走 preAct("train")
      if (S.pre) {
        S.career = null; S.step = "pre"; S.pre.ap = 99;
        const d0 = "操作", before0 = S.attrs[d0];
        const shown0 = parseFloat((A.costTrain(d0).match(/操作[^0-9+]*\+([0-9.]+)/) || [])[1] || "0");
        A.preAct("train", d0);
        const real0 = +(S.attrs[d0] - before0).toFixed(2);
        if (Math.abs(shown0 - real0) > 0.12) bad.push(`职业前训练卡面虚标：写 +${shown0}，实际 +${real0}`);
      }
      Object.assign(S, tSnap); if (tSnap.pre) S.pre = tSnap.pre; S.attrs = tSnap.attrs;
      A.uiSetNum(numWas0);
    }

    // 打排位：卡面写的状态涨幅＝真正涨进去的（原来漏了 ×0.5）
    const soloSnap = { week: S.week, schedule: S.schedule, step: S.step, ap: S.ap, off: S.off, form: S.form, fatigue: S.fatigue };
    S.form = 57; S.step = "season"; S.ap = 8; S.off = null; S.week = 1;
    if (!Array.isArray(S.schedule) || !S.schedule.length)
      S.schedule = S.world[S.homeLeague || "LPL"].filter((t: any) => t.name !== S.team).map((t: any) => t.name);
    const numWas = A.uiNum(); A.uiSetNum(true);      // 「数值 关」时卡面只画箭头，看不到数
    const solo = A.costSolo();
    const soloShown = parseFloat((solo.match(/状态[^0-9+−-]*[+−-]([0-9.]+)/) || [])[1] || "0");
    const soloF0 = S.form;
    A.doAction("solo");
    const soloReal = +(S.form - soloF0).toFixed(1);
    if (Math.abs(soloShown - soloReal) > 0.15) bad.push(`打排位卡面虚标：写 +${soloShown}，实际 +${soloReal}`);
    A.uiSetNum(numWas);
    Object.assign(S, soloSnap);

    // 突破弹窗报的上限＝「我的」页那一栏的上限（原来漏了经验加成）
    S.capExp = 5.5; S.events = [];
    const dim = "操作", capWant = A.capOf(dim);
    A.breakthrough(dim, 1.0, "自检", "selfcheck_cap");
    const line = (S.events || []).map((e: any) => e.text).join(" ");
    const m2 = line.match(/上限 [0-9.]+ → <b>([0-9.]+)<\/b>/);
    if (!m2) bad.push("突破没写出上限那一行");
    else if (Math.abs(parseFloat(m2[1]) - A.capOf(dim)) > 0.05)
      bad.push(`突破弹窗的上限和「我的」页对不上：弹窗 ${m2[1]}，实际 ${A.capOf(dim).toFixed(1)}（改前差一个经验加成 ${S.capExp}）`);

    // 赛后拆解读开赛那一刻的体能（原来先扣这场的体能再算账）
    if (S.match && S.match.fat0 === undefined) bad.push("比赛没有记下开赛时的体能快照 fat0");

    /* 转会轨迹只数「真的换了俱乐部」那几笔（玩家实锤 2026-09-09：只去过一个外赛区队
       就回 RNG 一人一城，名片却写转会七站）。这张表本来就记着续约、买断、升一队、下放。 */
    {
      const txBak = S.txLog;
      S.txLog = [
        { s: "S12", text: "RNG → <b>某外赛区队</b>（LCK），赛段薪资 300 万", k: "move" },
        { s: "S12", text: "与 某外赛区队 续约，赛段薪资 320 万", k: "renew" },
        { s: "S13", text: "某外赛区队 → <b>RNG</b>（LPL），赛段薪资 400 万", k: "move" },
        { s: "S13", text: "与 RNG 续约，赛段薪资 500 万", k: "renew" },
        { s: "S14", text: "与 RNG 续约，赛段薪资 700 万", k: "renew" },
        { s: "S15", text: "RNG → <b>RNG.R</b>（下放 LDL 打比赛）", k: "down" },
        { s: "S15", text: "RNG.R → <b>RNG</b>（升上一队 · 赛段薪资 700 万）", k: "up" },
      ];
      if (A.txStops() !== 3) bad.push(`转会轨迹数错了：七笔轨迹里只有两次真转会，应是 3 站，实得 ${A.txStops()} 站`);
      // 老存档没有 k，按文案回推也要得出同一个数
      S.txLog = S.txLog.map((x: any) => ({ s: x.s, text: x.text }));
      if (A.txStops() !== 3) bad.push(`老存档回推转会站数不对：应是 3 站，实得 ${A.txStops()} 站`);
      S.txLog = [{ s: "S12", text: "与 RNG 续约，赛段薪资 500 万", k: "renew" }];
      if (A.txStops() !== 0) bad.push("从没转过会却算出了站数（应显示「一队待到底」）");
      S.txLog = txBak;
    }

    // 天梯赛季重置：掉一档（作者拍板：上赛季王者，重置就变回宗师），掉到大师为止
    {
      const step = (v: number) => [A.rankName(v), A.rankName(A.rankResetTo(v))];
      const want: [number, string, string][] = [
        [100, "国服前 10", "国服前 100"],
        [90, "国服前 100", "王者"],
        [80, "王者", "宗师"],
        [65, "宗师", "大师"],
      ];
      want.forEach(([v, from, to]) => {
        const [b, a] = step(v);
        if (b !== from || a !== to) bad.push(`天梯重置没有正好掉一档：${v} 分 ${b} → ${a}（应为 ${from} → ${to}）`);
      });
      if (A.rankResetTo(44) !== 44 || A.rankResetTo(30) !== 30) bad.push("大师及以下不该动");
      if (A.rankResetTo(50) !== 44) bad.push(`大师区间内应落到大师下沿，实际 ${A.rankResetTo(50)}`);
    }
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
  /* 这一局关掉「找人聊聊」：话语权自检量的是「挂牌门槛够不够得着」，
     用的是单个固定种子。机器人是贪心花点，任何 1 点的新行动都会把 8 点的
     训练节奏挤歪，从而把这个单种子的战绩、进而把教练信任推走——那是工具的
     位移，不是挂牌门槛坏了。羁绊自己的难度对照在 --batch 那边做（240 局）。 */
  const r = playOne({ seed: 7701, strong: true, noBondTalk: true, hook: (S: any, A: any) => {
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
    bond: { talksMean: +(rs.reduce((a, r) => a + (r.bondTalks || 0), 0) / n).toFixed(1),
            matesMean: +(rs.reduce((a, r) => a + (r.bondMates || 0), 0) / n).toFixed(1),
            handoverRate: +(rs.filter(r => (r.bondHandover || 0) > 0).length / n).toFixed(3),
            passedRate: +(rs.filter(r => (r.bondPassed || 0) > 0).length / n).toFixed(3) },
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
  /* 端到端钉住赛后狠话：机器人一律跳过仪式（cerApply silver），
     也就从来没在媒体日定过「狂」——那这一整局就不该有任何一句狠话被安到头上。
     改回旧写法（只看「赢了 + 爆冷 + 30%」）跑，这里一定红。 */
  let bigTalkSeen = 0, bigTalkAt = "", evSeen = 0;
  const r = playOne({ hook: (S: any) => {
    const ev = S.events || [];
    while (evSeen < ev.length) {
      const e = ev[evSeen++] || {};
      if (/也就这样/.test(e.text || "")) { bigTalkSeen++; if (!bigTalkAt) bigTalkAt = `S${S.si} 第 ${e.w} 周`; }
    }
  }});
  console.log(JSON.stringify(r, null, 1));
  // 断言：跑不完、数值坏了都要以非零退出码失败——CI 靠这个
  const S = A.S();
  const bad = [];
  if (!r.ok) bad.push("生涯没有走到结局（step=" + S.step + "，steps=" + r.steps + "）");
  A.DIMS.forEach(d => { const v = S.attrs && S.attrs[d]; if (typeof v !== "number" || !isFinite(v) || v < 0 || v > 100) bad.push("属性异常 " + d + "=" + v); });
  if (typeof S.fatigue !== "number" || S.fatigue < 0 || S.fatigue > 100) bad.push("疲劳越界 " + S.fatigue);
  if (!r.saved) bad.push("存档没有写入");
  if (bigTalkSeen) bad.push(`这一局从没在媒体日定过「狂」，却被安了 ${bigTalkSeen} 次赛后狠话（第一次在 ${bigTalkAt}）`);
  // 外设每一档都得比上一档贵、也比上一档强（外部测评抓的：320 万的鼠标比 130 万的还弱）
  Object.keys(A.GEAR).forEach(k => A.GEAR[k].forEach((g, i) => {
    if (i === 0) return;
    const pv = A.GEAR[k][i - 1], d = Object.keys(g.e)[0];
    if (!(g.cost > pv.cost) || !((g.e[d] || 0) > (pv.e[d] || 0))) bad.push("外设反向升级 " + k + " → " + g.n);
  }));
  if (S.scaleVer !== 2 || !S.born) bad.push("新档缺少 scaleVer/born（审计 P0 回归）");
  /* ---------------- 用语自检：这是 LOL 不是足球 ----------------
   玩家点名过三次（2026-09-05「球探」、2026-09-06「球队」、2026-09-09「赢球 / 挂靴」）。
   前两次都是人工扫一遍改掉，然后新写的文案又把词带回来。这次钉一条自检：
   玩家看得见的字符串里不许出现下面这些球类词。
   跳过两处：以 // 或 * 开头的注释行（改不改都影响不到玩家），
   以及 CHANGELOG 里那两条「我们把球队改成了战队」——历史条目必须能引用原词。 */
const BALL_WORDS = ["球队", "球员", "球迷", "球星", "球场", "赢球", "输球", "打球", "挂靴", "板凳席"];
{
  const bad2: string[] = [];
  const dir = path.join(HERE, "src");
  const walk = (d: string) => fs.readdirSync(d).flatMap((f: string) => {
    const fp = path.join(d, f);
    return fs.statSync(fp).isDirectory() ? walk(fp) : (f.endsWith(".ts") ? [fp] : []);
  });
  for (const fp of walk(dir)) {
    const lines = fs.readFileSync(fp, "utf8").replace(/\r\n/g, "\n").split("\n");
    let inLog = false;
    lines.forEach((ln: string, i: number) => {
      if (/export const CHANGELOG\s*=/.test(ln)) inLog = true;
      else if (inLog && /^\];/.test(ln)) inLog = false;
      const t = ln.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;   // 注释
      if (inLog && /足球词|用语电竞化/.test(ln)) return;                            // 历史条目要能引用原词
      for (const w of BALL_WORDS) if (ln.includes(w))
        bad2.push(`${path.basename(fp)}:${i + 1} 出现「${w}」 → ${t.slice(0, 60)}`);
    });
  }
  if (bad2.length) {
    console.error("用语自检不通过（这是 LOL 不是足球）：\n - " + bad2.join("\n - "));
    process.exit(1);
  }
  console.log("用语自检通过：玩家可见文案里没有球类词");
}

/* ---------------- 赛区自检 ----------------
   玩家实锤 2026-09-09：「效力 lck 战队也能触发抗韩成就」「在 lck 效力还是触发了 lpl 事件，
   这一部分分类问题必须要检查并修改」。根子都一样：把赛区名写死在**玩家看得见的话**里，
   而那句话在任何赛区都会触发。

   所以这条自检只盯一件事：**带中文的字符串里出现了赛区名**。
   `S.homeLeague||"LPL"` 这种取名单的写法不算——那本来就是对的写法；
   `"在国际赛场上击败一支 LCK 队伍"` 这种才算。命中的必须登记在下表里并写清为什么安全
   （通常是「它的触发条件已经锁了赛区」），否则测试红。 */
/* LDL 是**结构性豁免**，不逐条登记：全世界只有一个次级联赛，而它只挂在 LPL 底下
   （main.ts 的 buildLDL：`w.LDL=buildLDL(w)`，注释写着「外赛区没有次级联赛建模——
   试训邀请只出自 LPL/LDL」）。所以「下放 LDL」「LDL 二队名单」这些话在别的赛区
   根本走不到，写死是安全的。
   这个前提一旦变了（谁给别的赛区也做了二队），下面 LDL_ONLY_STILL_TRUE 那条会先红。 */
const LDL_ONLY = /^(?:(?!\b(LPL|LCK|LEC|LCS|PCS|VCS|LJL)\b).)*$/s;
const LEAGUE_OK: Record<string, string> = {
  '{id:"beatlck", n:"抗韩成功", d:"在国际赛场上击败一支 LCK 队伍——前提是你自己不在 LCK。", tag:"战绩",':
    "cond 已锁 myLeague!==LCK",
  'd:"国际赛场上把另一支 LPL 队伍送回了家。",':
    "lpl_civil 的 cond 已锁 myLeague===LPL && oppLeague===LPL",
  '{id:"beat3lck", n:"韩流克星", d:"国际赛场上击败三支不同的 LCK 队伍。", tag:"战绩",':
    "cond 已锁 myLeague!==LCK，计数那一头（main.ts 的 lckBeaten）也锁了",
  '? `你上个月赛后采访那句话，被人剪进了「LPL 圣经」合集。`':
    "「LPL 圣经」只发给 LPL，上一行就是那个判断",
  '{q:"对面是 LCK 的队伍，他们的运营滴水不漏。",ctx:"跟他们比运营是自找的。",':
    "赛前节点，when 里已判对手是 LCK",
  '{k:"kr",   n:"韩语课",       cost:150, d:"看得懂韩援的沟通，去 LCK 打比赛不再是聋子"},':
    "语言课的说明，在哪个赛区都成立",
  '{k:"en",   n:"英语课",       cost:120, d:"LEC / LCS 的更衣室能听懂了"},':
    "同上",
  'story:"LCK 卷土重来。你刚进联赛，没人认识你。",':
    "赛季 story 讲的是世界局势（那两年 LCK 确实统治），不是你在哪个赛区",
  'story:"LCK 已经连冠两年。舆论开始说这个赛区不行了。",':
    "同上，说的是 LCK 自己连冠、别人不行，和你效力哪儿无关",
  '{sel:"#pin", t:"实力条", d:"你的水平和本周剩下的行动点。默认用文字描述：生疏 → 入门 → 扎实 → 精通 → 职业级 → 顶尖 → 世界级（职业级 ≈ LPL 首发）。想看具体数字，点右边的「数值」。"},':
    "实力尺的锚点本来就是 LPL（REGION_ANCHOR 里 LPL=70 是基准），这是在解释尺子怎么读，不是在讲你在哪打",
  'text: "<b>实力尺顶端拉开</b>：全世界与你的属性整体 +5——LPL 首发整体进国服前 100、明星 85-90、你的上限抬到 95+。所有差值不变，比赛胜率一分没动。" });':
    "同上，老档迁移时解释新尺子怎么读；LPL 首发是这把尺的刻度说明",
  ':lck?"LCK 又一次站在了最高处。":"你在屏幕外看完了颁奖。"}`,':
    "上一行的 own 已经把「自家赛区夺冠」分出去了",
  'beatLCK?`决赛击败 LCK 的 ${S.match.oppName}——<b>至暗时刻的墙，被你砸开了一道口子。</b>`:""}`,':
    "beatLCK 已锁 homeLeague!==LCK",
  '?`决赛击败 LCK 的 <b>${c.opp}</b>——至暗时刻的墙，被你砸开了一道口子。`':
    "同上，c.beatLCK 由上面那个变量算出来",
};
{
  const bad3: string[] = [];
  const dir = path.join(HERE, "src");
  const walk = (d: string) => fs.readdirSync(d).flatMap((f: string) => {
    const fp = path.join(d, f);
    return fs.statSync(fp).isDirectory() ? walk(fp) : (f.endsWith(".ts") ? [fp] : []);
  });
  /* 二改（玩家实锤 2026-09-09：在 T1 拿了联赛冠军，结算卡的标签却写「LPL 冠军」）。
     第一版是**白名单**——只查十六个「内容文件」，理由写的是「main.ts 里的是尺子与
     更新日志」。这条理由是错的：main.ts 里除了尺子和日志，还画着结算卡、HUD、
     赛程、结局名片一大堆玩家看得见的字，那句写死的「LPL 冠军」就在里面，
     整整躲过了上一轮排查。
     现在反过来做**黑名单**：默认全查，只放过两类——
     ① 史实数据表（data / stars / eras）：那里的「LPL 2019 春季冠军」是真人真事；
     ② main.ts 里的 CHANGELOG 数组：更新日志记的是当时发生了什么，不是活文案。 */
  const SKIP_FILES = ["data.ts", "stars.ts", "eras.ts"];
  const LEAGUES = /\b(LPL|LCK|LEC|LCS|PCS|VCS|LJL|LDL)\b/;
  const CJK = /[\u4e00-\u9fff]/;
  for (const fp of walk(dir)) {
    const base = path.basename(fp);
    if (SKIP_FILES.includes(base) || fp.includes(path.sep + "gen" + path.sep)) continue;
    const raw = fs.readFileSync(fp, "utf8").replace(/\r\n/g, "\n");
    const lines = raw.split("\n");
    // 更新日志那一段整块跳过：它是「当时上线了什么」的记录，不是活文案
    let logFrom = -1, logTo = -1;
    const logHead = raw.indexOf("export const CHANGELOG=[");
    if (logHead >= 0) {
      logFrom = raw.slice(0, logHead).split("\n").length - 1;
      const logEnd = raw.indexOf("\n];", logHead);
      logTo = logEnd < 0 ? lines.length : raw.slice(0, logEnd).split("\n").length;
    }
    let inBlock = false;
    lines.forEach((ln: string, i: number) => {
      if (logFrom >= 0 && i >= logFrom && i <= logTo) return;
      const t = ln.trim();
      if (inBlock) { if (ln.includes("*/")) inBlock = false; return; }
      if (t.startsWith("//")) return;
      if (t.startsWith("/*")) { if (!ln.includes("*/")) inBlock = true; return; }
      // 模板里的 ${...} 是代码不是文案，先挖掉
      const src = ln.replace(/\$\{[^}]*\}/g, "");
      // 取出这一行里所有字符串字面量
      const segs = src.match(/"[^"]*"|'[^']*'|`[^`]*`/g) || [];
      if (!segs.some(g => LEAGUES.test(g) && CJK.test(g))) return;
      if (LEAGUE_OK[t] !== undefined) return;
      // 整行只提到 LDL：见上面 LDL_ONLY 那段——它只存在于 LPL 底下，别的赛区走不到
      if (/\bLDL\b/.test(src) && LDL_ONLY.test(src)) return;
      bad3.push(`${path.basename(fp)}:${i + 1} 中文文案里写死了赛区名 → ${t.slice(0, 76)}`);
    });
  }
  if (bad3.length) {
    console.error("赛区自检不通过（写死的赛区名会在别的赛区穿帮）：\n - " + bad3.join("\n - ")
      + "\n   要么给它加赛区判断，要么连同理由登记进 test.ts 的 LEAGUE_OK。");
    process.exit(1);
  }
  /* LDL 豁免的前提绊线：全世界仍然只有 LDL 一个次级联赛，而且它只挂在 LPL 底下。
     谁哪天给别的赛区也做了二队，这里先红——那时上面那些「下放 LDL」的话就得改。 */
  {
    const lgs = Object.keys(A.S().world || {});
    const known = ["LPL", "LCK", "LEC", "LCS", "PCS", "VCS", "LJL", "LLA", "CBLOL", "LCO", "TCL", "LDL"];
    const extra = lgs.filter(l => !known.includes(l));
    if (extra.length) {
      console.error("赛区自检：世界里多出了没登记的联赛 " + extra.join(" / ")
        + "\n   如果其中有次级联赛，test.ts 里 LDL 的结构性豁免就不再成立，那些「下放 LDL」的文案要改。");
      process.exit(1);
    }
  }
  console.log("赛区自检通过：中文文案里没有没登记的赛区硬编码（LDL 走结构性豁免，前提已核）");
}

if (bad.length) { console.error("自检失败：\n - " + bad.join("\n - ")); process.exit(1); }
  console.log("自检通过");
}
