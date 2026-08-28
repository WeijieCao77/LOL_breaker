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
/* 课程对训练的加成 */
function courseTrainMul(dim){
  if(dim==="心态"&&hasCourse("psy")) return 1.25;
  if(dim==="运营"&&hasCourse("vod")) return 1.25;
  return 1;
}

/* 直播打赏：名气越高，礼物越多 —— 这是主播出身的主要变现路径 */
function streamIncome(){
  const f=S.fame;
  const gift=Math.pow(Math.max(f,0)/40,1.22)*2.6;      // 名气有回报，但不能指数爆炸
  const base=4+f*0.05;
  const originMul=S.origin==="streamer"?1.7:1.0;
  return (base+gift)*originMul;
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
function gearCard(){
  return `<div class="card"><h2>装备栏<em>加成会直接体现在比赛里</em></h2>
    <div class="gearlist">${SLOTS.map(s=>{
      const cur=(S.gear&&S.gear[s.k])||0, g=GEAR[s.k][cur];
      const nxt=GEAR[s.k][cur+1];
      const dim=Object.keys(g.e)[0];
      return `<div class="gearrow">
        <div class="gslot">${s.n}</div>
        <div class="gname"><b>${g.n}</b>
          <span class="tag ${cur>=3?'g':''}">${TIER_N[cur]}</span>
          ${g.e[dim]?`<span class="gplus">${dim} +${g.e[dim]}</span>`:'<span class="gplus none">无加成</span>'}</div>
        ${nxt?`<button class="btn sm ${S.money>=nxt.cost?'':'ghost'}" data-gear="${s.k}:${cur+1}"
            ${S.money<nxt.cost?'disabled':''}>升级 ${nxt.cost} 万</button>`
            :`<span class="tag g">已满级</span>`}
      </div>${nxt?`<div class="gnext">下一档：${nxt.n} · ${Object.keys(nxt.e)[0]} +${nxt.e[Object.keys(nxt.e)[0]]}</div>`:""}`;
    }).join("")}</div></div>`;
}
function shopCard(){
  return `${(typeof contractTerms==="function")?contractTerms():""}
    <div class="card"><h2>商城<em>余额 ${Math.round(S.money)} 万</em></h2>
    <h3 style="font-size:14px">放松 · 花钱换体力，不占行动点</h3>
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
      直播打赏随名气水涨船高——现在每次直播约 <b>${Math.round(streamIncome())} 万</b>。</p></div>`;
}
