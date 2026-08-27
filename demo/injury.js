/* ================= 伤病 =================

   没有伤病，疲劳就只是个软约束，硬练没有真代价。
   加上之后，训练的最优解落在中间：练，但别练到人垮。

   风险公式（每周每人）：0.5% + (疲劳−40)×0.12%，27 岁以上每岁再 +0.2%。
   比赛日按当场体能另算一次。                                          */

const INJURIES=[
  {k:"wrist", n:"手腕劳损", w:4, weeks:[1,3], hit:{操作:-4,体质:-2},
   d:"腱鞘发炎。医生说必须停，不然会变慢性。"},
  {k:"back",  n:"腰背问题", w:3, weeks:[1,2], hit:{体质:-5,心态:-1},
   d:"久坐落下的。坐满一局就疼。"},
  {k:"eye",   n:"眼睛过劳", w:2, weeks:[1,2], hit:{操作:-3,运营:-2},
   d:"看久了会重影。补刀和视野都受影响。"},
  {k:"neck",  n:"颈椎", w:2, weeks:[2,4], hit:{操作:-3,体质:-4},
   d:"低头太久，手会发麻。"},
  {k:"burn",  n:"精神透支", w:3, weeks:[1,3], hit:{心态:-6,运营:-2},
   d:"不是身体的问题。你已经很久没有一天是真正休息的了。"}
];

/* 本周受伤概率 */
function injuryRisk(){
  if(S.injury) return 0;
  let p=0.005+clamp(S.fatigue-40,0,60)*0.0012;
  const a=S.age||20;
  if(a>=27) p+=(a-26)*0.002;
  // 体质是抗伤的：60 以上明显更耐操
  p*=clamp(1.5-(S.attrs.体质-40)/60,0.55,1.5);
  if(S.buff&&S.buff.physio) p*=0.6;              // 请了理疗师
  return clamp(p,0,0.30);
}
/* 掷一次；受伤则挂上伤病状态 */
function rollInjury(where){
  if(S.injury) return false;
  if(rnd()>=injuryRisk()) return false;
  const tot=INJURIES.reduce((a,x)=>a+x.w,0);
  let r=rnd()*tot;
  const inj=INJURIES.find(x=>(r-=x.w)<=0)||INJURIES[0];
  const wk=inj.weeks[0]+Math.floor(rnd()*(inj.weeks[1]-inj.weeks[0]+1));
  S.injury={k:inj.k,n:inj.n,d:inj.d,left:wk,hit:inj.hit};
  pushEvent(`<b>${inj.n}</b>　${inj.d}<br>
    预计影响 <b>${wk} 周</b>${where?`（${where}）`:""}。`,"bad","伤病");
  return true;
}
/* 伤病对属性的即时折扣（不改真实数值，只影响这段时间的发挥） */
function injuryHit(d){
  if(!S.injury||!S.injury.hit) return 0;
  return S.injury.hit[d]||0;
}
function injuryTick(){
  if(!S.injury) return;
  S.injury.left--;
  if(S.injury.left<=0){
    pushEvent(`<b>${S.injury.n}</b> 好了。这几周你落下的东西，得补回来。`,"good","伤病");
    S.injury=null;
  }
}
/* 受伤期间训练效率大打折扣——硬练只会更糟 */
function injuryTrainMul(){ return S.injury?0.45:1; }

function injuryCard(){
  if(!S.injury) return "";
  const h=Object.entries(S.injury.hit).map(([d,v])=>`${d} ${v}`).join("　");
  return `<div class="card injury"><h2>伤病<em>还有 ${S.injury.left} 周</em></h2>
    <h3>${S.injury.n}</h3>
    <p class="note" style="margin-top:2px">${S.injury.d}</p>
    <p class="note">当前影响：<b style="color:var(--red)">${h}</b>　·　训练效率大幅下降。
      <br>硬练只会拖长恢复。这段时间以休息为主。</p></div>`;
}
/* 风险提示：让玩家在练崩之前看得见 */
function riskHint(){
  const p=injuryRisk();
  if(p<0.02) return "";
  const lv=p>=0.14?"很高":p>=0.07?"偏高":"开始有了";
  return `<div class="riskbar ${p>=0.14?'hi':p>=0.07?'mid':'lo'}">
    受伤风险<b>${lv}</b>　体能 ${100-Math.round(S.fatigue)}/100${
      p>=0.07?"　——该休息了，练废了更亏。":""}</div>`;
}
