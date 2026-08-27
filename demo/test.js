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

const code = m[1];
try {
  new Function(code + "\n;globalThis.__api={S:()=>S,SEASONS,SPLITS,DIMS,AGES,BACKGROUNDS,ACHIEVEMENTS,RANKS,"
    + "GEAR,SLOTS,COURSES,RELAX,SPEND,screenCreate,startPre,preAct,preNextWeek,acceptOffer,"
    + "doTrain,doAction,startMatch,resolveNode,playGame,nextWeek,doOffseason,isBenched,benchWeek,"
    + "resolveLocker,ending,cap,rankFull,rankIcon,fameTier,scoutTier,preScore,hasAch,"
    + "buyGear,buyCourse,buyRelax,gearBonus,streamIncome,drawBackgrounds,advancePreWeek,capOf,"
    + "soloSkill,soloWinP,rankReq,doSquad,SQUAD_ACTS,squadOf,PRE_MILESTONES,"
    + "resolveRandom,btkNote,BREAK_PATHS,buffVal,squadBreakdown,myRoster,power,SEASONS,formOf,runPlan,repeatLast,savePlan,cloutOf,coachTrust,mgrTrust,canList,canSign,doList,doSign,signTargets,relOf,setS:(v)=>{S=v}};")();
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
  while (A.S().step !== "end" && guard++ < 40000) {
    S = A.S();
    if (S.rankUp) { rankUps++; S.rankUp = null; continue; }
    if (S.rndEv) { A.resolveRandom(0); continue; }
    if (S.signup) {                       // 报名弹窗：钱够就报
      const mm = S.signup; S.signup = null;
      if (S.money >= mm.fee) { S.money -= mm.fee; mm.run(); }
      A.advancePreWeek(); continue;
    }
    if (S.locker) { lockers++; A.resolveLocker(0); continue; }
    if (S.step === "pre") {
      if (S.pre.ap > 0) {
        if (S.fatigue > 75) A.preAct("rest");
        else A.preAct(S.pre.week % 4 === 0 ? "stream" : "rank");
      } else { const w = S.pre.week; A.preNextWeek(); if (A.S().pre && A.S().pre.week < w) preYears++; }
    } else if (S.step === "offer") {
      A.acceptOffer(0);
    } else if (S.step === "season") {
      for (const x of A.SPEND) if (S.money >= x.cost && !(S.buff && S.buff[x.k])) { S.money -= x.cost; x.run(); break; }
      if (S.ap > 0) {
        const av = A.DIMS.filter(d => S.attrs[d] < A.capOf(d));
        if (S.fatigue > 70) A.doAction("rest");
        else if (av.length) A.doTrain(av[0]);
        else A.doAction("stream");
      } else { A.isBenched() ? A.benchWeek() : A.startMatch(false); }
    } else if (S.step === "match") {
      if (S.match.node) A.resolveNode(1);
      else if (S.match.done) A.nextWeek();
      else A.playGame();
    } else if (S.step === "offseason") A.doOffseason();
  }
  S = A.S();
  return {
    ok: S.step === "end", steps: guard, preYears, rankUps, lockers,
    team: S.team || "未签约", age: S.age,
    ach: A.ACHIEVEMENTS.filter(a => A.hasAch(a.id)).map(a => a.n),
    ending: A.ending().n,
    money: Math.round(S.money), fame: A.fameTier(),
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
