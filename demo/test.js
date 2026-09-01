/* 无头测试：把 career.html 里的 <script> 抽出来，在 Node 里跑完整生涯。
   文件已经太大，浏览器预览面板的 data URL 装不下，所以改用这个。 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "career.html"), "utf8");
// 文件已经很大，正则回溯会爆栈——用 indexOf 切
const a = html.indexOf("<script>"), b = html.lastIndexOf("</script>");
if (a < 0 || b < 0) { console.error("找不到 script"); process.exit(1); }
const m = [null, html.slice(a + 8, b)];

/* 极简 DOM 桩：游戏只用到 innerHTML / querySelectorAll / onclick */
function makeEl() {
  const el = {
    innerHTML: "", innerText: "", value: "", dataset: {}, classList: {
      add() {}, remove() {}, contains() { return false; }
    },
    querySelectorAll() { return []; }, querySelector() { return null; },
    onclick: null, click() {}
  };
  return el;
}
const stage = makeEl(), hud = makeEl();
global.document = {
  getElementById(id) { return id === "stage" ? stage : id === "hud" ? hud : null; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return makeEl(); }
};
global.window = global;
/* localStorage 桩——存档模块全程被 try/catch 包着，
   没有桩的话它会静默失败，等于没测。 */
const _ls = {};
global.localStorage = {
  getItem(k){ return k in _ls ? _ls[k] : null; },
  setItem(k, v){ _ls[k] = String(v); },
  removeItem(k){ delete _ls[k]; }
};
global.alert = () => {};

const code = m[1];
try {
  new Function(code + "\n;globalThis.__api={S:()=>S,SEASONS,SPLITS,DIMS,AGES,BACKGROUNDS,ACHIEVEMENTS,RANKS,"
    + "GEAR,SLOTS,COURSES,RELAX,SPEND,screenCreate,startPre,preAct,preNextWeek,acceptOffer,"
    + "doTrain,doAction,startMatch,resolveNode,playGame,nextWeek,doOffseason,offNextWeek,prepGo,enterPrep,finishOffseason,OFF_WEEKS,isBenched,benchWeek,"
    + "resolveLocker,ending,cap,rankFull,nowLabel,nowPhase,yearWeek,yearTotal,rankIcon,fanTier,scoutTier,preScore,hasAch,pickClub,power,ageWorld,myTeam,myRoster,leagueBaseline,fanCap,fanFill,fansWan,fansText,fanWeek,addFans,heatTier,fanToNext,"
    + "buyGear,buyCourse,buyRelax,gearBonus,streamIncome,drawBackgrounds,advancePreWeek,capOf,"
    + "soloSkill,soloWinP,rankReq,doSquad,SQUAD_ACTS,squadOf,PRE_MILESTONES,nextMilestone,"
    + "askTransfer,canAskTransfer,askTransferOdds,canBuyout,doBuyout,checkStreamBiz,streamDealCard,streamPushMul,signStreamDeal,declineStreamDeal,fireWeekEvents,clubPlatform,streamClauseCheck,worldsSlot,spectateIntl,startIntl,startPlayoff,endSeason,"
    + "pmReplayCard,postMatchCard,pmLuckLines,pmNodesHtml,viewMatch,attribute,"
    + "preTransferPage,selfRecommend,selfRecOdds,canSelfRec,pickForeignScout,addInvite,queueInvite,checkTryoutInvite,inviteCard,"
    + "resolveRandom,btkNote,BREAK_PATHS,sweepBreakthroughs,btkWeekEnd,breakthrough,capMechOf,capMileOf,intlChampCard,quickPlan,quickBtn,transferPage,acceptPromote,askPromoteRaise,declinePromote,promoteDealCard,promoteRaiseOdds,patchNoteCard,miniPatchAdj,miniPatchTick,roleCard,careerCard,tryoutDays,fixLegacyForeignAch,checkAch,hasAch,skillToRank,rankToSkill,REGION_ANCHOR,REGION_STYLE,anchorLeague,fixScaleV2,cloneWorld,approachTargets,approachOdds,canApproach,approachTeam,txWindowOpen,transferBudget,resumeCap,rankCap,fitTier,exposureCap,weeklyEcho,queueFollowUp,tickFollowUps,FOLLOWUPS,pressIssue,pressCard,followUpCard,ladderEncounter,starPool,noteRivalBeat,beatCount,scoutCard,doContent,contentCard,CONTENT_KINDS,bizWeek,buyAsset,ASSETS,assetsCard,dataCard,tiltDrag,tiltNote,buffVal,squadBreakdown,myRoster,power,SEASONS,formOf,runPlan,repeatLast,savePlan,cloutOf,coachTrust,mgrTrust,canList,canSign,doList,doSign,signTargets,relOf,checkMateExit,teamTenure,trustOf,disruptSynergy,proPerf,rollProOffers,checkPromote,parentClub,buildLDL,takeProOffer,dropProOffer,makeProDeal,signTransfer,enterCup,cupOf,activeCups,cupPrep,startCupMatch,resolveCupNode,cupTick,CUPS,dueCups,forfeitCup,cupOppName,cupRoundName,cupReachName,poRoundName,cupMyPower,cupOppPower,cupDismissMatch,saveGame,loadGame,readSave,dropSave,hasSave,escapeHtml,safeName,runActs,pendingActs,autoRest,autoStop,TRAITS,TRAIT_NEED,TRAIT_OPP,traitHas,traitMul,addTraitPt,traitProgress,traitBar,QUEST_KINDS,addQuest,questWeek,questCard,questNote,questWin,evPickTeam,evRosterChange,evMakeRival,AUTO_KEYS,autoOn,autoSet,autoToggleAll,autoOnce,autoSweep,autoStep,autoBuy,autoBiz,autoDaily,autoCareerStep,autoAnyOn,tryoutSkill,checkTryoutInvite,checkRankInvite,addInvite,startTryout,resolveTryoutDay,tryoutGrade,endTryout,makeDeal,askDeal,signDeal,dropDeal,declineDeal,afterTryout,dealLeverage,CLUB_TIERS,DEAL_TIERS,TIER_RANK,rankCap,pickForeign,makeProDeal,buyoutDrag,canInvite,fitTier,exposureCap,exposureScore,inviteFloorOk,PRE_MILESTONES,nextMilestone,PRE_EARLIEST,preNextWeek,TRYOUT_DAYS,DEAL_ASKS,salaryOf,contractCheck,consumeOffer,preNextYear,setS:(v)=>{S=v}};")();
} catch (e) {
  console.error("脚本解析失败:", e.message);
  process.exit(1);
}
const A = globalThis.__api;
module.exports = A;

/* ---------------- 跑一局完整生涯 ---------------- */
function playOne(opts) {
  opts = opts || {};
  A.screenCreate();
  let S = A.S();
  S.name = "T"; S.pos = opts.pos || "mid"; S.origin = opts.origin || "academy";
  S.ageIdx = opts.ageIdx === undefined ? 1 : opts.ageIdx;
  S.bgPick = S.bgOffer[0].k;
  S.talent = Object.assign({}, opts.talent || { 操作: 7, 运营: 5, 心态: 4, 指挥: 2, 体质: 2 });
  A.startPre();
  S = A.S();

  let guard = 0, preYears = 0, rankUps = 0, lockers = 0;
  let signups = 0, cupMatches = 0, preps = 0, cupPick = 0;
  let invites = 0, tryPick = 0, dealPick = 0, transfers = 0;
  const cupRuns = [], grades = [], deals = [];
  while (A.S().step !== "end" && guard++ < 40000) {
    S = A.S();
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
      invites++;
      A.startTryout(iv.tier, iv.team, iv.expect);   // 来了就去，测试要覆盖到
      continue;
    }
    if (S.tryout) {
      const t = S.tryout;
      if (t.done) { grades.push(t.result.g); A.afterTryout(); }
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
      if (d.transfer) A.signTransfer(); else A.signDeal();
      continue;
    }
    if (S.step === "pre") {
      // 本周有到点的杯赛就先打——这是新赛程流程的主路径
      const due = A.activeCups().find(c => c.nextWeek <= S.pre.week);
      if (due) { cupMatches++; A.startCupMatch(due.kind); continue; }
      if (S.pre.ap > 0) {
        // 备战改成真的练队：赛前两周做战队行动（默契/战术直接乘进赛事战力）
        const soon = A.activeCups().find(c => c.nextWeek - S.pre.week <= 2);
        if (soon && S.fatigue < 70 && S.pre.mates && S.pre.mates.length) {
          preps++; A.doSquad(["scrim", "vod", "drill", "duo"][preps % 4]);
        }
        else if (S.fatigue > 75) A.preAct("rest");
        else A.preAct(S.pre.week % 4 === 0 ? "stream" : "rank");
      } else { const w = S.pre.week; A.preNextWeek(); if (A.S().pre && A.S().pre.week < w) preYears++; }
    } else if (S.step === "offer") {
      // 年末报价现在也只是试训机会
      const idx = S.pre.offers.findIndex(o => !o.used);
      if (idx < 0) { S.step = "pre"; A.preNextYear(); continue; }   // 都试过了，再练一年
      const of = S.pre.offers[idx];
      const tier = { sub:"top", foreign:"top", start:"mid", core:"low" }[of.k] || "mid";
      A.startTryout(tier, of.team, A.CLUB_TIERS[tier].expect);
    } else if (S.step === "season") {
      for (const x of A.SPEND) if (S.money >= x.cost && !(S.buff && S.buff[x.k])) { S.money -= x.cost; x.run(); break; }
      if (S.ap > 0) {
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 70) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("stream");
      } else { A.isBenched() ? A.benchWeek() : A.startMatch(false); }
    } else if (S.step === "prep") {
      // 淘汰赛之间的备战：把行动点用掉再上场
      if (S.ap > 0) {
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 55) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("solo");
      } else A.prepGo();
    } else if (S.step === "match") {
      if (S.match.node) A.resolveNode(1);
      else if (S.match.done) A.nextWeek();
      else A.playGame();
    } else if (S.step === "offseason") {
      // 休赛期现在是可玩的几周：先把结算页点掉，再把每周的行动点用完
      if (!S.off) { A.doOffseason(); continue; }
      // 有队来挖：表现好就走人（测试里一律接受，用来量频率）
      if (S.proOffer) { transfers++; A.takeProOffer(); continue; }
      if (S.tryout) { const t=S.tryout; if(t.done) A.afterTryout(); else A.resolveTryoutDay(1); continue; }
      if (S.deal) { if(S.deal.transfer) A.signTransfer(); else A.signDeal(); continue; }
      if (S.ap > 0) {
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 70) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("solo");
      } else A.offNextWeek();
    }
  }
  S = A.S();
  return {
    ok: S.step === "end", steps: guard, preYears, rankUps, lockers,
    signups, cupMatches, preps, cupRuns,
    invites, grades, deals, transfers,
    contract: S.contract && S.contract.salary !== undefined ? S.contract : null,
    saved: A.hasSave(),
    team: S.team || "未签约", age: S.age,
    ach: A.ACHIEVEMENTS.filter(a => A.hasAch(a.id)).map(a => a.n),
    ending: A.ending().n,
    money: Math.round(S.money), fame: A.fanTier(),
    fans: Math.round(S.fans), heat: Math.round(S.heat||0),
    titles: (S.career && S.career.titles) || [],
    events: (S.events || []).length
  };
}
module.exports.playOne = playOne;

if (require.main === module) {
  console.log("模块自检：赛季", A.SEASONS.length, "| 背景", A.BACKGROUNDS.length,
    "| 成就", A.ACHIEVEMENTS.length, "| 年龄", A.AGES.length, "| 段位", A.RANKS.length);
  const r = playOne();
  console.log(JSON.stringify(r, null, 1));
}
