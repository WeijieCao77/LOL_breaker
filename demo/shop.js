/* ================= 财务 =================

   钱从来不少，但一直是哑巴：比赛每胜一场其实发 9 万、输了也有 4 万
   出场费，界面从没提过；冠军的钱靠一次性成就发，第二次夺冠分文没有；
   每赛段挣了多少花了多少，没有任何地方能看。

   现在立两条规矩：
   · 所有钱的进出走 addMoney() 一个口——顺带记进 S.ledger 流水，
     以后再也不可能出现「发了钱不吭声」的隐形收入。
   · 赛事奖金是制度不是彩蛋：走到哪一档发哪一档，每次都发（见 PRIZE_*），
     原来顶着奖金名义的一次性成就奖励相应减半。                       */

const LEDGER_IN =[["salary","工资"],["match","比赛收入"],["stream","直播"],
                  ["prize","赛事奖金"],["sign","签字费"],["ach","成就奖励"],["other","其他收入"]];
const LEDGER_OUT=[["gear","装备"],["course","课程"],["relax","放松"],["team","团队投入"],
                  ["home","寄回家"],["fee","报名费"],["other","其他开销"]];
function _emptyLedger(){ return {in:{},out:{}}; }
function initLedger(){
  S.ledger={cur:_emptyLedger(),prev:null,label:(typeof nowLabel==="function")?nowLabel():"",prevLabel:""};
}
/* 唯一的进出账入口。n 为正是收入、为负是支出；kind 对应上面两张表的键。 */
function addMoney(kind,n){
  n=Math.round(n||0);
  if(!n) return 0;
  if(!S.ledger) initLedger();
  S.money=(S.money||0)+n;
  const side=n>0?S.ledger.cur.in:S.ledger.cur.out;
  side[kind]=(side[kind]||0)+Math.abs(n);
  return n;
}
/* 赛段边界：本赛段流水归档成「上赛段」，重新开账 */
function ledgerRotate(){
  if(!S.ledger) { initLedger(); return; }
  S.ledger.prev=S.ledger.cur;
  S.ledger.prevLabel=S.ledger.label;
  S.ledger.cur=_emptyLedger();
  S.ledger.label=(typeof nowLabel==="function")?nowLabel():"";
}
function _ledgerSum(o){ return Object.values(o||{}).reduce((a,b)=>a+b,0); }

/* ---------- 赛事奖金表（稳健档，到档就发、取最高档、每次都发） ----------
   2026-08-31 经济重锚：LPL 冠军 200 万本来就贴现实，不动；
   国际赛按「个人分成」口径下调 ~30%，LDL 减半——次级联赛的钱就是少。 */
const PRIZE_PO    ={champion:200, runner:80, semi:40};
const PRIZE_PO_LDL={champion:20,  runner:8,  semi:0};
const PRIZE_MSI   ={main:40, knock:100, final:180, champion:350};
const PRIZE_W     ={playin:30, main:60, knock:100, semi:180, final:280, champion:550};

/* ---------- 财务总览卡 ---------- */
function financeCard(){
  const led=S.ledger||{cur:_emptyLedger()};
  const cur=led.cur||_emptyLedger();
  const inSum=_ledgerSum(cur.in), outSum=_ledgerSum(cur.out), net=inSum-outSum;
  const pnet=led.prev?_ledgerSum(led.prev.in)-_ledgerSum(led.prev.out):null;
  const row=(n,v,dn)=>`<div class="fin-r"><span>${n}</span>
    <span class="mono ${dn?'dn':'up'}">${dn?"−":"+"}${v}</span></div>`;
  const rows=LEDGER_IN.filter(([k])=>cur.in[k]).map(([k,n])=>row(n,cur.in[k],false)).join("")
           + LEDGER_OUT.filter(([k])=>cur.out[k]).map(([k,n])=>row(n,cur.out[k],true)).join("");
  return `<div class="card"><h2>财务总览<em>${led.label||""}</em></h2>
    <div class="fin-cash mono">${Math.round(S.money)}<small> 万</small></div>
    ${S.career&&typeof salaryOf==="function"
      ?`<p class="note" style="margin:2px 0 10px">下赛段工资预计 <b>${salaryOf()} 万</b>（合同年薪 ${(S.contract&&S.contract.salary)||"—"} ＋ 人气与荣誉浮动）</p>`:""}
    ${rows?`<div class="fin-tab">${rows}
      <div class="fin-r fin-net"><span>本赛段净</span>
        <span class="mono ${net>=0?'up':'dn'}">${net>=0?"+":"−"}${Math.abs(net)}</span></div></div>`
      :`<p class="note">本赛段还没有进出账。</p>`}
    ${pnet!==null?`<p class="note">上赛段（${led.prevLabel||"—"}）净 ${pnet>=0?"+":"−"}${Math.abs(pnet)} 万。</p>`:""}
    <p class="note">每一笔进出都记在这里，明细在大事记里能对上账。</p></div>`;
}
/* ---------- 奖金标准：固定数值，小表格放底部，不抢戏 ---------- */
function prizeNote(){
  return `<div class="card"><h2>奖金标准<em>固定数值 · 到档就发</em></h2>
    <div class="tw"><table style="font-size:12.5px">
      <tr><th>赛事</th><th>标准（万）</th></tr>
      <tr><td>常规赛</td><td class="n">胜场 9 · 出场费 4</td></tr>
      <tr><td>季后赛</td><td class="n">四强 40 · 亚军 80 · 冠军 200（LDL 冠军 40）</td></tr>
      <tr><td>MSI</td><td class="n">参赛 60 · 淘汰赛 150 · 亚军 250 · 冠军 500</td></tr>
      <tr><td>世界赛</td><td class="n">入围 40 · 正赛 80 · 八强 150 · 四强 250 · 亚军 400 · 冠军 800</td></tr>
    </table></div>
    <p class="note">国际赛按走到的最高档发放，不叠加；每次参赛都发，不是一次性的。
      首次夺冠另有成就奖励。</p></div>`;
}

/* ================= 商城 · 装备 · 课程 · 经济 =================
   收入：薪资（赛段结算）+ 直播打赏（名气越高越多）+ 夺冠奖金
   支出：外设（永久装备，5 个槽）/ 课程（永久解锁）/ 放松（花钱换体力，省行动点）
   核心设计：有钱可以用钱买回时间——不用把行动点浪费在休息上。          */

const SLOTS=[
  {k:"mouse", n:"鼠标"},
  {k:"kb",    n:"键盘"},
  {k:"mon",   n:"显示器"},
  {k:"hs",    n:"耳机"},
  {k:"chair", n:"座椅"}
];
const TIER_N=["入门","进阶","职业","定制"];

/* 型号取自公开的职业选手外设资料 */
const GEAR={
  mouse:[
    {n:"雷蛇 DeathAdder Essential", cost:0,   t:0, e:{操作:0}},
    {n:"罗技 G102",                cost:30,  t:1, e:{操作:0.8}},
    {n:"罗技 G Pro X Superlight",  cost:130, t:2, e:{操作:1.9}},
    {n:"罗技 G PRO 2 Lightspeed",  cost:320, t:3, e:{操作:1.7}}
  ],
  kb:[
    {n:"杂牌薄膜键盘",              cost:0,   t:0, e:{操作:0}},
    {n:"罗技 G512",                cost:35,  t:1, e:{操作:0.7}},
    {n:"罗技 G Pro X TKL RAPID",   cost:140, t:2, e:{操作:1.7}},
    {n:"Wooting 60HE",             cost:310, t:3, e:{操作:2.9}}
  ],
  mon:[
    {n:"公司发的 60Hz 屏",          cost:0,   t:0, e:{运营:0}},
    {n:"AOC 24G2 144Hz",           cost:45,  t:1, e:{运营:0.8}},
    {n:"ZOWIE XL2546K 240Hz",      cost:165, t:2, e:{运营:1.8}},
    {n:"Alienware AW2524H 500Hz",  cost:380, t:3, e:{运营:3.1}}
  ],
  hs:[
    {n:"路边买的耳麦",              cost:0,   t:0, e:{运营:0}},
    {n:"HyperX Cloud II",          cost:40,  t:1, e:{运营:0.7}},
    {n:"罗技 G Pro X",             cost:125, t:2, e:{运营:1.5}},
    {n:"拜亚 DT1990 Pro + 声卡",    cost:350, t:3, e:{运营:2.6}}
  ],
  chair:[
    {n:"宿舍的旧转椅",              cost:0,   t:0, e:{体质:0}},
    {n:"DXRacer 电竞椅",           cost:50,  t:1, e:{体质:0.9}},
    {n:"Secretlab TITAN Evo",      cost:170, t:2, e:{体质:1.9}},
    {n:"Herman Miller Embody",     cost:410, t:3, e:{体质:3.3}}
  ]
};

/* 课程：一次性买断，永久生效 */
const COURSES=[
  {k:"kr",   n:"韩语课",       cost:150, d:"看得懂韩援的沟通，去 LCK 打球不再是聋子"},
  {k:"en",   n:"英语课",       cost:120, d:"LEC / LCS 的更衣室能听懂了"},
  {k:"psy",  n:"运动心理课",   cost:190, d:"心态训练效率提升"},
  {k:"vod",  n:"复盘方法课",   cost:180, d:"运营训练效率提升"},
  {k:"comm", n:"沟通表达课",   cost:140, d:"队友信任涨得更快"}
];

/* 放松：花钱换体力，不占行动点 */
const RELAX=[
  {k:"massage", n:"按摩 90 分钟", cost:12,  fat:-18, d:"当天就能缓过来"},
  {k:"physio2", n:"专业理疗",     cost:28,  fat:-34, d:"手腕和肩颈都做一遍"},
  {k:"hotpot",  n:"约队友吃火锅", cost:22,  fat:-22, trust:7, d:"体力和关系一起补"},
  {k:"trip",    n:"短途度假",     cost:65,  fat:-60, d:"彻底断网两天"}
];

function initShop(){
  S.gear={}; SLOTS.forEach(s=>S.gear[s.k]=0);   // 0 = 自带的破烂
  S.courses={};
}
function gearOf(k){ return GEAR[k][(S.gear&&S.gear[k])||0]; }
/* 外设加成：直接加在属性发挥上（不提高天赋瓶颈，只是让你打出应有的水平） */
function gearBonus(dim){
  let v=0;
  SLOTS.forEach(s=>{ const g=gearOf(s.k); if(g.e[dim]) v+=g.e[dim]; });
  return v;
}
function hasCourse(k){ return !!(S.courses&&S.courses[k]); }
/* 语言课：在对应赛区打球才有用 */
function langBonus(){
  const hl=S.homeLeague||"LPL";
  if(hl==="LCK"&&hasCourse("kr")) return 2.6;
  if((hl==="LEC"||hl==="LCS")&&hasCourse("en")) return 2.2;
  return 0;
}
/* 语言对默契的影响。
   在外赛区打球，听不懂更衣室就是磨不出配合；会说当地话则明显更顺。
   本赛区当然没有这个问题。 */
function langSyn(){
  const hl=S.homeLeague||"LPL";
  if(hl==="LPL"||hl==="LDL") return 1;
  const ok = (hl==="LCK") ? hasCourse("kr") : hasCourse("en");
  return ok ? 1.05 : 0.90;
}

/* 课程对训练的加成 */
function courseTrainMul(dim){
  if(dim==="心态"&&hasCourse("psy")) return 1.25;
  if(dim==="运营"&&hasCourse("vod")) return 1.25;
  return 1;
}

/* ---------- 直播这门生意 ----------
   原来名气涨了收入就悄悄变多——数字在后台动，玩家没有参与感。
   现在拆成两条明面上的线：
     · 分成档：咖位到了，平台上调你的礼物分成——会发事件告诉你，
       从 50% 一路谈到 88%，不是无声的数值。
     · 独家签约：人气到档，平台来谈独家。签了保底高、旱涝保收，
       但收入就锁在合同里，人气再涨也不加钱，而且平台控流量，
       直播涨名气变慢；不签则收入跟着人气水涨船高，上限更高。   */
const STREAM_CUTS=[
  {at:0,   cut:0.50, n:"五五开"},
  {at:55,  cut:0.62, n:"62% 分成"},
  {at:160, cut:0.75, n:"75% 分成"},
  {at:260, cut:0.88, n:"顶流分成（88%）"}
];
const STREAM_DEALS=[
  {lvl:1, at:95,  sign:50,  base:13, n:"平台独家（B 级）"},
  {lvl:2, at:260, sign:175, base:31, n:"平台独家（S 级）"}
];
/* ---------- 平台归属：个人签约与俱乐部签约互相影响 ----------

   原来这里是「你 vs 平台」的二选一，俱乐部完全不参与——把三方博弈做成了两方。
   现实里恰好相反：LPL 俱乐部普遍与某个平台有整体合作，选手的直播权归属
   是写进选手合同的；个人要签平台通常得俱乐部点头，俱乐部还要抽成。
   顶级选手的个人直播合同金额甚至能超过战队年薪，所以这件事值得做成一个选择。

   于是独家谈判变成三选一：
     · 签俱乐部的合作平台 —— 签字费打折、抽成低，经理承你的情
     · 签别家平台         —— 平台抢人所以出价高，但抽成高、经理不高兴
     · 不签               —— 收入随粉丝×热度浮动，上限最高、下限也最低      */
const PLATFORMS=["虎牙","斗鱼","B 站","快手"];
/* 一家俱乐部跟哪个平台合作。按队名定死——同一局里不会变，换队才会变。 */
function clubPlatform(name){
  const n=String(name===undefined?(S.team||""):name);
  if(!n) return null;
  let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))|0;
  return PLATFORMS[Math.abs(h)%PLATFORMS.length];
}
/* 来抢人的那家（一定不是俱乐部合作的那家） */
function rivalPlatform(club){
  const others=PLATFORMS.filter(x=>x!==club);
  return others[Math.floor(rnd()*others.length)]||PLATFORMS[0];
}
/* 俱乐部从你的直播收入里抽走多少 */
function streamClubCut(){ return (S.streamDeal&&S.streamDeal.cut)||0; }
function streamCut(){ return STREAM_CUTS[S.streamCutIdx||0].cut; }
/* 直播打赏：名气越高，礼物越多 —— 这是主播出身的主要变现路径 */
function streamIncome(){
  const originMul=S.origin==="streamer"?1.7:1.0;
  // 独家：合同价，旱涝保收——但俱乐部那一刀先扣掉
  if(S.streamDeal) return S.streamDeal.base*originMul*(1-streamClubCut());
  // 名气进礼物公式要封顶：pow(f/40,1.22) 无上界，生涯后期名气过千时
  // 一次直播能到两百多万，比世界赛夺冠还值钱——实测有整局挣到五亿的。
  // 封在 600（「顶流」之上），不签独家的上限 ~135/次，
  // 仍比独家保底高一截，「自由身上限更高」的承诺不变，但有边界。
  // 底盘看粉丝（有多少人会来看），当天的量看热度（最近有没有人在讨论你）。
  // 这就是「礼物 = f(粉丝基数) × g(当下热度)」——赢球那几周直播特别值钱，
  // 冷下来之后同样的粉丝掉一半收入，直播因此有了「趁热打铁」这个决策。
  const f=Math.min(Math.max(S.fans||0,0),600);
  // 以常态热度（实测中位约 400）为 1.0 上下浮动。原来 /260 让中位就顶到
  // 上限 1.9，等于给直播收入整体加了 90%，那不是「趁热打铁」，是通胀。
  const heatMul=clamp(0.45+(S.heat||0)/730,0.45,1.7);
  // 2026-08-31 经济重锚：整体 ÷2。生涯钱中位的目标从 ~1700 万压到 600–900 万，
  // 直播是仅次于成就的第二大外快，不跟着缩的话「二线队员靠直播暴富」照样成立。
  const gift=Math.pow(f/40,1.22)*2.2*streamCut()*heatMul;
  const base=2+f*0.025;
  return (base+gift)*originMul;
}
/* 独家平台控流量，涨名气比全网直播慢 */
/* 独家的代价原来是「平台控流量，直播涨名气变慢」（×0.7）。
   但玩家指出：签独家平台应该<b>帮你推流</b>才对——现实里也是这样，
   独家主播会被摆在首页和推荐位。
   所以代价换个地方承担：收入锁死在保底（人气再涨也不加钱），
   而涨粉这边反过来<b>加成</b>。热度本身不再被压。 */
function streamFansMul(){ return 1.0; }
/* 平台推流：独家合同带来的涨粉加成，乘进 fanWeek 的收敛速率 */
function streamPushMul(){
  const d=S.streamDeal; if(!d) return 1;
  return d.lvl>=2 ? 1.45 : 1.25;
}

/* 每次开播时结算「平台关系」：分成该升就升（发事件），独家该谈就谈（弹窗）。
   放在直播动作里而不是每周结算里——你和平台打交道的时机就是开播。 */
function checkStreamBiz(){
  const f=S.fans||0;
  // 分成上调：一档一档来，每次都告诉玩家
  let idx=S.streamCutIdx||0;
  if(!S.streamDeal){
    while(idx<STREAM_CUTS.length-1&&f>=STREAM_CUTS[idx+1].at){
      idx++;
      S.streamCutIdx=idx;
      const c=STREAM_CUTS[idx];
      const evt=`你的咖位到了「${fanTier()}」这一档，平台主动把礼物分成提到 <b>${c.n}</b>。<br>同样的礼物，进你口袋的变多了。`;
      if(S.pre&&!S.career&&typeof preLog==="function") preLog(evt,"good");
      pushEvent(evt,"good","直播");
    }
  }
  // 独家签约：人气到档，平台来人。谈崩/拒绝了这档就不会再来。
  if(S.streamOffer) return;
  S.streamOfferSeen=S.streamOfferSeen||{};
  for(const d of STREAM_DEALS){
    if(f<d.at) continue;
    if(S.streamOfferSeen[d.lvl]) continue;
    if(S.streamDeal&&S.streamDeal.lvl>=d.lvl) continue;
    S.streamOfferSeen[d.lvl]=1;
    const club=clubPlatform();            // 没签约时为 null，卡片会走「自由身」那一版
    S.streamOffer={lvl:d.lvl,sign:d.sign,base:d.base,n:d.n,
                   club, rival:rivalPlatform(club)};
    break;
  }
}
/* kind: "club" = 签俱乐部的合作平台，"rival" = 签来抢人的那家，
   不传 = 老的两选一路径（职业前没有俱乐部时就是这条）。 */
function signStreamDeal(kind){
  const o=S.streamOffer; if(!o) return;
  S.streamOffer=null;
  const hasClub=!!(o.club&&S.team);
  if(!hasClub) kind=null;
  // 职业前没有俱乐部，就没有「俱乐部的合作平台」这回事——
  // 直接用来谈的那一家，别显示成一个叫「平台」的平台。
  const plat = kind==="club" ? o.club : kind==="rival" ? o.rival : (o.club||o.rival||PLATFORMS[0]);
  const sign = Math.round(o.sign*(kind==="club"?0.8:kind==="rival"?1.4:1));
  const base = Math.round(o.base*(kind==="rival"?1.15:1));
  const cut  = kind==="club"?0.20:kind==="rival"?0.40:0;
  S.streamDeal={lvl:o.lvl,base,n:o.n,plat,cut,kind:kind||"solo",
                need:o.lvl>=2?3:2, done:0};
  addMoney("sign",sign);
  const originMul=S.origin==="streamer"?1.7:1.0;
  const net=Math.round(base*originMul*(1-cut));
  let extra="";
  if(kind==="club"){
    if(typeof addStaff==="function") addStaff("mgr",6);
    extra=`俱乐部乐见其成——你签的正是 <b>${S.team}</b> 的合作平台，
      经理那边记你一笔。平台方按约定抽走 <b>20%</b> 给俱乐部。`;
  } else if(kind==="rival"){
    if(typeof addStaff==="function") addStaff("mgr",-12);
    extra=`<b>${o.rival}</b> 是来抢人的，所以价开得高。但你的直播权写在队里的合同上——
      俱乐部照样抽 <b>40%</b>，而且<b>经理很不高兴</b>。`;
  }
  pushEvent(`和 <b>${plat}</b> 签下<b>${o.n}</b>：签字费 <b>${sign} 万</b>到账，
    此后每次直播保底 <b>${net} 万</b>（已扣俱乐部分成）。${extra?"<br>"+extra:""}<br>
    <span style="color:var(--ink-3)">代价写在合同里：收入锁死在保底，粉丝再涨也不加钱；
    平台控流量，直播涨热度也会变慢。另外合同有开播条款——每赛段至少播
    <b>${S.streamDeal.need}</b> 次，做不到要赔钱。</span>`,"big","直播");
  render();
}
function declineStreamDeal(){
  const o=S.streamOffer; if(!o) return;
  S.streamOffer=null;
  pushEvent(`拒绝了<b>${o.n}</b>。收入继续跟着粉丝和热度浮动——上限是你自己挣的，下限也是。`,"info","直播");
  render();
}
/* 开播条款：每赛段结算时查一次。做不到就按合同赔钱。
   这条是为了让「直播」不再是一个纯收益按钮——签了独家就欠了工时。 */
function streamClauseCheck(){
  const d=S.streamDeal; if(!d||!d.need) return;
  const done=d.done||0;
  if(done>=d.need){ d.done=0; return; }
  const miss=d.need-done;
  const fine=Math.round(d.base*miss*1.2);
  d.done=0;
  if(typeof addMoney==="function") addMoney("other",-Math.min(fine,Math.max(0,S.money)));
  pushEvent(`<b>${d.plat||"平台"}</b> 发来对账单：这个赛段的开播条款是 ${d.need} 次，
    你只播了 ${done} 次。按合同赔 <b>${fine} 万</b>。<br>
    <span style="color:var(--ink-3)">独家合同不是白拿的——保底的另一面是工时。</span>`,"bad","直播");
}
/* 独家签约弹窗：三条路各有各的道理，摆开了让玩家选 */
function streamOfferCard(){
  const o=S.streamOffer; if(!o) return "";
  const now=Math.round(streamIncome());
  const originMul=S.origin==="streamer"?1.7:1.0;
  const hasClub=!!(o.club&&S.team);
  const net=(cut,mul)=>Math.round(o.base*(mul||1)*originMul*(1-cut));
  const need=o.lvl>=2?3:2;
  return `<div class="rankup"><div class="ru-inner" style="max-width:600px;text-align:left;max-height:86vh;overflow-y:auto">
    <div class="ru-icon" style="text-align:center">${typeof gicon==="function"?gicon("stream",52):""}</div>
    <div class="ru-eyebrow" style="text-align:center">平台来谈独家了</div>
    <div class="ru-tier" style="font-size:21px;text-align:center;margin-bottom:12px">${o.n}</div>
    <p class="note" style="margin:0 0 10px">你的咖位到了「${fanTier()}」，商务带着合同上门。
      ${hasClub?`麻烦的是有两份：<b>${S.team}</b> 的合作平台是 <b>${o.club}</b>，
        而 <b>${o.rival}</b> 也想把你抢过去。<b>直播权写在你的队内合同上</b>——
        签谁、俱乐部抽多少，是三方的事，不是你和平台两个人的事。`
        :`来谈的是 <b>${o.rival}</b>。你现在没有队，签不签只跟你自己有关——没人抽你的成。`}
      你现在每次直播约 <b>${now} 万</b>。</p>
    ${hasClub?`<div class="grid g2">
      <div class="ver"><b>签 ${o.club}</b>（俱乐部的合作平台）<br><span class="note" style="margin:0">
        签字费 <b>${Math.round(o.sign*0.8)} 万</b>（打了折）· 每播保底 <b>${net(0.20)} 万</b>（俱乐部抽 20%）<br>
        <span style="color:var(--cyan)">经理承你的情，信任 +6。</span></span></div>
      <div class="ver"><b>签 ${o.rival}</b>（来抢人的）<br><span class="note" style="margin:0">
        签字费 <b>${Math.round(o.sign*1.4)} 万</b>（抢人价）· 每播保底 <b>${net(0.40,1.15)} 万</b>（俱乐部抽 40%）<br>
        <span style="color:var(--red)">经理很不高兴，信任 −12。</span></span></div>
    </div>`:""}
    <div class="ver" style="margin-top:10px"><b>签了以后</b><br><span class="note" style="margin:0">
      旱涝保收：成绩低谷、热度掉下去，每播照样拿保底。平台还会把你摆在推荐位——
      <b style="color:var(--cyan)">涨粉快 ${o.lvl>=2?45:25}%</b>。<br>
      代价：<b>收入锁死在保底</b>，粉丝再涨也不加钱；每赛段至少播 ${need} 次，做不到赔钱。</span></div>
    <div class="ver" style="margin-top:8px"><b>不签</b><br><span class="note" style="margin:0">
      收入跟着粉丝和热度浮动，分成档也会继续往上谈——打出名堂的话上限比保底高得多。
      代价是没有下限，凉了就是真的凉；也没有平台帮你推流。</span></div>
    <p class="note" style="margin:10px 0 0">签完可以在<b>经济</b>页随时翻合约条款和它对你的影响。</p>
    <div class="row" style="justify-content:center">
      ${hasClub
        ? `<button class="btn" id="strmclub">签 ${o.club}</button>
           <button class="btn" id="strmrival">签 ${o.rival}</button>
           <button class="btn ghost" id="strmno">不签，自己闯</button>`
        : `<button class="btn" id="strmyes">签 ${o.rival}</button>
           <button class="btn ghost" id="strmno">不签，自己闯</button>`}
    </div>
    <p class="note">拒了这一档就不会再来；咖位再上一个大台阶，才会有更高的报价。</p>
    ${(typeof AUTO_KEYS!=="undefined")?`<div class="row" style="justify-content:flex-end">
      <button class="recobtn" data-reco="biz" title="按推荐来：粉丝还有涨的空间就不签，贴着天花板了就签俱乐部的平台">按推荐</button>
    </div>`:""}</div></div>`;
}
/* ---------- 我的直播合约 ----------
   玩家原话：「哪个地方能看到我签订的直播合约，包括合约内容，以及对我的影响」。
   原来只有商城底部一行字。合约是一份真的合同，条款和影响都该摊开。 */
function streamDealCard(){
  const d=S.streamDeal;
  const cut=STREAM_CUTS[S.streamCutIdx||0];
  if(!d){
    return `<div class="card"><h2>直播合约<em>自由身</em></h2>
      <p class="note" style="margin:0 0 8px">你没有签任何平台的独家，收入跟着粉丝和热度走。</p>
      <div class="ver">当前礼物分成 <b>${cut.n}</b>　·　每次直播约 <b>${Math.round(streamIncome())} 万</b><br>
        <span style="color:var(--ink-3)">咖位上一个台阶，平台会主动上调分成；
        再上一个大台阶，才会有人来谈独家。</span></div>
      <p class="note" style="margin:8px 0 0">自由身的<b>上限更高</b>（收入随粉丝×热度浮动），
        但<b>没有下限</b>——成绩凉了收入就跟着凉，也没有平台帮你推流。</p></div>`;
  }
  const originMul=S.origin==="streamer"?1.7:1.0;
  const gross=Math.round(d.base*originMul);
  const net=Math.round(gross*(1-(d.cut||0)));
  const need=d.need||0, done=d.done||0;
  const push=Math.round((streamPushMul()-1)*100);
  return `<div class="card"><h2>直播合约<em>${d.plat||"平台"}</em></h2>
    <div class="ver" style="margin:0 0 10px"><b>${d.n}</b>　·　签约方 <b>${d.plat||"平台"}</b>${
      d.kind==="club"?`（${S.team} 的合作平台）`:d.kind==="rival"?`（不是你队的合作平台）`:""}</div>

    <h3 style="font-size:14px">合约条款</h3>
    <div class="scrolltable"><table class="terms">
      <tr><td>每次直播保底</td><td class="mono"><b>${gross} 万</b></td></tr>
      <tr><td>俱乐部抽成</td><td class="mono">${d.cut?`−${Math.round(d.cut*100)}%（<b>−${gross-net} 万</b>）`:"无"}</td></tr>
      <tr><td>实际到手</td><td class="mono"><b style="color:var(--gold)">${net} 万</b> / 次</td></tr>
      <tr><td>平台推流</td><td class="mono"><b style="color:var(--cyan)">涨粉 +${push}%</b></td></tr>
      <tr><td>开播条款</td><td class="mono">每赛段至少 <b>${need}</b> 次${
        need?`　本赛段已播 <b class="${done>=need?"":"ct-bad"}">${done}/${need}</b>`:""}</td></tr>
    </table></div>

    <h3 style="font-size:14px;margin-top:16px">这份合约对你的影响</h3>
    <ul class="dealfx">
      <li><b style="color:var(--cyan)">好处</b>：旱涝保收——成绩低谷、热度掉下去，每播照样 ${net} 万；
        平台把你摆在推荐位，<b>涨粉快 ${push}%</b>。</li>
      <li><b style="color:var(--red)">代价</b>：收入锁死在保底，<b>粉丝再涨也不加钱</b>；
        自由身现在每播约 ${Math.round((()=>{const bak=S.streamDeal;S.streamDeal=null;
          const v=streamIncome();S.streamDeal=bak;return v;})())} 万。</li>
      <li><b style="color:var(--red)">义务</b>：每赛段播不够 ${need} 次要按合同赔钱。</li>
      ${d.kind==="rival"?`<li><b style="color:var(--red)">队里的账</b>：你签的不是俱乐部的合作平台，
        经理那边一直记着这笔。</li>`:d.kind==="club"?`<li><b style="color:var(--cyan)">队里的账</b>：
        你签的正是俱乐部的合作平台，经理承你的情。</li>`:""}
    </ul>
    <p class="note" style="margin:8px 0 0">合约签了就不能反悔——只有咖位再上一个大台阶，
      才会有更高的报价来谈。</p></div>`;
}

function buyGear(slot,tier){
  const g=GEAR[slot][tier];
  const cur=(S.gear&&S.gear[slot])||0;
  if(tier<=cur||S.money<g.cost) return;
  addMoney("gear",-g.cost); S.gear[slot]=tier;
  pushEvent(`换上了 <b>${g.n}</b>（${TIER_N[tier]}级${SLOTS.find(s=>s.k===slot).n}）。`,"good","装备");
  render();
}
function buyCourse(k){
  const c=COURSES.find(x=>x.k===k);
  if(!c||hasCourse(k)||S.money<c.cost) return;
  addMoney("course",-c.cost); S.courses[k]=1;
  pushEvent(`报了 <b>${c.n}</b>。${c.d}`,"good","课程");
  render();
}
function buyRelax(k){
  const x=RELAX.find(r=>r.k===k);
  if(!x||S.money<x.cost) return;
  addMoney("relax",-x.cost); addFat(x.fat);
  if(x.trust&&typeof addTrustAll==="function") addTrustAll(x.trust);
  pushEvent(`${x.n}：体力回来了${x.trust?"，顺便和队友聊了聊":""}。`,"info","放松");
  render();
}

/* ---------- 界面 ---------- */
/* 装备栏只陈列你手上有什么——买卖是商城的事。
   这里最多给一个「去商城挑」的按钮，点了直接跳到商城对应的外设区。 */
function gearCard(){
  return `<div class="card"><h2>装备栏<em>加成会直接体现在比赛里</em></h2>
    <div class="gearlist">${SLOTS.map(s=>{
      const cur=(S.gear&&S.gear[s.k])||0, g=GEAR[s.k][cur];
      const better=GEAR[s.k].length-1-cur;
      const dim=Object.keys(g.e)[0];
      return `<div class="gearrow">
        <div class="gslot">${s.n}</div>
        <div class="gname"><b>${g.n}</b>
          <span class="tag ${cur>=3?'g':''}">${TIER_N[cur]}</span>
          ${g.e[dim]?`<span class="gplus">${dim} +${g.e[dim]}</span>`:'<span class="gplus none">无加成</span>'}</div>
        ${better>0?`<button class="btn ghost sm" data-goshop="${s.k}">去商城挑 →</button>`
                  :`<span class="tag g">已是顶配</span>`}
      </div>`;
    }).join("")}</div>
    <p class="note">这里只看你手上用的什么。想换更好的，去商城。</p></div>`;
}
/* 经济页 = 财务总览 -> 我的合同 -> 商城 -> 奖金标准（自上而下） */
function economyCards(){
  return financeCard()
    + streamDealCard()
    + ((typeof contractTerms==="function")?contractTerms():"")
    + shopCard()
    + prizeNote();
}
function shopCard(){
  const focus=S.shopFocus; S.shopFocus=null;   // 高亮只在跳转过来的那一次渲染生效
  return `<div class="card"><h2>商城<em>余额 ${Math.round(S.money)} 万</em></h2>
    <h3 style="font-size:14px">外设 · 换上就生效，一直用到退役</h3>
    ${SLOTS.map(s=>{
      const cur=(S.gear&&S.gear[s.k])||0, curG=GEAR[s.k][cur];
      const curDim=Object.keys(curG.e)[0];
      const opts=GEAR[s.k].map((g,t)=>({g,t})).filter(x=>x.t>cur);
      return `<div class="shopslot ${focus===s.k?'focus':''}" id="shopgear-${s.k}">
        <div class="ssname">${s.n}　现在用的：<b>${curG.n}</b>（${TIER_N[cur]}${
          curG.e[curDim]?` · ${curDim} +${curG.e[curDim]}`:""}）</div>
        ${opts.length?`<div class="grid g2">${opts.map(({g,t})=>{
          const dim=Object.keys(g.e)[0];
          return `<button class="act" data-gear="${s.k}:${t}" ${S.money<g.cost?'disabled style="opacity:.35"':''}>
            <div class="t">${g.n} <span class="tag ${t>=3?'g':''}">${TIER_N[t]}</span></div>
            <div class="d">${dim} +${g.e[dim]}${curG.e[dim]?`（现在 +${curG.e[dim]}）`:""} · <b>${g.cost} 万</b></div></button>`;
        }).join("")}</div>`
        :`<p class="note" style="margin:4px 0 0">已经是顶配，没有更好的了。</p>`}
      </div>`;
    }).join("")}
    <h3 style="font-size:14px;margin-top:18px">放松 · 花钱换体力，不占行动点</h3>
    <div class="grid g2">${RELAX.map(x=>`
      <button class="act" data-relax="${x.k}" ${S.money<x.cost?'disabled style="opacity:.35"':''}>
        <div class="t">${x.n} <span class="tag">${x.cost} 万</span></div>
        <div class="d">${x.d} · 体力 +${-x.fat}${x.trust?` · 信任 +${x.trust}`:""}</div></button>`).join("")}</div>
    <h3 style="font-size:14px;margin-top:18px">课程 · 一次买断，永久生效</h3>
    <div class="grid g2">${COURSES.map(c=>{
      const own=hasCourse(c.k);
      return `<button class="act" data-course="${c.k}" ${(own||S.money<c.cost)?'disabled style="opacity:.35"':''}>
        <div class="t">${c.n} ${own?'<span class="tag g">已修</span>':`<span class="tag">${c.cost} 万</span>`}</div>
        <div class="d">${c.d}</div></button>`}).join("")}</div>
    ${!S.career?"":`<h3 style="font-size:14px;margin-top:18px">团队投入 · 每赛段刷新</h3>
    <div class="grid g2">${SPEND.map((x,i)=>{
      const has=S.buff&&S.buff[x.k];
      return `<button class="act" data-spend="${i}" ${(has||S.money<x.cost)?'disabled style="opacity:.35"':''}>
        <div class="t">${x.n} <span class="tag">${x.cost} 万</span></div>
        <div class="d">${has?"本赛段已生效":x.d}</div></button>`}).join("")}</div>`}
    <p class="note">${S.career
      ? `薪资按名气与荣誉每赛段结算，当前预计 <b>${salaryOf()} 万</b>。`
      : `还没签约，暂时没有薪资。`}
      ${S.streamDeal
        ? `直播签了<b>${S.streamDeal.n}</b>：每次直播保底 <b>${Math.round(streamIncome())} 万</b>，旱涝保收，但人气再涨也不加钱。`
        : `直播现在是<b>${STREAM_CUTS[S.streamCutIdx||0].n}</b>，每次约 <b>${Math.round(streamIncome())} 万</b>——咖位上去了平台会主动上调分成。`}</p></div>`;
}
