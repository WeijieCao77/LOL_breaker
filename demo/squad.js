/* ================= 战队实力 =================

   综合实力 = base × 默契 × 战术 × 士气 × 指挥 × 体能

   base   —— 五名选手的个人数值加权平均（主角权重更高）
   默契   —— 五个人配合得怎么样。靠合练、双排、训练赛
   战术   —— 队伍的准备程度。靠复盘、训练赛
   士气   —— 更衣室气氛（= 队友信任均值）。靠赢球和处理好人际
   指挥   —— 队内最高指挥值，是个全队乘数
   体能   —— 你的疲劳

   关键机制：换人会砸默契。
   一个高手加盟，base 立刻上去，但五个人要重新磨合——
   这就是为什么强援加盟的第一个赛段往往打得不如纸面。          */

const SQUAD_DECAY = 0.21;       // 每赛段向 50 回归——这是个要一直喂的池子

function initSquad(){
  S.squad={ syn:44+Math.floor(rnd()*10), tac:44+Math.floor(rnd()*10) };
}
function squadOf(k){ return (S.squad&&S.squad[k])!==undefined?S.squad[k]:50; }
function addSquad(k,n){
  if(!S.squad) initSquad();
  // 收益递减：越高越难往上推，不然几次就拉满
  const room=clamp(1-(S.squad[k]-40)/52,0.12,1);
  S.squad[k]=q1(clamp(S.squad[k]+n*room,0,100));   // q1：掐掉浮点尾巴
}
function squadDecay(){
  if(!S.squad) return;
  ["syn","tac"].forEach(k=>{ S.squad[k]=q1(clamp(S.squad[k]+(50-S.squad[k])*SQUAD_DECAY,0,100)); });
}

/* ---------- 换人对默契的冲击 ---------- */
/* changed = 这次换了几个人（含你自己加盟）。换得越多，磨合期越长。 */
function disruptSynergy(changed,who){
  if(!S.squad) return;
  const hit=clamp(changed*7.5,0,32);
  const before=S.squad.syn;
  S.squad.syn=q1(clamp(S.squad.syn-hit,0,100));
  S.squad.tac=q1(clamp(S.squad.tac-hit*0.45,0,100));   // 战术也受影响，但没那么大
  if(hit>=5&&typeof pushEvent==="function"){
    pushEvent(`阵容变动：${who||"新人加入"}。<b>默契 ${Math.round(before)} → ${Math.round(S.squad.syn)}</b>，
      五个人要重新磨。纸面强了，打起来未必。`,"bad","磨合");
    // 队友真的被换走了，才有「走之前来找你吃顿饭」这回事
    if(typeof fireEvent==="function") fireEvent("exMate",0.45);
  }
}
/* 每次渲染前对一下名单，有变动就砸默契 */
function watchRoster(){
  if(!S.squad||!S.team) return;
  const ids=myRoster().map(p=>p.id).sort().join("|");
  if(S.rosterSig===undefined||S.rosterSig===null){ S.rosterSig=ids; return; }
  if(ids===S.rosterSig) return;
  const before=S.rosterSig.split("|"), now=ids.split("|");
  const changed=now.filter(x=>!before.includes(x)).length;
  S.rosterSig=ids;
  if(changed>0) disruptSynergy(changed,`${changed} 人换血`);
}

/* ---------- 综合实力：base × 各项权重 ---------- */
function squadBase(players){
  let s=0,wt=0;
  players.forEach(p=>{
    const r=p.r||p;
    const w=p.me?(S.offerKind==="core"?1.45:1.18):1.0;
    // 能力 × 状态：同一个人，今年打成什么样是另一回事
    const fm=(typeof formMul==="function")?(p.me?myFormMul():formMul(p)):1;
    s+=(r.操作*0.34+r.运营*0.28+r.心态*0.14+r.体质*0.10)*fm*w;
    wt+=w;
  });
  return s/wt;
}
/* 各权重系数——都以 1.0 为基准，50 分是中性 */
function squadWeights(players,fatigue,team){
  const cmd=Math.max(...players.map(p=>(p.r||p).指挥||50));
  // 替补期间你不在首发名单里，但那仍然是你的队
  const mine=players.some(x=>x.me)||(S.team&&team&&team.name===S.team)
             ||(S.team&&!team&&S.squad&&players===myRoster());
  return [
    // 默契要把「队友之间的关系」算进去。relMod() 早就写好了，
    // 注释都写着「有一对闹掰，整队都别想顺」，但一直没有任何地方调用它——
    // 于是更衣室关系是纯装饰的，和「信任」两套数字互相矛盾也没人管。
    // 语言：在外赛区打球，听不懂更衣室就磨不出默契。
    // 会当地语言是加成，不会是惩罚——这比「不会就没人要你」更贴近现实。
    {k:"syn", n:"默契", v:mine?squadOf("syn"):50,
     mult:(1+((mine?squadOf("syn"):50)-50)/950)
          *((mine&&typeof relMod==="function")?relMod():1)
          *((mine&&typeof langSyn==="function")?langSyn():1)},
    {k:"tac", n:"战术", v:mine?squadOf("tac"):50, mult:1+((mine?squadOf("tac"):50)-50)/1100},
    {k:"mor", n:"士气", v:mine&&typeof avgTrust==="function"?avgTrust():50,
     mult:1+(((mine&&typeof avgTrust==="function")?avgTrust():50)-50)/380},
    {k:"cmd", n:"指挥", v:cmd, mult:1+(cmd-55)/520},
    {k:"fit", n:"体能", v:100-clamp(fatigue,0,100), mult:1-clamp(fatigue,0,100)*0.0022}
  ];
}
/* 拆解版，界面用 */
function squadBreakdown(players,fatigue,verFav,team){
  players=players||myRoster();
  fatigue=fatigue===undefined?S.fatigue:fatigue;
  let base=squadBase(players);
  if(verFav) base+=players.filter(p=>verFav.includes(p.pos)).length*0.3;
  base+=(typeof dynastyBonus==="function")?dynastyBonus(players):0;
  // 传谁的名单就用谁的队——之前一律用我方，导致对手的默契/战术永远是中性
  const ws=squadWeights(players,fatigue,team||(players.some(x=>x.me)?findTeam(S.team):null));
  const total=ws.reduce((a,w)=>a*w.mult,base);
  return {base,ws,total};
}

/* ---------- 战队行动（签约后才有） ---------- */
/* sum 是给按钮上那行成本标注用的，就写在效果旁边——
   分开放两处，改了数值忘了改文案是迟早的事。 */
const SQUAD_ACTS=[
  {k:"scrim", n:"训练赛", d:"和别的队打，最接近实战",
   sum:["默契 +3.4","战术 +3.0","信任 +1.2","有几率摩擦"],
   fat:16, run:()=>{ addSquad("syn",3.4); addSquad("tac",3.0);
     if(typeof addTrustAll==="function") addTrustAll(1.2);
     if(rnd()<0.28&&S.team){
       const bad=myRoster().filter(p=>!p.me);
       const t=bad[Math.floor(rnd()*bad.length)];
       if(t){ pushEvent(`训练赛里暴露了问题：<b>${t.id}</b> 的处理方式和队伍对不上，复盘会开到半夜。`,"info","训练赛");
         addSquad("tac",1.6); addTrust(t.id,-2); }
     }}},
  {k:"vod", n:"战术复盘", d:"逐帧过录像，把上一场的问题挖出来",
   sum:["战术 +4.2","运营 +0.35","攒运营突破"],
   fat:9,  run:()=>{ addSquad("tac",4.2);
     if(typeof btkNote==="function") btkNote("vod",1);   // 突破「运营」瓶颈的机械条件
     S.attrs.运营=Math.min(capOf("运营"),S.attrs.运营+0.35); }},
  {k:"drill", n:"战队合练", d:"专项练配合，团战执行会顺很多",
   sum:["默契 +4.4","信任 +1.8"],
   fat:13, run:()=>{ addSquad("syn",4.4);
     if(typeof addTrustAll==="function") addTrustAll(1.8); }},
  {k:"duo", n:"队友双排", d:"排位里带一带，练默契也拉近关系",
   sum:["默契 +2.2","信任 +3.4","操作 +0.25"],
   fat:7,  run:()=>{ addSquad("syn",2.2);
     if(typeof addTrustAll==="function") addTrustAll(3.4);
     S.attrs.操作=Math.min(capOf("操作"),S.attrs.操作+0.25); }}
];
/* 职业前的车队也用这套行动：训练赛/复盘/合练/双排喂的是同一组
   默契与战术池（S.squad），只是行动点从 S.pre.ap 扣。 */
function doSquad(k){
  const inPre=!S.career&&S.pre;
  const ap=inPre?S.pre.ap:S.ap;
  if(ap<=0) return;
  const a=SQUAD_ACTS.find(x=>x.k===k); if(!a) return;
  a.run(); addFat(a.fat);
  if(inPre){
    S.pre.ap--;
    // 车队一起练过的场次是硬积累：除了默契战术池，还直接落一点
    // 赛事战力（沿用 cupPrep 通道，和旧「备战」的量级对齐）
    S.pre.cupPrep=(S.pre.cupPrep||0)+0.5;
  } else S.ap--;
  if(typeof noteAct==="function") noteAct("squad",a.k);
  render();
}

/* ---------- 综合实力与差距 ---------- */
function teamPowerOf(name){
  const t=findTeam(name); if(!t) return 50;
  return power(t,0,SEASONS[S.si].fav);
}
function myPower(){
  return power(myRoster(),S.fatigue,SEASONS[S.si].fav)+versionFit();
}
const GAP_WINDOW=7.5;
function gapVerdict(diff){
  if(diff>=GAP_WINDOW)  return {k:"crush", t:"实力碾压", d:"正常打就能赢，别浪。"};
  if(diff>=3)           return {k:"edge",  t:"占优",     d:"稳住节奏就行。"};
  if(diff>-3)           return {k:"even",  t:"势均力敌", d:"胜负就在那几个关键决策上。"};
  if(diff>-GAP_WINDOW)  return {k:"under", t:"劣势",     d:"硬碰硬赢不了，得赌一把。"};
  return {k:"hopeless", t:"差距过大", d:"这一场基本没戏。打完它，把状态留给下一场。"};
}
/* 大差距下的封顶。
   原来是一刀切：差距超过 7.5 就锁死 7%。于是差距 -14.5 的局里，
   抢龙抢成了把差距缩到 -10.3，还在锁里——界面显示「赢面 7% → 7%」，
   等于告诉玩家「你做对了，但没用」。

   现在封顶随差距滑动：差得越多上限越低，但每缩小一点差距，
   上限就抬一点。临场决策在劣势局里永远算数，只是救不回天堑。 */
function clampWinProb(p,diff){
  if(diff<=-GAP_WINDOW){
    const cap=clamp(0.20+(diff+GAP_WINDOW)*0.018,0.03,0.20);
    return Math.min(p,cap);
  }
  if(diff>=GAP_WINDOW){
    const floor=clamp(0.80+(diff-GAP_WINDOW)*0.018,0.80,0.97);
    return Math.max(p,floor);
  }
  return p;
}

/* ---------- 界面 ---------- */
function squadCard(){
  if(!S.squad) return "";
  const B=squadBreakdown(myRoster(),S.fatigue,SEASONS[S.si].fav);
  const mates=myRoster();
  const bar=(v,good)=>`<div class="track"><div class="fill" style="width:${clamp(v,0,100)}%;background:${
    v>=62?"linear-gradient(90deg,var(--cyan-dim),var(--cyan))":
    v>=42?"linear-gradient(90deg,#6B5A2A,var(--gold))":
          "linear-gradient(90deg,#5A2228,var(--red))"}"></div></div>`;
  return `<div class="card"><h2>战队实力<em>综合 ${B.total.toFixed(1)}</em></h2>

    <div class="formula">
      <span class="fb">基础战力 ${B.base.toFixed(1)}</span>${B.ws.map(w=>
        `<span class="fx">×</span><span class="fw ${w.mult>=1.008?'up':w.mult<=0.992?'dn':''}">${w.n} ${w.mult.toFixed(3)}</span>`
      ).join("")}<span class="fx">=</span><span class="ft">${B.total.toFixed(1)}</span>
    </div>

    <h3 style="font-size:13px;color:var(--ink-3);margin:16px 0 8px">基础战力 · 五名选手的个人数值</h3>
    <div class="attrs">${mates.map(p=>{
      const v=(p.r.操作*0.34+p.r.运营*0.28+p.r.心态*0.14+p.r.体质*0.10);
      return `<div class="at wide"><div class="lb">${POSN[p.pos]}</div>${bar(v)}
        <div class="vn mono"><b>${v.toFixed(0)}</b>${typeof avatarOf==="function"?avatarOf(p,22):""}<span class="pname">${
          p.me?'<b style="color:var(--gold)">你</b>':p.id.slice(0,8)}</span></div></div>`;
    }).join("")}</div>

    <h3 style="font-size:13px;color:var(--ink-3);margin:16px 0 8px">权重 · 五个人怎么变成一支队</h3>
    <div class="attrs">${B.ws.map(w=>`
      <div class="at"><div class="lb">${w.n}</div>${bar(w.v)}
        <div class="vn mono"><b>${Math.round(w.v)}</b> <span style="color:${
          w.mult>=1.008?"var(--cyan)":w.mult<=0.992?"var(--red)":"var(--ink-3)"}">×${w.mult.toFixed(3)}</span></div></div>`
    ).join("")}</div>

    <p class="note">个人数值是底子，权重决定这五个人能打出多少。<b>换人会砸默契</b>——
      强援加盟那个赛段，纸面变强了，打起来往往还不如从前。</p>
  </div>`;
}
function squadActs(){
  if(!S.squad) return "";
  const ap=(!S.career&&S.pre)?S.pre.ap:S.ap;   // 职业前的车队用职业前的行动点
  return `<h3 style="font-size:13px;color:var(--ink-3);margin:16px 0 8px">战队${
    (!S.career&&S.pre&&typeof cupTeamName==="function")?`<span class="tag g">${cupTeamName()}</span>`:""}</h3>
    <div class="grid g5">${SQUAD_ACTS.map(a=>`
      <button class="act" data-squad="${a.k}" ${ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">${a.n}</div><div class="d">${a.d}${
          (typeof costBits==="function")
            ? costBits([`体能<i class="dn">−${a.fat}</i>`]
                .concat((a.sum||[]).map(x=>x.replace(/\s*([+−-][0-9.]+)/,'<i class="up">$1</i>'))))
            : ""}</div></button>`).join("")}</div>`;
}
