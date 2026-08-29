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
    {n:"罗技 G102",                cost:60,  t:1, e:{操作:0.8}},
    {n:"罗技 G Pro X Superlight",  cost:260, t:2, e:{操作:1.9}},
    {n:"罗技 G PRO 2 Lightspeed",  cost:640, t:3, e:{操作:1.7}}
  ],
  kb:[
    {n:"杂牌薄膜键盘",              cost:0,   t:0, e:{操作:0}},
    {n:"罗技 G512",                cost:70,  t:1, e:{操作:0.7}},
    {n:"罗技 G Pro X TKL RAPID",   cost:280, t:2, e:{操作:1.7}},
    {n:"Wooting 60HE",             cost:620, t:3, e:{操作:2.9}}
  ],
  mon:[
    {n:"公司发的 60Hz 屏",          cost:0,   t:0, e:{运营:0}},
    {n:"AOC 24G2 144Hz",           cost:90,  t:1, e:{运营:0.8}},
    {n:"ZOWIE XL2546K 240Hz",      cost:330, t:2, e:{运营:1.8}},
    {n:"Alienware AW2524H 500Hz",  cost:760, t:3, e:{运营:3.1}}
  ],
  hs:[
    {n:"路边买的耳麦",              cost:0,   t:0, e:{运营:0}},
    {n:"HyperX Cloud II",          cost:80,  t:1, e:{运营:0.7}},
    {n:"罗技 G Pro X",             cost:250, t:2, e:{运营:1.5}},
    {n:"拜亚 DT1990 Pro + 声卡",    cost:700, t:3, e:{运营:2.6}}
  ],
  chair:[
    {n:"宿舍的旧转椅",              cost:0,   t:0, e:{体质:0}},
    {n:"DXRacer 电竞椅",           cost:100, t:1, e:{体质:0.9}},
    {n:"Secretlab TITAN Evo",      cost:340, t:2, e:{体质:1.9}},
    {n:"Herman Miller Embody",     cost:820, t:3, e:{体质:3.3}}
  ]
};

/* 课程：一次性买断，永久生效 */
const COURSES=[
  {k:"kr",   n:"韩语课",       cost:300, d:"看得懂韩援的沟通，去 LCK 打球不再是聋子"},
  {k:"en",   n:"英语课",       cost:240, d:"LEC / LCS 的更衣室能听懂了"},
  {k:"psy",  n:"运动心理课",   cost:380, d:"心态训练效率提升"},
  {k:"vod",  n:"复盘方法课",   cost:360, d:"运营训练效率提升"},
  {k:"comm", n:"沟通表达课",   cost:280, d:"队友信任涨得更快"}
];

/* 放松：花钱换体力，不占行动点 */
const RELAX=[
  {k:"massage", n:"按摩 90 分钟", cost:25,  fat:-18, d:"当天就能缓过来"},
  {k:"physio2", n:"专业理疗",     cost:55,  fat:-34, d:"手腕和肩颈都做一遍"},
  {k:"hotpot",  n:"约队友吃火锅", cost:45,  fat:-22, trust:7, d:"体力和关系一起补"},
  {k:"trip",    n:"短途度假",     cost:130, fat:-60, d:"彻底断网两天"}
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
  {lvl:1, at:95,  sign:100, base:26, n:"平台独家（B 级）"},
  {lvl:2, at:260, sign:350, base:62, n:"平台独家（S 级）"}
];
function streamCut(){ return STREAM_CUTS[S.streamCutIdx||0].cut; }
/* 直播打赏：名气越高，礼物越多 —— 这是主播出身的主要变现路径 */
function streamIncome(){
  const originMul=S.origin==="streamer"?1.7:1.0;
  if(S.streamDeal) return S.streamDeal.base*originMul;   // 独家：合同价，旱涝保收
  const f=S.fame;
  const gift=Math.pow(Math.max(f,0)/40,1.22)*4.4*streamCut();
  const base=4+f*0.05;
  return (base+gift)*originMul;
}
/* 独家平台控流量，涨名气比全网直播慢 */
function streamFameMul(){ return S.streamDeal?0.7:1.0; }

/* 每次开播时结算「平台关系」：分成该升就升（发事件），独家该谈就谈（弹窗）。
   放在直播动作里而不是每周结算里——你和平台打交道的时机就是开播。 */
function checkStreamBiz(){
  const f=S.fame||0;
  // 分成上调：一档一档来，每次都告诉玩家
  let idx=S.streamCutIdx||0;
  if(!S.streamDeal){
    while(idx<STREAM_CUTS.length-1&&f>=STREAM_CUTS[idx+1].at){
      idx++;
      S.streamCutIdx=idx;
      const c=STREAM_CUTS[idx];
      const evt=`你的咖位到了「${fameTier()}」这一档，平台主动把礼物分成提到 <b>${c.n}</b>。<br>同样的礼物，进你口袋的变多了。`;
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
    S.streamOffer={lvl:d.lvl,sign:d.sign,base:d.base,n:d.n};
    break;
  }
}
function signStreamDeal(){
  const o=S.streamOffer; if(!o) return;
  S.streamOffer=null;
  S.streamDeal={lvl:o.lvl,base:o.base,n:o.n};
  S.money+=o.sign;
  pushEvent(`和平台签下<b>${o.n}</b>：签字费 <b>${o.sign} 万</b>到账，此后每次直播保底 <b>${o.base} 万</b>。<br>
    <span style="color:var(--ink-3)">代价写在合同里：收入锁死在保底，人气再涨也不加钱；平台控流量，直播涨名气也会变慢。</span>`,"big","直播");
  render();
}
function declineStreamDeal(){
  const o=S.streamOffer; if(!o) return;
  S.streamOffer=null;
  pushEvent(`拒绝了平台的<b>${o.n}</b>。收入继续跟着人气浮动——上限是你自己挣的，下限也是。`,"info","直播");
  render();
}
/* 独家签约弹窗：两条路各有各的道理，摆开了让玩家选 */
function streamOfferCard(){
  const o=S.streamOffer; if(!o) return "";
  const now=Math.round(streamIncome());
  const originMul=S.origin==="streamer"?1.7:1.0;
  const locked=Math.round(o.base*originMul);
  return `<div class="rankup"><div class="ru-inner" style="max-width:540px;text-align:left;max-height:86vh;overflow-y:auto">
    <div class="ru-icon" style="text-align:center">${typeof gicon==="function"?gicon("stream",52):""}</div>
    <div class="ru-eyebrow" style="text-align:center">平台来谈独家了</div>
    <div class="ru-tier" style="font-size:21px;text-align:center;margin-bottom:12px">${o.n}</div>
    <p class="note" style="margin:0 0 10px">你的人气到了「${fameTier()}」，平台的商务带着合同上门：
      签字费 <b style="color:var(--gold)">${o.sign} 万</b>，此后每次直播保底 <b style="color:var(--gold)">${locked} 万</b>
      （你现在每次直播约 ${now} 万）。</p>
    <div class="grid g2">
      <div class="ver"><b>签独家</b><br><span class="note" style="margin:0">签字费到手、收入旱涝保收，成绩低谷也饿不着。<br>
        但收入锁死在保底，人气再涨也不加钱；平台控流量，<b>直播涨名气变慢</b>。</span></div>
      <div class="ver"><b>不签</b><br><span class="note" style="margin:0">收入跟着人气浮动，分成档也会继续往上谈——
        打出名堂的话上限比保底高得多。<br>代价是没有下限，凉了就是真的凉。</span></div>
    </div>
    <div class="row" style="justify-content:center">
      <button class="btn" id="strmyes">签独家</button>
      <button class="btn ghost" id="strmno">不签，自己闯</button>
    </div>
    <p class="note">拒了这一档就不会再来；人气再上一个大台阶，才会有更高的报价。</p></div></div>`;
}

function buyGear(slot,tier){
  const g=GEAR[slot][tier];
  const cur=(S.gear&&S.gear[slot])||0;
  if(tier<=cur||S.money<g.cost) return;
  S.money-=g.cost; S.gear[slot]=tier;
  pushEvent(`换上了 <b>${g.n}</b>（${TIER_N[tier]}级${SLOTS.find(s=>s.k===slot).n}）。`,"good","装备");
  render();
}
function buyCourse(k){
  const c=COURSES.find(x=>x.k===k);
  if(!c||hasCourse(k)||S.money<c.cost) return;
  S.money-=c.cost; S.courses[k]=1;
  pushEvent(`报了 <b>${c.n}</b>。${c.d}`,"good","课程");
  render();
}
function buyRelax(k){
  const x=RELAX.find(r=>r.k===k);
  if(!x||S.money<x.cost) return;
  S.money-=x.cost; addFat(x.fat);
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
function shopCard(){
  const focus=S.shopFocus; S.shopFocus=null;   // 高亮只在跳转过来的那一次渲染生效
  return `${(typeof contractTerms==="function")?contractTerms():""}
    <div class="card"><h2>商城<em>余额 ${Math.round(S.money)} 万</em></h2>
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
