import { addStaff } from "./clout";
import { findTeam, leagueOf } from "./intl";
import { addFans, clamp, makeRookie, ovrOf, pushEvent, render } from "./main";
import { rnd } from "./rng";
import { pay } from "./random";
import { noteGrudge } from "./rivals";
import { addMoney } from "./shop";
import { S } from "./state";
import { addTrustAll } from "./team";

/* ================= 事件的后果：待办与世界痕迹 =================

   玩家原话：「事件要对任务或者世界产生影响，不能只是一个简单的弹窗」。

   原来的事件都是「弹一下、加点数值、翻篇」——哪怕文本写得再好，
   它在玩家的世界里也没留下任何东西。真正让一件事有分量的是两样：

     一、它给你留下一件<b>没做完的事</b>（待办）：有期限、有进度、
         做到了兑现、没做到有代价。于是这一周的行动点怎么花被它改变了。
     二、它在<b>世界里留下痕迹</b>：某个人成了你的宿敌、某支队真的换了人、
         某家俱乐部记住了你。下次再碰到，是接着上次那条线走。

   待办用同一套结构表达，进度靠已有的 noteAct() 顺手统计——
   那个函数本来就记录了玩家每一次行动，不用另起炉灶。          */

export const QUEST_KINDS={
  stream:{n:"直播",   hit:a=>a.v==="stream"},
  train: {n:"训练",   hit:a=>a.k==="train"},
  rank:  {n:"打排位", hit:a=>a.v==="rank"||a.v==="solo"},
  win:   {n:"赢比赛", hit:null}          // 由 endMatch 直接报，不走 noteAct
};

/* 开一件待办。
   due = 还有几周；need = 要做到几次；
   ok/fail 是两条结算路径，都必须有——只有奖励没有代价的待办不是待办，是白送。 */
export function addQuest(q){
  if(!q||!q.id) return;
  S.quests=S.quests||[];
  if(S.quests.some(x=>x.id===q.id)) return;      // 同一件事不重复开
  S.quests.push({
    id:q.id, n:q.n, d:q.d||"", kind:q.kind, need:q.need||1, prog:0,
    due:(q.due||2), from:q.from||"", okTxt:q.okTxt||"", failTxt:q.failTxt||"",
    money:q.money||0, fans:q.fans||0, penalty:q.penalty||0, penFans:q.penFans||0,
    trust:q.trust||0, mgr:q.mgr||0
  });
  pushEvent(`<b>待办：${q.n}</b>　${q.d}<br>
    <span style="color:var(--ink-3)">${q.due||2} 周内${QUEST_KINDS[q.kind]?QUEST_KINDS[q.kind].n:""} ${q.need||1} 次。
    ${q.okTxt||""}${q.failTxt?`　做不到：${q.failTxt}`:""}</span>`,"info","待办");
}
/* 玩家做了一次行动，推进所有相关待办 */
export function questNote(kind,key){
  if(!S.quests||!S.quests.length) return;
  const a={k:kind,v:key};
  S.quests.forEach(q=>{
    const K=QUEST_KINDS[q.kind];
    if(K&&K.hit&&K.hit(a)) q.prog++;
  });
  questSettleDone();
}
/* 赢了一场比赛 */
export function questWin(){
  if(!S.quests||!S.quests.length) return;
  S.quests.forEach(q=>{ if(q.kind==="win") q.prog++; });
  questSettleDone();
}
/* 达成的立刻兑现——别让玩家等到周末才知道自己做到了 */
export function questSettleDone(){
  if(!S.quests) return;
  const done=S.quests.filter(q=>q.prog>=q.need);
  if(!done.length) return;
  S.quests=S.quests.filter(q=>q.prog<q.need);
  done.forEach(q=>{
    if(q.money&&true) addMoney("other",q.money);
    if(q.fans&&true) addFans(q.fans);
    if(q.trust&&true) addTrustAll(q.trust);
    if(q.mgr&&true) addStaff("mgr",q.mgr);
    pushEvent(`<b>${q.n}</b> —— 做到了。${q.okTxt||""}${
      q.money?`<br>到账 <b>${q.money} 万</b>。`:""}`,"good","待办");
  });
  render();
}
/* 每周走一步：期限减一，到期没做到就按代价结算 */
export function questWeek(){
  if(!S.quests||!S.quests.length) return;
  const dead=[];
  S.quests.forEach(q=>{ q.due--; if(q.due<=0) dead.push(q); });
  if(!dead.length) return;
  S.quests=S.quests.filter(q=>q.due>0);
  dead.forEach(q=>{
    if(q.penalty){
      const pay=Math.min(q.penalty,Math.max(0,S.money));
      addMoney("other",-pay);
    }
    if(q.penFans&&true) addFans(-q.penFans);
    if(q.mgr&&true) addStaff("mgr",-Math.abs(q.mgr));
    pushEvent(`<b>${q.n}</b> 到期了，你只做到 ${q.prog}/${q.need}。${q.failTxt||""}${
      q.penalty?`<br>赔了 <b>${q.penalty} 万</b>。`:""}`,"bad","待办");
  });
}
/* 界面：本周页顶部的待办卡。有就显示，没有就不占地方。 */
export function questCard(){
  if(!S.quests||!S.quests.length) return "";
  return `<div class="card"><h2>待办<em>${S.quests.length} 件</em></h2>
    <p class="note" style="margin:0 0 10px">这些是之前那些事留下来的。
      有期限，做不到有代价。</p>
    ${S.quests.map(q=>{
      const K=QUEST_KINDS[q.kind], pct=clamp(q.prog/q.need*100,0,100);
      const urgent=q.due<=1;
      return `<div class="qrow ${urgent?"urgent":""}">
        <div class="qn">${q.n}<span class="qd">${q.d}</span></div>
        <div class="qbar"><i style="width:${pct}%"></i></div>
        <div class="qnum mono">${q.prog}/${q.need} ${K?K.n:""}　·
          <b class="${urgent?"ct-bad":""}">还剩 ${q.due} 周</b></div>
      </div>`;
    }).join("")}
  </div>`;
}

/* ---------- 世界痕迹 ----------
   事件不只该改玩家身上的数字，也该在世界里留下东西。
   下面这几个函数是给事件调用的：它们真的写进 S.world / S.rivals，
   之后再遇到就是接着上次那条线走。 */

/* 把某个人变成你的宿敌——之后对上他会有额外的剧情和加成 */
export function evMakeRival(teamName,reason){
  ;
  const t=findTeam(teamName);
  if(!t) return null;
  noteGrudge(teamName,4,reason||"这件事你记住了");
  return t;
}
/* 从联赛里挑一支不是你的队（事件要指名道姓的时候用） */
export function evPickTeam(){
  const lg=(S.world&&S.world[S.homeLeague||"LPL"])||[];
  const pool=lg.filter(t=>t.name!==S.team);
  return pool.length?pool[Math.floor(rnd()*pool.length)]:null;
}
/* 某支队真的换人：把一个老将换成新秀，队伍战力跟着变。
   这是「爆料/官宣裁人」这类事件该留下的痕迹——
   否则新闻说了一遍，世界里什么也没发生。 */
export function evRosterChange(team){
  if(!team||!team.players||false) return null;
  const lg=leagueOf(team.name);
  const base=(S.baseline&&S.baseline[lg])||50;
  let idx=-1, worst=1e9;
  team.players.forEach((p,i)=>{
    if(p.me) return;
    const v=ovrOf(p);
    if(v<worst){ worst=v; idx=i; }
  });
  if(idx<0) return null;
  const out=team.players[idx];
  const nr: any=makeRookie(out.pos, base-3, S.homeLeague||"LPL");
  nr.lg=lg; nr.form=52;
  team.players[idx]=nr;
  team.syn=clamp((team.syn===undefined?50:team.syn)-6,20,90);   // 换人要重新磨
  return {out,nr};
}
/* 俱乐部记住了你：经理与教练的态度真的变，而且会一直跟着你 */
export function evClubMood(mgr,coach){
  ;
  if(mgr) addStaff("mgr",mgr);
  if(coach) addStaff("coach",coach);
}
