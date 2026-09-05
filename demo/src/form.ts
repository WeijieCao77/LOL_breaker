import { DIMS, avg, clamp, pushEvent } from "./main";
import { rnd } from "./rng";
import { S } from "./state";
import { avgTrust } from "./team";

/* ================= 能力与状态 =================

   能力（attrs / r）  —— 生涯水位。练出来的，慢，掉得也慢。
   状态（form）      —— 今年打成什么样。波动大，赛段之间会变。

   分开的意义：「今年打得差」不等于「这个人变弱了」。
   一个能力 76、状态 32 的人是正在低谷的强者，不是一个废了的人——
   他随时可能回来。反过来，状态 81 的新人今年很吓人，但那未必是他的真实水平。   */

export const FORM_NEUTRAL = 52;

export function formOf(p){
  const f=(p&&p.form!==undefined&&p.form!==null)?p.form:FORM_NEUTRAL;
  return clamp(f,25,95);
}
/* 状态对发挥的乘数：温和。±20 状态差约值 ±5% 发挥。
   做大了会形成「赢→状态涨→更容易赢」的正反馈，一路滚雪球。 */
export function formMul(p){ return 1+(formOf(p)-FORM_NEUTRAL)/420; }

/* 玩家自己的状态 */
export function myForm(){ return clamp(S.form===undefined?FORM_NEUTRAL:S.form,25,95); }
export function myFormMul(){ return 1+(myForm()-FORM_NEUTRAL)/420; }
export function formTier(f){
  if(f>=78) return {n:"状态爆棚",k:"hot"};
  if(f>=64) return {n:"手感不错",k:"good"};
  if(f>=44) return {n:"正常",k:"norm"};
  if(f>=34) return {n:"状态下滑",k:"cold"};
  return {n:"低谷",k:"slump"};
}

/* ---------- 每个赛段重算状态 ---------- */
/* 状态不是随机数：赢球、体能、更衣室都会推它，但也留了不小的随机项——
   这就是为什么强队也会有打不动的赛季。 */
export function rollForm(){
  const prev=myForm();
  let base=FORM_NEUTRAL;
  // 上赛段成绩
  const g=(S.record?S.record.w+S.record.l:0);
  if(g>0) base+=((S.record.w/g)-0.5)*20;   // 别做太大，否则赢球→状态→再赢会滚起来
  // 体能：透支会写在状态上
  base-=clamp(S.fatigue-40,0,60)*0.20;
  // 更衣室
  base+=(avgTrust()-50)*0.14;
  // 年龄：巅峰期状态更容易高
  const a=S.age||20;
  base+= (a>=22&&a<=25)?3 : (a>=27? -3 : 0);
  // 向上赛段的状态回归一半，再加随机
  const target=base*0.55+FORM_NEUTRAL*0.17+prev*0.28+(rnd()*32-16);
  const now=clamp(Math.round(target),25,95);
  const before=formTier(prev), after=formTier(now);
  S.form=now;
  if(after.k!==before.k){
    const up=now>prev;
    pushEvent(`状态${up?"回来了":"下滑"}：<b>${after.n}</b>（${Math.round(prev)} → ${now}）。${
      after.k==="hot"?"手感烫得吓人，这种赛段一年遇不到几次。":
      after.k==="slump"?"怎么打都不对。能力还在，只是现在打不出来。":
      ""}`,up?"good":"bad","状态");
  }
  return now;
}

/* ---------- NPC 的状态推进 ---------- */
export function rollWorldForm(){
  if(!S.world) return;
  Object.keys(S.world).forEach(lg=>{
    S.world[lg].forEach(t=>{
      t.players.forEach(p=>{
        if(p.me) return;
        const prev=formOf(p);
        // 向中性回归 + 随机；年轻人波动更大
        const vol=(p.age&&p.age<=21)?20:15;
        p.form=clamp(Math.round(prev*0.76+FORM_NEUTRAL*0.24+(rnd()*vol*2-vol)),25,95);
      });
    });
  });
}
/* 全世界的状态爆发/低迷播报——只播和你相关或者顶级的 */
export function formNews(){
  if(!S.world) return;
  const hot=[],cold=[];
  Object.keys(S.world).forEach(lg=>S.world[lg].forEach(t=>t.players.forEach(p=>{
    if(p.me) return;
    const f=formOf(p), ov=avg(DIMS.map(d=>p.r[d]));
    if(f>=80&&ov>=58) hot.push({p,t,f});
    if(f<=32&&ov>=62) cold.push({p,t,f});
  })));
  const pick=a=>a.length?a[Math.floor(rnd()*a.length)]:null;
  const h=pick(hot), c=pick(cold);
  if(h&&rnd()<0.6)
    pushEvent(`<b>${h.p.id}</b>${h.p.cn?`（${h.p.cn}）`:""}（${h.t.name}）状态爆棚，最近几场数据吓人。`,"good","状态");
  if(c&&rnd()<0.5)
    pushEvent(`<b>${c.p.id}</b>${c.p.cn?`（${c.p.cn}）`:""}（${c.t.name}）陷入低谷。能力还在，就是打不出来了。`,"bad","状态");
}

/* ---------- 界面 ---------- */
export function formCard(){
  if(S.form===undefined) return "";
  const f=myForm(), T=formTier(f);
  return `<div class="card"><h2>状态<em>${T.n}</em></h2>
    <div class="at" style="grid-template-columns:50px 1fr 90px">
      <div class="lb">状态</div>
      <div class="track"><div class="fill form-${T.k}" style="width:${clamp(f,0,100)}%"></div>
        <div class="capline" style="left:${FORM_NEUTRAL}%"></div></div>
      <div class="vn mono"><b>${f}</b> ×${myFormMul().toFixed(3)}</div>
    </div>
    <p class="note">能力是你练出来的水位，状态是<b>今年打成什么样</b>。
      状态每个赛段重算——赢球、体能、更衣室都会推它，但也有运气成分。
      ${f>=78?"现在这个手感，能打的比赛都去打。":
        f<=34?"能力没掉，只是打不出来。休息、稳住更衣室，等它回来。":""}</p>
  </div>`;
}
