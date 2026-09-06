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

/* 把所有模块的导出合成一个 API 对象（原来 __api 那张手写名单） */
const MODULES = ["state", "data", "main", "intl", "team", "rivals", "rankart", "rankicon", "avatar", "shop", "origins", "achieve_more", "achieve", "squad", "random", "form", "postmatch", "boxscore", "injury", "rotation", "clout", "routine", "auto", "quest", "trait", "nodes", "cup", "save", "tryout", "press", "audio", "stats", "stars", "market"];
const state = await import("./src/state.ts");
const mods = await Promise.all(MODULES.map(m => import(`./src/${m}.ts`)));
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
  const tierYears: Record<string, number> = {};   // 每个赛季结算时所在俱乐部的档次
  let signups = 0, cupMatches = 0, preps = 0, cupPick = 0;
  let invites = 0, tryPick = 0, dealPick = 0, transfers = 0, renewTalks = 0;
  let maxRank = 0, scrims = 0, trials = 0, trialWins = 0, mateInj = 0, benchWeeks = 0, _trialOn = false, _injOn = false;
  const cupRuns = [], grades = [], deals = [];
  while (A.S().step !== "end" && guard++ < 40000) {
    S = A.S();
    if (S.step === "pre" && S.pre) lastPreWeek = S.pre.week;
    if (S.intl && S.intl.type === "worlds") worldsSeen.add(S.si);
    if (S.intl && S.intl.type === "msi") msiSeen.add(S.si);
    if (S.step === "offseason" && !S.off && S.career && S.contract) { const k = S.contract.clubTier || S.contract.tier || "?"; tierYears[S.si + ":" + k] = 1; }
    if (S.step === "pre" && S.pre && preYears === 0 && !w1 && S.pre.week >= A.WND_OPEN) {
      const av = A.DIMS.reduce((a: number, d: string) => a + S.attrs[d], 0) / A.DIMS.length;
      w1 = { rank: Math.round(S.pre.rank * 10) / 10, fans: Math.round(S.fans), score: Math.round(A.preScore()), attrs: Math.round(av * 10) / 10, fat: Math.round(S.fatigue) };
    }
    if (!signAt && S.career) { signAt = preYears * A.PRE_YEAR + lastPreWeek; signRank = Math.round(((S.pre && S.pre.rank) || 0) * 10) / 10; signFans = Math.round(S.fans || 0); }
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
      if (S.match.node) A.resolveNode(1);
      else if (S.match.done) A.nextWeek();
      else A.playGame();
    } else if (S.step === "offseason") {
      // 休赛期现在是可玩的几周：先把结算页点掉，再把每周的行动点用完
      if (!S.off) { if (opts.encore && S.si === A.BASE_LAST && !S.extended) A.encore(); else A.doOffseason(); continue; }
      // 合同到期续约：测试里默认接受（留在想留你的队）；opts.declineRenew 走「拒绝进市场」
      if (S.pendingRenew && !S.deal) {
        if (opts.declineRenew) A.declineRenew();
        else if (opts.negotiateRenew) { renewTalks++; A.renewNegotiate(); }   // 谈一轮再签（覆盖谈判/谈崩两条路）
        else A.acceptRenew();
        continue;
      }
      // 自由身桌上的邀请：先谈第一家（opts.noOffers 一律回绝）
      if (S.faOffers && S.faOffers.length && !S.proOffer && !S.tryout && !S.deal) { if (opts.noOffers) A.dropFaOffer(0); else { transfers++; A.takeFaOffer(0); } continue; }
      // 有队来挖：表现好就走人（测试里一律接受，用来量频率）；opts.noOffers 一律回绝（逼出自由身没人签）
      if (S.proOffer) { if (opts.noOffers) { A.dropProOffer(); } else { transfers++; A.takeProOffer(); } continue; }
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
    tiers: Object.keys(tierYears).map(k => k.split(":")[1]),
    attrsAvg: +(A.DIMS.reduce((a: number, d: string) => a + S.attrs[d], 0) / A.DIMS.length).toFixed(1),
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
  return bad;
}

export { playOne, unitChecks, A, SEED };

/* 批测：npx tsx demo/test.ts --batch 30
   固定种子 1..N 各跑一局，只打统计不做断言。用来校准职业前压缩（20→14 周）前后的上岸节奏：
   一年内上岸率、上岸周数 p50/p90、上岸时段位读数、结局分布——改前改后各跑一次对比。 */
function batch(n: number, encore = false, strong = false) {
  const rs = [];
  for (let i = 1; i <= n; i++) { rs.push(playOne({ seed: 1000 + i, encore, strong })); process.stderr.write("."); }
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
    // 冠军率的病因：队伍档次、世界排名、你的属性、进过几次国际赛、走到多深
    end: (() => { const m = (f: (r: any) => number) => +(rs.reduce((a, r) => a + (f(r) || 0), 0) / n).toFixed(2);
      const tiers: Record<string, number> = {}; rs.forEach(r => (r.tiers || []).forEach((t: string) => { tiers[t] = (tiers[t] || 0) + 1; }));
      const depth: Record<string, number> = {}; rs.forEach(r => { depth[String(r.bestIntl)] = (depth[String(r.bestIntl)] || 0) + 1; });
      return { attrsAvg: m(r => r.attrsAvg), myTeamPower: m(r => r.teamGap && r.teamGap.mine), worldTop1: m(r => r.teamGap && r.teamGap.top1), worldTop8: m(r => r.teamGap && r.teamGap.top8),
        teamWorldRank: m(r => r.teamGap && r.teamGap.worldRank), teamLgRank: m(r => r.teamGap && r.teamGap.lgRank), inWorldTop8: +(rs.filter(r => r.teamGap && r.teamGap.worldRank > 0 && r.teamGap.worldRank <= 8).length / n).toFixed(2),
        worldsApps: m(r => r.worldsApps), msiApps: m(r => r.msiApps), bestIntlDist: depth, bestRankMean: m(r => r.bestRank), tierSeasons: tiers }; })(),
    endings: count(r => r.ending),
    titlesMean: +(rs.reduce((a, r) => a + r.titles.length, 0) / n).toFixed(2),
    // 夺冠概率：任一冠军 / 联赛 / MSI / 世界赛 / 破局者（MSI+世界赛各一）/ 两冠 / 三连（王朝）
    rates: (() => { const f = (g: (r: any) => boolean) => +(rs.filter(g).length / n).toFixed(3); return {
      anyTitle: f(r => r.titles.length > 0), league: f(r => r.lg > 0), msi: f(r => r.msi > 0), worlds: f(r => r.worlds > 0),
      worlds2: f(r => r.worlds >= 2), breaker: f(r => r.msi > 0 && r.worlds > 0), dynasty: f(r => r.streak >= 3),
      legend: f(r => r.ending === "传奇"), extended: f(r => r.extended) }; })(),
    stepsMean: Math.round(rs.reduce((a, r) => a + r.steps, 0) / n),
  }, null, 1));
}

if (isMain && process.argv.includes("--batch")) {
  const i = process.argv.indexOf("--batch");
  batch(parseInt(process.argv[i + 1] || "20", 10) || 20, process.argv.includes("--encore"), process.argv.includes("--strong"));   // --encore：五年到了一律再战；--strong：强玩家
} else if (isMain) {
  console.log("随机种子：", SEED, "（SEED=" + SEED + " npm test 可原样重放）");
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
