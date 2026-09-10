import { checkAch } from "./achieve";
import { avatarOf } from "./avatar";
import { findTeam, leagueOf } from "./intl";
import { POSN, avg, clamp, makeRookie, myRoster, myTeam, pushEvent, q1, render } from "./main";
import { rnd } from "./rng";
import { addSquad, disruptSynergy } from "./squad";
import { S } from "./state";
import { addTrust, addTrustAll, avgTrust, syncTrust, trustOf } from "./team";

/* ================= 话语权 =================

   现实里，一个够格的选手是可以对阵容说话的——Uzi 能让俱乐部为他配辅助。
   但那不是白来的：你得先有战绩、有人气、在队里说了算，
   而且教练和经理得站在你这边。

   三个前置：
     威望   —— 你在这个圈子里的分量。冠军、人气、队内地位、生涯战绩堆出来的。
     教练信任 —— 看你练不练、听不听战术、关键局顶不顶得住。
     经理信任 —— 看你值不值钱：人气、商业价值、合同表现。

   两种操作：
     挂牌队友 —— 需要威望 + 教练点头。不保证成功，失败会走漏风声。
     点名引援 —— 需要威望 + 经理点头 + 俱乐部有预算。

   刻意做得「不好用」：条件苛刻、有失败、有反噬。
   它应该是你打了两年之后的奖励，不是开局就能用的按钮。                   */

/* ---------- 教练 / 经理 ---------- */
export function initStaff(){
  S.staff={coach:46+Math.floor(rnd()*10), mgr:46+Math.floor(rnd()*10)};
  S.staffSeen={lg:(S.career&&S.career.leagueTitles)||0,
               intl:(((S.career&&S.career.msi)||0)+((S.career&&S.career.worlds)||0))};
  S.staffLog=null;
}
export function coachTrust(){ return clamp((S.staff&&S.staff.coach)||50,0,100); }
export function mgrTrust(){ return clamp((S.staff&&S.staff.mgr)||50,0,100); }
export function addStaff(k,n){
  if(!S.staff) initStaff();
  // q1：写入就掐掉浮点尾巴，否则回归公式滚几个赛段，
  // 界面上就会出现 47.60402559999999 这种数
  S.staff[k]=q1(clamp(S.staff[k]+n,0,100));
}

/* ---------- 威望 ---------- */
/* 0~100。这是「别人凭什么听你的」的量化。 */
export function cloutOf(){
  if(!S.team) return 0;
  let v=18;
  // 荣誉
  v+=(S.career.leagueTitles||0)*5;
  v+=((S.career.msi||0)+(S.career.worlds||0))*11;
  // 人气
  v+=clamp((S.fans||0)/14,0,16);
  // 队内地位：你在 base 里占多少
  const me=myRoster().find(p=>p.me);
  if(me){
    const mine=me.r.操作*.34+me.r.运营*.28+me.r.心态*.14+me.r.体质*.10;
    const others=avg(myRoster().filter(p=>!p.me).map(p=>
      p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10));
    v+=clamp((mine-others)*0.9,-8,18);
  }
  // 生涯战绩
  const g=(S.career.w||0)+(S.career.l||0);
  if(g>20) v+=clamp(((S.career.w/g)-0.5)*40,-8,12);
  // 更衣室不认你，威望就是空的
  v+=clamp((avgTrust()-50)*0.16,-6,6);
  return clamp(Math.round(v),0,100);
}
export function cloutTier(c){
  if(c>=78) return {n:"队魂",d:"你说的话，俱乐部会认真听。"};
  if(c>=62) return {n:"核心",d:"你在这支队里说得上话。"};
  if(c>=44) return {n:"主力",d:"打得不错，但还轮不到你定阵容。"};
  if(c>=26) return {n:"轮换",d:"先把位置坐稳再说别的。"};
  return {n:"新人",d:"没人会听一个新人的意见。"};
}

/* ---------- 队友两两关系 ---------- */
/* 除了「对你的信任」，队友之间也有关系。
   两个互相看不顺眼的人在场上就是配合不起来——直接吃默契。 */
export function initRelations(){
  S.rel={};
  const m=myRoster().filter(p=>!p.me);
  for(let i=0;i<m.length;i++) for(let j=i+1;j<m.length;j++){
    S.rel[relKey(m[i].id,m[j].id)]=42+Math.floor(rnd()*20);
  }
}
export function relKey(a,b){ return [a,b].sort().join("|"); }
export function relOf(a,b){ const v=S.rel&&S.rel[relKey(a,b)]; return v===undefined?50:v; }
export function addRel(a,b,n){
  if(!S.rel) return;
  const k=relKey(a,b);
  if(S.rel[k]===undefined) return;
  S.rel[k]=clamp(S.rel[k]+n,0,100);
}
/* 全队每一对一起动（作者拍板 2026-09-09：把「合练和团建能缓和」变成真的）。
   数值刻意小：羁绊的「找人聊聊」已经把这个池子从死数值救活了（实测均值 53.3 → 55.1），
   这里再加四个来源，是为了让卡面上写的那几句成立，不是为了把它推高。
   240 局批测把关，口径和「找人聊聊」那张表同源。 */
export function relAll(n){
  if(!S.rel||!n) return;
  let ids=[];
  try{ ids=myRoster().filter(p=>!p.me).map(p=>p.id); }catch(e){ return; }
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) addRel(ids[i],ids[j],n);
}
export function syncRelations(){
  if(!S.rel) { initRelations(); return; }
  const ids=myRoster().filter(p=>!p.me).map(p=>p.id);
  // 伤停换下的人还是这队的人（真替补席）：多年攒的关系对子别删
  if(S.mateInjury&&S.mateInjury.sub&&S.mateInjury.id&&!ids.includes(S.mateInjury.id)) ids.push(S.mateInjury.id);
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++){
    const k=relKey(ids[i],ids[j]);
    if(S.rel[k]===undefined) S.rel[k]=38+Math.floor(rnd()*14);   // 新来的还不熟
  }
  Object.keys(S.rel).forEach(k=>{
    const [a,b]=k.split("|");
    if(!ids.includes(a)||!ids.includes(b)) delete S.rel[k];
  });
}
/* 关系网对默契的修正：有一对闹掰，整队都别想顺 */
export function relMod(){
  const v=Object.values(S.rel||{});
  if(!v.length) return 1;
  const worst=Math.min(...(v as number[]));
  const mean=avg(v);
  return 1+((mean-50)/900)+((worst<32)?-(32-worst)/700:0);
}
/* 关系每赛段的自然漂移：一起赢会更近，一起输会互相埋怨 */
export function relDrift(won){
  Object.keys(S.rel||{}).forEach(k=>{
    S.rel[k]=q1(clamp(S.rel[k]+(won?1.6:-2.2)+(rnd()*5-2.5),0,100));
  });
}

/* ---------- 挂牌队友 ---------- */
/* 挂牌的两条路。2026-09-08 之前只有「威望 ≥55 且 教练 ≥68」一条，
   而教练信任的自然平衡点只有 46~54——实测一整个生涯只有 4.9% 的赛季周能用，
   等于这个功能没开。现在拆成两条：踏实带队的人靠教练点头，
   功勋选手可以用威望压过教练组。 */
export const LIST_GATE={clout:55, coach:60, vetClout:75, vetCoach:50};
export function canList(){
  const c=cloutOf(), ct=coachTrust();
  if(c<LIST_GATE.clout) return {ok:false,why:`威望不够（${c}/${LIST_GATE.clout}）。先打出成绩再谈阵容。`};
  const byCoach=ct>=LIST_GATE.coach;
  const byClout=c>=LIST_GATE.vetClout&&ct>=LIST_GATE.vetCoach;
  if(!byCoach&&!byClout) return {ok:false,why:c>=LIST_GATE.vetClout
    ? `教练那边还差一口气（信任 ${Math.round(ct)}/${LIST_GATE.vetCoach}）。功勋压得住他，但不能压到这个份上。`
    : `还没人肯为你动阵容。<b>教练信任要 ${LIST_GATE.coach}</b>（现在 ${Math.round(ct)}），或者<b>威望到 ${LIST_GATE.vetClout}</b>（现在 ${c}）用功勋压过教练组。`};
  if(S.listCooldown>0) return {ok:false,why:`刚提过一次，${S.listCooldown} 个赛段内别再提。`};
  return {ok:true};
}
/* 成功率：目标越弱、你威望越高、教练越信你、你和他关系越差，越容易 */
export function listOdds(t){
  const perf=t.r.操作*.34+t.r.运营*.28+t.r.心态*.14+t.r.体质*.10;
  const teamAvg=avg(myRoster().map(p=>p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10));
  let p=0.30;
  p+=(cloutOf()-55)/120;
  p+=(coachTrust()-LIST_GATE.coach)/180;
  p+=clamp((teamAvg-perf)/16,-0.2,0.32);        // 他确实打得差
  p-=clamp((trustOf(t.id)-50)/200,-0.15,0.22);  // 他跟你关系好，你反而难开口
  if(t.age>=27) p+=0.08;                         // 老将本来就该换了
  if(t.rookie) p-=0.10;                          // 青训才提上来，俱乐部要脸面
  return clamp(p,0.05,0.82);
}
export function doList(id){
  const t=myRoster().find(p=>p.id===id);
  if(!t||!canList().ok) return;
  const p=listOdds(t), ok=rnd()<p;
  S.listCooldown=3;
  if(ok){
    const lg=S.homeLeague||"LPL";
    const team=myTeam();
    const base=(S.baseline&&S.baseline[lg])||50;
    const nr=makeRookie(t.pos,base-3,S.homeLeague||"LPL");
    team.players=team.players.map(q=>q===t?nr:q);
    addStaff("coach",-4);                        // 教练替他惋惜
    addTrustAll(-6); relDrift(false);
    pushEvent(`你向教练组提出换掉 <b>${t.id}</b>，成功了。<br>
      ${t.id} 被挂牌，<b>${nr.id}</b> 从青训提上来。<br>
      <span style="color:var(--red)">更衣室安静了很久——他们知道这是你提的。</span>`,"big","话语权");
    syncTrust(); syncRelations();
    checkAch("clout",{kind:"list",ok:true});
    disruptSynergy(1,`${t.id} 被挂牌`);
  }else{
    addTrust(t.id,-26); addTrustAll(-9); addStaff("coach",-14); relDrift(false);
    addSquad("syn",-6);
    pushEvent(`你提出换掉 <b>${t.id}</b>，教练组没同意——<b>而且消息走漏了</b>。<br>
      <span style="color:var(--red)">${t.id} 知道了。整个更衣室都知道了。</span>`,"bad","话语权");
    checkAch("clout",{kind:"list",ok:false});
  }
  render();
}

/* ---------- 点名引援 ---------- */
export function canSign(){
  const c=cloutOf(), mt=mgrTrust();
  if(c<66) return {ok:false,why:`威望不够（${c}/66）。这种要求得是队魂级别的人才提得动。`};
  if(mt<72) return {ok:false,why:`经理不认你（信任 ${Math.round(mt)}/72）。他要先看到你值这个钱。`};
  if(S.signCooldown>0) return {ok:false,why:`本赛季已经提过，${S.signCooldown} 个赛段后再说。`};
  return {ok:true};
}
/* 你能要到多好的人，取决于威望和经理信任 */
export const SIGN_SLOTS=5;
export function signTargets(){
  const lg=S.homeLeague||"LPL";
  const mine=myRoster().map(p=>p.id);
  const pool=[];
  Object.keys(S.world).forEach(l=>S.world[l].forEach(t=>{
    if(t.name===S.team) return;
    t.players.forEach(p=>{
      if(mine.includes(p.id)) return;
      pool.push({p,team:t.name,lg:l,
        ovr:p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10});
    });
  }));
  const teamAvg=avg(myRoster().filter(p=>!p.me).map(p=>
    p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10));
  const reach=teamAvg+ (cloutOf()-60)/6 + (mgrTrust()-60)/9;   // 你够得着的档次
  const band=pool.filter(x=>x.ovr<=reach+4&&x.ovr>=teamAvg-1).sort((a,b)=>b.ovr-a.ovr);
  if(band.length<=SIGN_SLOTS) return band;
  /* 2026-09-08：以前这里是 slice(0,5)——「够得着的人里最难的五个」。
     而 reach 又跟着威望和经理信任一起涨，所以你越有分量，摆在面前的人越强，
     成算永远钉在四成上。名字换了，感受没变：提一次、崩一次、被说不懂行情。
     现在从够得着的那一段里等距取五个：最好的那个还在最上面，
     但你也可以退一步要一个稳的。这是多给了**选择**，不是多给了实力——
     要得越稳，拿到的升级就越小。 */
  const out=[]; const step=(band.length-1)/(SIGN_SLOTS-1);
  for(let i=0;i<SIGN_SLOTS;i++) out.push(band[Math.round(i*step)]);
  return out;
}
export const SIGN_FAIL_VET=75;   // 威望到这个档，谈崩不再是你的错
export function signOdds(x){
  const teamAvg=avg(myRoster().filter(p=>!p.me).map(p=>
    p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10));
  let p=0.50;
  p+=(cloutOf()-66)/110;
  p+=(mgrTrust()-72)/160;
  p-=clamp((x.ovr-teamAvg)/18,0,0.30);        // 要得越好越难
  if(x.lg!==(S.homeLeague||"LPL")) p-=0.12;   // 跨赛区更麻烦
  return clamp(p,0.10,0.82);
}
export function doSign(id){
  const list=signTargets();
  const x=list.find(y=>y.p.id===id);
  if(!x||!canSign().ok) return;
  S.signCooldown=4;
  const p=signOdds(x), ok=rnd()<p;
  if(ok){
    const team=myTeam();
    // 顶掉同位置最弱的那个（不是你）
    const same=team.players.filter(q=>!q.me&&q.pos===x.p.pos);
    const out=same.length?same.reduce((a,b)=>
      (a.r.操作*.34+a.r.运营*.28)<(b.r.操作*.34+b.r.运营*.28)?a:b)
      :team.players.filter(q=>!q.me).reduce((a,b)=>
      (a.r.操作*.34+a.r.运营*.28)<(b.r.操作*.34+b.r.运营*.28)?a:b);
    const src=findTeam(x.team);
    if(src) src.players=src.players.map(q=>q===x.p?makeRookie(x.p.pos,
      ((S.baseline&&S.baseline[x.lg])||50)-4,leagueOf(src.name)):q);
    team.players=team.players.map(q=>q===out?Object.assign({},x.p):q);
    addStaff("mgr",-3);
    pushEvent(`俱乐部按你的要求把 <b>${x.p.id}</b>${x.p.cn?`（${x.p.cn}）`:""} 签了下来，
      ${out.id} 腾出位置。<br><b>这是你的话语权换来的——现在成绩得对得起它。</b>`,"big","话语权");
    syncTrust(); syncRelations();
    checkAch("clout",{kind:"sign",ok:true});
    disruptSynergy(1,`${x.p.id} 加盟`);
  }else{
    /* 2026-09-08：谈崩的锅以前一律扣在选手头上（−12 + 「你不太懂行情」）。
       对一个三连冠的队魂说这句话就是作者说的「观感差」——
       功勋选手谈崩了，经理该去骂对面开价，不是骂自己队里的功臣。 */
    const c=cloutOf();
    if(c>=SIGN_FAIL_VET){
      addStaff("mgr",-5);
      pushEvent(`你向经理提出签下 <b>${x.p.id}</b>。<br>
        他跑了一趟，对方开的价俱乐部吃不下。<span style="color:var(--ink-3)">「这不怪你，是那边狮子大开口。」</span>`,"bad","话语权");
    }else{
      addStaff("mgr",-12);
      pushEvent(`你向经理提出签下 <b>${x.p.id}</b>。<br>
        对方要价太高，谈崩了。<span style="color:var(--red)">经理觉得你不太懂行情。</span>`,"bad","话语权");
    }
  }
  render();
}

/* ---------- 荣誉结算 ---------- */
/* 2026-09-08：这两个式子以前只看胜率、复盘、人气——**冠军一分不涨**。
   玩家原话「我三连冠伟业的男人，让他换个人经理还要嘲讽我不懂行情」。
   用「和上次结算相比多了几座奖杯」来记，跟 cloutTick 和夺冠代码的先后无关：
   本赛段夺的冠在下个赛段的 tick 里补上，读起来就是「上赛段的冠军」。 */
export const HONOR_COACH={lg:6, intl:12};
export const HONOR_MGR  ={lg:5, intl:10};
export function newHonors(){
  const lg=(S.career&&S.career.leagueTitles)||0;
  const intl=((S.career&&S.career.msi)||0)+((S.career&&S.career.worlds)||0);
  // 老档第一次进来只登记、不补发——不然存了十座奖杯的档一进来就爆表
  if(!S.staffSeen){ S.staffSeen={lg,intl}; return {lg:0,intl:0}; }
  const d={lg:Math.max(0,lg-S.staffSeen.lg), intl:Math.max(0,intl-S.staffSeen.intl)};
  S.staffSeen={lg,intl};
  return d;
}

/* ---------- 每赛段维护 ---------- */
/* 回归系数：2026-09-08 0.32 → 0.18。
   0.32 等于「上赛段的表现三分之一直接作废」，平衡点 =(16+每段收益)/0.32，
   65% 胜率 + 复盘 3 次也只到 67，够不到挂牌要的门槛。0.18 之后同样的表现到 80。 */
export const TRUST_REGRESS=0.18;
export function cloutTick(won?){
  if(S.listCooldown>0) S.listCooldown--;
  if(S.signCooldown>0) S.signCooldown--;
  // 本赛段的信任收支，摊给界面看——玩家抱怨的从来不是难，是不知道要干什么
  const log={coach:[],mgr:[]};
  const put=(k,n,why)=>{ if(Math.abs(n)<0.05) { if(why) log[k].push({why,v:0}); return; }
    log[k].push({why,v:q1(n)}); addStaff(k,n); };
  // 信任向 50 回归：教练和经理不会因为你两年前打得好就一直信你。
  // 不加这条，中期之后门槛形同虚设。
  if(S.staff){
    const c0=S.staff.coach, m0=S.staff.mgr;
    S.staff.coach=q1(clamp(c0+(50-c0)*TRUST_REGRESS,0,100));
    S.staff.mgr  =q1(clamp(m0+(50-m0)*TRUST_REGRESS,0,100));
    if(Math.abs(S.staff.coach-c0)>=0.05) log.coach.push({why:"时间冲淡",v:q1(S.staff.coach-c0)});
    if(Math.abs(S.staff.mgr  -m0)>=0.05) log.mgr  .push({why:"时间冲淡",v:q1(S.staff.mgr  -m0)});
  }
  // 荣誉：先记，这是最重的一项
  const H=newHonors();
  if(H.lg)   { put("coach",H.lg*HONOR_COACH.lg,     `联赛冠军 ×${H.lg}`);
               put("mgr",  H.lg*HONOR_MGR.lg,       `联赛冠军 ×${H.lg}`); }
  if(H.intl) { put("coach",H.intl*HONOR_COACH.intl, `国际冠军 ×${H.intl}`);
               put("mgr",  H.intl*HONOR_MGR.intl,   `国际冠军 ×${H.intl}`); }
  // 教练看你练不练、比赛顶不顶
  const g=(S.record?S.record.w+S.record.l:0);
  if(g>0) put("coach",((S.record.w/g)-0.5)*22,`胜率 ${Math.round(S.record.w/g*100)}%`);
  put("coach",clamp((S.btk&&S.btk.vod||0)-1,-1,3),`复盘 ${(S.btk&&S.btk.vod)||0} 次`);   // 复盘做得多，教练喜欢
  if(S.fatigue>78) put("coach",-2,"练过头了");                 // 把自己练废了他也不高兴
  // 经理看你值不值钱
  put("mgr",clamp((S.fans-90)/26,-4,6),"人气");
  if(g>0) put("mgr",((S.record.w/g)-0.5)*12,`胜率 ${Math.round(S.record.w/g*100)}%`);
  S.staffLog=log;
  relDrift(g>0&&S.record.w>=S.record.l);
  syncRelations();
}

/* ---------- 界面 ---------- */
export function cloutCard(){
  if(!S.team) return "";
  const c=cloutOf(), T=cloutTier(c);
  const L=canList(), G=canSign();
  const mates=myRoster().filter(p=>!p.me);
  const bar=(v,col)=>`<div class="track"><div class="fill" style="width:${clamp(v,0,100)}%;background:${col}"></div></div>`;
  const gold="linear-gradient(90deg,#6B5A2A,var(--gold))";
  const cyan="linear-gradient(90deg,var(--cyan-dim),var(--cyan))";
  return `<div class="card"><h2>话语权<em>${T.n}</em></h2>
    <div class="attrs">
      <div class="at"><div class="lb">威望</div>${bar(c,gold)}
        <div class="vn mono"><b>${c}</b></div></div>
      <div class="at"><div class="lb">教练</div>${bar(coachTrust(),cyan)}
        <div class="vn mono"><b>${Math.round(coachTrust())}</b></div></div>
      <div class="at"><div class="lb">经理</div>${bar(mgrTrust(),cyan)}
        <div class="vn mono"><b>${Math.round(mgrTrust())}</b></div></div>
    </div>
    <p class="note">${T.d}　威望来自冠军、人气、你在队里的分量和生涯战绩。</p>
    ${trustLedger()}

    <h3 style="font-size:13px;color:var(--ink-3);margin:18px 0 8px">挂牌队友
      ${L.ok?'<span class="tag g">可以提</span>':'<span class="tag">条件不足</span>'}</h3>
    ${L.ok?`<div class="grid g2">${mates.map(t=>{
        const p=listOdds(t);
        return `<button class="act" data-list="${t.id}">
          <div class="t">${avatarOf(t,20)} 挂牌 ${t.id}</div>
          <div class="d">${POSN[t.pos]}　信任 ${Math.round(trustOf(t.id))}
            成算 <b style="color:${p>=0.5?'var(--cyan)':p>=0.3?'var(--gold)':'var(--red)'}">${(p*100).toFixed(0)}%</b><br>
            <span style="color:var(--red)">谈崩会走漏风声</span></div></button>`;
      }).join("")}</div>`
      :`<p class="note lockhow">🔒 ${L.why}</p>`}

    <h3 style="font-size:13px;color:var(--ink-3);margin:18px 0 8px">点名引援
      ${G.ok?'<span class="tag g">可以提</span>':'<span class="tag">条件不足</span>'}</h3>
    ${G.ok?(()=>{const ts=signTargets();
       return ts.length?`<div class="grid g2">${ts.map(x=>{
         const p=signOdds(x);
         return `<button class="act" data-sign="${x.p.id}">
           <div class="t">${avatarOf(x.p,20)} 要 ${x.p.id}${x.p.cn?`（${x.p.cn}）`:""}</div>
           <div class="d">${POSN[x.p.pos]}　来自 ${x.team}
             成算 <b style="color:${p>=0.5?'var(--cyan)':p>=0.3?'var(--gold)':'var(--red)'}">${(p*100).toFixed(0)}%</b></div></button>`;
       }).join("")}</div>`:`<p class="note">现在没有你够得着又值得要的人。</p>`;})()
      :`<p class="note lockhow">🔒 ${G.why}</p>`}
  </div>`;
}

/* 上赛段教练/经理信任的收支明细。
   「挂牌用不了」的真正原因不是难，是玩家不知道教练在看什么——
   复盘次数的批测中位数是 0，因为没人告诉过他这是一门功课。 */
export function trustLedger(){
  const L=S.staffLog;
  if(!L||(!L.coach.length&&!L.mgr.length)) return "";
  const line=(rows,now)=>{
    if(!rows.length) return "—";
    const net=rows.reduce((a,b)=>a+b.v,0);
    return rows.map(r=>`<span class="tl-i${r.v>0?" up":r.v<0?" dn":""}">${r.why}
      <b>${r.v>0?"+":""}${r.v.toFixed(1)}</b></span>`).join("")
      +`<span class="tl-n">净 <b>${net>0?"+":""}${net.toFixed(1)}</b> → 现在 ${Math.round(now)}</span>`;
  };
  const need=Math.max(0,LIST_GATE.coach-coachTrust());
  return `<div class="tled">
    <div class="tl-r"><span class="tl-k">教练上赛段</span><span class="tl-v">${line(L.coach,coachTrust())}</span></div>
    <div class="tl-r"><span class="tl-k">经理上赛段</span><span class="tl-v">${line(L.mgr,mgrTrust())}</span></div>
    <p class="note" style="margin:6px 0 0">挂牌要<b>教练信任 ${LIST_GATE.coach}</b>${
      need>0?`（还差 <b style="color:var(--gold)">${need.toFixed(0)}</b>）`:"（已达标）"}，
      或者<b>威望 ${LIST_GATE.vetClout}</b> 用功勋压过教练组。
      教练看的是<b>胜率</b>、<b>每赛段的复盘次数</b>和<b>冠军</b>；经理看的是<b>人气</b>、<b>胜率</b>和<b>冠军</b>。
      两边每赛段都会往 50 回落一点——一次打好不算数，得一直好。</p></div>`;
}

/* 队友关系网 */
export function relCard(){
  const m=myRoster().filter(p=>!p.me);
  if(m.length<2||!S.rel) return "";
  const pairs=[];
  for(let i=0;i<m.length;i++) for(let j=i+1;j<m.length;j++)
    pairs.push({a:m[i],b:m[j],v:relOf(m[i].id,m[j].id)});
  pairs.sort((x,y)=>x.v-y.v);
  const worst=pairs[0];
  return `<div class="card"><h2>更衣室关系<em>${(relMod()>=1.005?"融洽":relMod()<=0.99?"有裂痕":"一般")}</em></h2>
    <div class="relgrid">${pairs.map(p=>`
      <div class="relrow ${p.v<32?'bad':p.v>=68?'good':''}">
        <span class="rn">${p.a.id.slice(0,8)} ↔ ${p.b.id.slice(0,8)}</span>
        <span class="rb"><i style="width:${clamp(p.v,0,100)}%"></i></span>
        <span class="rv mono">${Math.round(p.v)}</span></div>`).join("")}</div>
    <p class="note">这是<b>队友互相之间</b>的关系，撑的是默契——和「他们对你的信任」是两回事，
      <b>两条 0–100 不是一把尺</b>：信任有二十几个来源、生涯末常常顶到 100；
      队友互相的关系起点就是 42–61，只会慢慢动。
      ${worst.v<32?`<b style="color:var(--red)">${worst.a.id} 和 ${worst.b.id} 已经不怎么说话了</b>——这会直接吃掉默契。`
        :"目前没有闹到台面上的矛盾。"}<br>
      推得动它的是这几件事：<b>「队伍」栏的找人聊聊</b>、战队合练、约队友吃火锅、
      把矛盾摊开讲的那些际遇；连败、挂牌和买断会把它拉开。</p></div>`;
}
