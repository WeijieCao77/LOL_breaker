import { DIMS, POSN, SEASONS, SPLITS, addFat, apCost, apTag, avg, capOf, clamp, myRoster, ovrOf, pushEvent, q1, render } from "./main";
import { addRel } from "./clout";
import { addBuff } from "./random";
import { addTrust, trustOf } from "./team";
import { checkAch } from "./achieve";
import { S } from "./state";

/* ================= 共事账本（羁绊第一批）=================

   作者原话（2026-09-09）：「刚去的时候四个大哥带我一个，大哥老了我带一绿带四红
   硬带他们夺冠，后面来了新人，我也带着他们一点点成长夺冠，最后我要退役了，
   小弟们的综评已经超越我了，开始带飞我了，就会有的感触」。

   这条弧线在数值里本来就跑着：ageWorld() 每年给 ≤23 岁的队友 +2.3、给 ≥24 岁的
   按 ageCurve 扣，30 岁退役换新秀；boxscore 每一场都算你和队友的评分差。
   缺的不是机制，是**记忆**——team.ts 的 syncTrust() 里有一行
   `if(!ids.includes(k)) delete S.trust[k]`，队友一离开名单，你和他的一切就没了。
   所以退役仪式那句「队友：XX 的位置一直给你留着」只能不带名字：游戏从来没记过是谁。

   这个模块只做三件事，一个数值都不改：
   · 记（bondSync / bondRetire）：谁和你同队过、多久、拿过什么、怎么走的——永不删除
   · 认（bondSplitEnd）：用已经算好的 boxscore 评分，判每个赛段你是「被带 / 并肩 / 带人」
   · 说（bondCardLines）：生涯名片上多两行

   四个时刻和「找人聊聊」是第二、三批，账本是它们共同的地基。 */

/* 角色是**对每一个人**判的，不是对整支队伍判的——作者说的正是具体的人：
   「四个大哥带我一个」「后面来了新人，我带着他们」。对全队取平均会把这两件事
   一起抹平（实测：整队口径下 388 个赛段里 376 个都判成「并肩」）。

   两根轴，正好是作者说的那四段：
                 队友更强            队友更弱
     队友更老     被带                扛旗（大哥老了，队伍你在扛）
     队友更年轻   被带飞（他超过你了）  带人（你带着新人成长）

   实力轴用五维均值（ovrOf）而不是单场评分：评分里带着你的临场选择加成，
   实测 66% 的赛段你的评分都压过队友，那条轴分不开人。五维均值是硬的。 */
export const BOND_OVR=2.0;        // 五维均值差这么多才算得上强弱之分
export const BOND_MIN_GAMES=3;    // 一个赛段至少打三个系列赛才判角色，别拿两场定性
export const BOND_MAX=80;         // 账本上限：超了就丢掉最不重要的（已离队且共事最短的）
export const BOND_ROLES=["被带","扛旗","被带飞","带人","并肩"];

export function bondBook(){ if(!S.mates) S.mates={}; return S.mates; }
export function bondKey(){ return (S.si||0)+"-"+(S.split||0); }
export function bondOf(id){ const b=S.mates; return (b&&b[id])||null; }
/* 这个人和你一起打过几个赛段是「带人」/「被带」/「并肩」 */
export function bondRoleCount(e,role){
  if(!e||!e.roles) return 0;
  return Object.keys(e.roles).filter(k=>e.roles[k]===role).length;
}

/* 登记 / 更新一条。只在名单里出现过的人才建档。 */
export function bondSee(p){
  if(!p||p.me||!p.id) return null;
  const b=bondBook();
  let e=b[p.id];
  if(!e){
    e=b[p.id]={id:p.id, cn:p.cn||"", pos:p.pos||"",
               firstSi:(S.si||0), firstKey:bondKey(), lastSi:(S.si||0),
               team:S.team||"", splits:0, games:0, titles:[], peakTrust:0,
               roles:{}, gone:null, goneSi:null};
    bondTrim();
  }
  e.lastSi=(S.si||0);
  e.gone=null; e.goneSi=null;        // 回来了（重新同队）就不再算「离开」
  if(p.cn&&!e.cn) e.cn=p.cn;
  const t=(S.trust&&S.trust[p.id]);
  if(typeof t==="number"&&t>(e.peakTrust||0)) e.peakTrust=q1(t);
  return e;
}

/* 账本别把存档撑大：满了就丢掉「已经离开、而且共事最短」的那些。
   还在队里的、以及共事 >=2 个赛段的人永远不丢。 */
export function bondTrim(){
  const b=S.mates||{}, ks=Object.keys(b);
  if(ks.length<=BOND_MAX) return;
  const drop=ks.filter(k=>b[k].gone&&(b[k].splits||0)<2)
               .sort((x,y)=>(b[x].splits||0)-(b[y].splits||0));
  let need=ks.length-BOND_MAX;
  for(let i=0;i<drop.length&&need>0;i++,need--) delete b[drop[i]];
}

/* 名单同步时调（team.ts 的 syncTrust）：在场的登记，不在场的标记离开——但不删。 */
export function bondSync(){
  if(!S.career||!S.team) return;
  let ids=[];
  try{ ids=myRoster().filter(p=>!p.me).map(p=>p.id); }catch(e){ return; }
  try{ myRoster().forEach(p=>{ if(!p.me) bondSee(p); }); }catch(e){}
  const b=bondBook();
  Object.keys(b).forEach(k=>{
    if(!ids.includes(k)&&!b[k].gone){ b[k].gone="left"; b[k].goneSi=(S.si||0); }
  });
}
/* ageWorld 里我队的人到点退役 */
export function bondRetire(id){
  const e=bondOf(id); if(!e) return;
  e.gone="retired"; e.goneSi=(S.si||0);
}

/* ---------- 这个赛段谁带谁 ---------- */
/* 每个系列赛打完攒一次（synthSeriesStats 调）。用的是已经算好的 boxscore，
   不另外造数——「一绿带四红」本来每一场都在算，只是从来没有被累计过。 */
export function bondNoteMatch(box){
  if(!S.career||!box||!box.mine) return;
  const k=bondKey();
  let a=S.bondAcc;
  if(!a||a.k!==k) a=S.bondAcc={k, n:0, me:0, mates:{}};
  const me=box.mine.find(x=>x.me); if(!me) return;
  a.n++; a.me+=me.rating;
  box.mine.forEach(x=>{
    if(x.me) return;
    const r=a.mates[x.id]||(a.mates[x.id]={n:0,sum:0});
    r.n++; r.sum+=x.rating;
  });
}
/* 我现在的五维均值 */
export function bondMyOvr(){ return avg(DIMS.map(d=>(S.attrs&&S.attrs[d])||0)); }
/* 相对某一个队友，这个赛段你是什么角色 */
export function bondRoleVs(p){
  if(!p||p.me) return null;
  const ovrGap=bondMyOvr()-ovrOf(p);
  const ageGap=(S.age||20)-(p.age||22);
  let role="并肩";
  if(ovrGap<=-BOND_OVR) role=(ageGap<0)?"被带":"被带飞";
  else if(ovrGap>=BOND_OVR) role=(ageGap<=0)?"扛旗":"带人";
  return {role, ovrGap:q1(ovrGap), ageGap:q1(ageGap)};
}
/* 这个赛段整队的样子：每个角色各有几个人。样本不够就不下结论。 */
export function bondRolesNow(){
  const a=S.bondAcc;
  if(!a||a.k!==bondKey()||a.n<BOND_MIN_GAMES) return null;
  let ms=[];
  try{ ms=myRoster().filter(p=>!p.me); }catch(e){ return null; }
  if(!ms.length) return null;
  const per={}, cnt={};
  ms.forEach(p=>{ const r=bondRoleVs(p); if(!r) return; per[p.id]=r; cnt[r.role]=(cnt[r.role]||0)+1; });
  // 场均评分差：不判角色，但写进事件里当证据——「一绿带四红」看的就是它
  const ids=Object.keys(a.mates);
  const rGap=ids.length?q1(a.me/a.n-avg(ids.map(i=>a.mates[i].sum/Math.max(1,a.mates[i].n)))):0;
  return {per, cnt, rGap, n:a.n};
}
export const BOND_ROLE_TXT={
  被带:"他比你强，也比你老——这一年是他在带你。",
  扛旗:"他还在队里，但已经不是当年那个他了。这一年队伍你在扛。",
  被带飞:"他比你年轻，综评已经压过你了。轮到他带你了。",
  带人:"他还年轻、还不够强——这一年你带着他打。",
  并肩:"你们谁也没落下。"
};

/* 赛段结算（endSeason 调）：把这个赛段算进账本，然后清掉累加器。 */
export function bondSplitEnd(result){
  if(!S.career||!S.team) return null;
  const R=bondRolesNow(), key=bondKey(), a=S.bondAcc;
  const games=(a&&a.k===key)?a.n:0;
  const title=(result==="champion"&&!S.benchedPO)
    ? `${SEASONS[S.si]?SEASONS[S.si].tag:"S"} ${S.homeLeague||"LPL"}${SPLITS[S.split||0]||""}` : null;
  let ms=[];
  try{ ms=myRoster().filter(p=>!p.me); }catch(e){ ms=[]; }
  ms.forEach(p=>{
    const e=bondSee(p); if(!e) return;
    if(e.roles[key]===undefined) e.splits=(e.splits||0)+1;
    e.games=(e.games||0)+games;
    if(R&&R.per[p.id]) e.roles[key]=R.per[p.id].role;
    if(title&&!e.titles.includes(title)) e.titles.push(title);
  });
  S.bondAcc=null;
  if(R){
    S.bondRole={si:S.si, sp:(S.split||0), cnt:R.cnt, rGap:R.rGap};
    const bits=["带人","扛旗","被带","被带飞"].filter(k=>R.cnt[k]).map(k=>`<b>${k}</b> ${R.cnt[k]} 人`);
    if(bits.length) pushEvent(
      `${SEASONS[S.si]?SEASONS[S.si].tag:""}${SPLITS[S.split||0]||""}打完，队里这五个人的位置：${bits.join(" · ")}${
        R.cnt["并肩"]?` · 并肩 ${R.cnt["并肩"]} 人`:""}。
      <span style="color:var(--ink-3)">你的场均评分和他们差 ${R.rGap>0?"+":""}${R.rGap.toFixed(2)}。</span>`,
      "info","更衣室");
  }
  return R;
}

/* ---------- 生涯名片上的两行 ---------- */
export function bondLongest(){
  const b=S.mates||{}, all: any[]=Object.keys(b).map(k=>b[k]);
  if(!all.length) return null;
  return all.slice().sort((x,y)=>(y.splits||0)-(x.splits||0)||(y.titles||[]).length-(x.titles||[]).length)[0];
}
/* 名片第二行找的是「你和这个人之间发生过什么」，按感情浓度排：
   ① 你带过他，后来他综评超过了你——作者原话「小弟们的综评已经超越我了，
      开始带飞我了」，这是整条弧线的收口，有就一定写它
   ② 你带过他最久
   ③ 没带过，但队里有人后来居上压过了你 */
export function bondFirstRole(e,role){
  if(!e||!e.roles) return null;
  const ks=Object.keys(e.roles).filter(k=>e.roles[k]===role).sort();
  return ks.length?ks[0]:null;
}
export function bondSiTag(key){
  const si=parseInt(String(key).split("-")[0],10);
  return (SEASONS[si]&&SEASONS[si].tag)||("S"+si);
}
export function bondProtege(){
  const b=S.mates||{}, all: any[]=Object.keys(b).map(k=>b[k]);
  const grew=all.filter(e=>bondRoleCount(e,"带人")>=1&&bondRoleCount(e,"被带飞")>=1);
  if(grew.length) return {e:grew.sort((x,y)=>bondRoleCount(y,"带人")-bondRoleCount(x,"带人"))[0], kind:"grew"};
  const led=all.filter(e=>bondRoleCount(e,"带人")>=2);
  if(led.length) return {e:led.sort((x,y)=>bondRoleCount(y,"带人")-bondRoleCount(x,"带人")||(y.splits||0)-(x.splits||0))[0], kind:"led"};
  const past=all.filter(e=>bondRoleCount(e,"被带飞")>=2&&(e.splits||0)>=2);
  if(past.length) return {e:past.sort((x,y)=>bondRoleCount(y,"被带飞")-bondRoleCount(x,"被带飞"))[0], kind:"passed"};
  return null;
}
export function bondCardLines(){
  const out: any[]=[];
  const L=bondLongest();
  if(L&&(L.splits||0)>=2){
    const t=(L.titles||[]).length;
    out.push({k:"并肩最久", v:`${L.id} · ${L.splits} 个赛段${t?` · ${t} 冠`:""}`});
  }
  const P=bondProtege();
  if(P&&P.e&&(!L||P.e.id!==L.id)){
    const e=P.e;
    if(P.kind==="grew"){
      const at=bondFirstRole(e,"被带飞");
      out.push({k:"你带出来的", v:`${e.id} · 带了 ${bondRoleCount(e,"带人")} 个赛段${at?`，${bondSiTag(at)} 综评超过你`:""}`});
    }else if(P.kind==="led"){
      out.push({k:"你带过最久", v:`${e.id} · ${bondRoleCount(e,"带人")} 个赛段`});
    }else{
      const at=bondFirstRole(e,"被带飞");
      out.push({k:"后来居上", v:`${e.id}${at?` · ${bondSiTag(at)} 综评超过你`:""}`});
    }
  }
  return out;
}


/* ================= 第二批：四个时刻 =================
   账本记下来的东西，得有人替它说话。四个时刻都只在「第一次」发生，
   而且都从已经写好的 roles 里读，不另掷骰子。 */

/* ① 交给你了：某个老将，你对他的角色第一次从「被带」翻成「扛旗 / 带人」。
   他把指挥交出来，你接过去——他确实在退场，你确实在接班。
   为什么选「指挥」而不是别的维：powerCore 里战力只吃 操作/运营/心态/体质，
   指挥单独走 cmd=max(全队指挥) 那一项。所以这一笔转移对队伍战力几乎中性
   （最多让全队最高的那个指挥小幅移位），难度不会被这段剧情推走。 */
export const BOND_HANDOVER=1.5;
/* ③ 他超过你了：你带过的人，第一次反过来压过你。
   作者原话「小弟们的综评已经超越我了，开始带飞我了，就会有的感触」——
   给的是踏实，不是打击。 */
export const BOND_PASS_BUFF=1.12, BOND_PASS_WEEKS=2;

export function bondMoments(R){
  if(!R||!R.per) return;
  const key=bondKey(), b=S.mates||{};
  let ms=[];
  try{ ms=myRoster().filter(p=>!p.me); }catch(e){ return; }
  ms.forEach(p=>{
    const e=b[p.id], r=R.per[p.id];
    if(!e||!r) return;
    // ① 接班：之前被他带过，这个赛段第一次反过来
    if(!e.handover&&(r.role==="扛旗"||r.role==="带人")&&bondRoleCount(e,"被带")>=1){
      e.handover=key;
      const give=Math.min(BOND_HANDOVER,Math.max(0,(p.r&&p.r.指挥||50)-30));
      if(give>0&&p.r){
        p.r.指挥=clamp(p.r.指挥-give,20,99);
        S.attrs.指挥=Math.min(capOf("指挥"),S.attrs.指挥+give);
      }
      addTrust(p.id,6);
      pushEvent(`赛段复盘的最后，<b>${p.id}</b> 把开麦指挥的位置让了出来：「以后这几个球你来喊。」<br>
        <span style="color:var(--cyan)">你的指挥 +${give.toFixed(1)}，他的指挥 −${give.toFixed(1)}。</span>
        <span style="color:var(--ink-3)">${BOND_ROLE_TXT[r.role]}</span>`,"big","更衣室");
    }
    // ③ 他超过你了：你带过他，这个赛段他第一次压过你
    if(!e.passed&&r.role==="被带飞"&&bondRoleCount(e,"带人")>=1){
      e.passed=key;
      addBuff("mood",BOND_PASS_BUFF,BOND_PASS_WEEKS,"看着他长起来");
      const led=bondRoleCount(e,"带人");
      pushEvent(`赛段数据出来了：<b>${p.id}</b> 的综评 <b>${ovrOf(p).toFixed(1)}</b>，你 ${bondMyOvr().toFixed(1)}。<br>
        ${led>=2?`你带了他 ${led} 个赛段。`:"你带过他。"}<b>现在轮到他带你了。</b>`,"big","更衣室");
    }
  });
}

/* 退役仪式点名用：陪你最久的人、你带出来的人 */
export function bondFarewellLines(){
  const out=[];
  const L=bondLongest();
  if(L&&(L.splits||0)>=2){
    const t=(L.titles||[]).length;
    out.push(`<b>${L.id}</b>：「${(L.splits>=5?"这么多年":"这几年")}都是我们俩在一块打${t?"，那" + t + "个冠军我记得清清楚楚":""}。」`);
  }
  const P=bondProtege();
  if(P&&P.e&&(!L||P.e.id!==L.id)){
    out.push(P.kind==="grew"
      ? `<b>${P.e.id}</b>：「我刚上来那年打崩了，是你陪我练的。后来我打得比你好了，你比我还高兴。」`
      : P.kind==="led"
      ? `<b>${P.e.id}</b>：「你带了我 ${bondRoleCount(P.e,"带人")} 个赛段。这些我都记着。」`
      : `<b>${P.e.id}</b>：「我是踩着你的肩膀上来的。」`);
  }
  return out;
}

/* ================= 第三批：找人聊聊 =================
   1 个行动点，每赛段总共两次、每人一次。选项按你和他的角色变——
   同一个动作对老将、对同龄、对新人本来就不是一回事。 */
export const BOND_TALK_PER_SPLIT=1;
export const BOND_TALK_FAT=6;
/* 数值刻意小：这条通道的价值在关系和剧情，不在成长。
   给自己的那点属性按「一个行动点」定价——训练是 2 点换约 1.0，这里 1 点换 0.2 上下，
   单位收益低于训练，不会变成新的最优解（240 局批测把关，见 PR）。 */
/* 这张表的数字是 240 局批测定的（2026-09-09，作者要求「保证游戏的难度还是在」）。
   过程记在这儿，免得以后有人手滑调回去，也免得再被同一个坑绊一次：

   · 先说那个坑：光比「用不用这个功能」是错的。把这张表的效果**全部置零**、
     只保留它消耗 1 个行动点，联赛夺冠率照样从 70.0% 涨到 77.5%——
     因为批测机器人是贪心花点：8 点正好four次训练，被挤掉 1 点之后变成
     3 次训练 + 1 次排位，而排位涨状态、状态是直接乘在战力上的。
     那 7 个点是**测量工具自己变强了**，不是游戏变简单了。
     正确的对照是「同样消耗行动点，效果开 vs 关」：
       联赛夺冠率 77.5% → 78.7%、我队战力 77.67 → 77.92、生涯末五维 79.49 → 79.61，
     全部落在噪声里（240 局，2σ≈5.9 个点）。
   · 隔离批测还证明：账本、角色、四个时刻、退役点名一个数字都不动——
     关掉「找人聊聊」单跑 240 局，联赛夺冠率 70.0% → 69.6%。
   · 即便如此，这张表还是按保守口径定的，因为它是唯一会动数值的一块：
     关系只加在**和他有关的那几对**上，不是全队十对一起涨（你陪一个人加练，
     另外三个人之间的关系不会因此变好）；信任从初版的 +6~10 压到 +3~5
     （avgTrust 生涯末本来就顶到 100，而 trustMod=1+(avgTrust−50)/760 直接乘在
     全队战力上，提早顶满等于白送）；次数从每赛段两次压到**一次**——
     每赛段挑一个人好好聊一次，也比挑两个人各聊半次更像话。 */
export const BOND_TALK={
  被带:  {t:"找他请教", d:"他比你强，问就是了", self:0.18, mate:0,   trust:3, rel:0.4},
  被带飞:{t:"找他请教", d:"他现在比你强——放下面子", self:0.18, mate:0,   trust:3, rel:0.4},
  扛旗:  {t:"陪他复盘", d:"他手速掉了，但他看得懂比赛", self:0.15, mate:0.2, trust:4, rel:0.4},
  并肩:  {t:"一起双排", d:"练默契，也拉近关系",       self:0.10, mate:0,   trust:4, rel:0.6},
  带人:  {t:"陪他加练", d:"你也从那个位置过来过",     self:0.12, mate:0.2, trust:5, rel:0.4}
};
export function bondTalkKey(){ return "t"+(S.si||0)+"-"+(S.split||0); }
export function bondTalkState(){
  const k=bondTalkKey();
  if(!S.bondTalk||S.bondTalk.k!==k) S.bondTalk={k, n:0, ids:[]};
  return S.bondTalk;
}
export function bondTalkLeft(){ return Math.max(0,BOND_TALK_PER_SPLIT-bondTalkState().n); }
export function bondTalkCan(id){
  if(!S.career||!S.team) return {ok:false,why:"还没进队"};
  const st=bondTalkState();
  if(st.ids.indexOf(id)>=0) return {ok:false,why:"这个赛段已经找过他了"};
  if(bondTalkLeft()<=0) return {ok:false,why:`这个赛段的时间用完了（${BOND_TALK_PER_SPLIT} 次）`};
  if((S.ap||0)<apCost("talk")) return {ok:false,why:`要 ${apCost("talk")} 个行动点`};
  return {ok:true};
}
/* 他最强 / 最弱的那一维——请教找他最强的，陪练补他最弱的 */
export function bondTopDim(p,worst?){
  const r=(p&&p.r)||{};
  let best=DIMS[0];
  DIMS.forEach(d=>{ if(worst?((r[d]||50)<(r[best]||50)):((r[d]||50)>(r[best]||50))) best=d; });
  return best;
}
export function doBondTalk(id){
  const c=bondTalkCan(id); if(!c.ok) return;
  let p=null;
  try{ p=myRoster().find(x=>!x.me&&x.id===id); }catch(e){}
  if(!p) return;
  const r=bondRoleVs(p); if(!r) return;
  const A=BOND_TALK[r.role]||BOND_TALK["并肩"];
  S.ap-=apCost("talk"); addFat(BOND_TALK_FAT);
  const st=bondTalkState(); st.n++; st.ids.push(id);
  let line="";
  if(A.self>0){
    const d=(r.role==="带人"||r.role==="扛旗")?"心态":bondTopDim(p);
    S.attrs[d]=Math.min(capOf(d),S.attrs[d]+A.self);
    line+=`你的${d} +${A.self.toFixed(2)}`;
  }
  if(A.mate>0&&p.r&&p.ceil!==undefined&&ovrOf(p)<p.ceil){
    /* 队友的成长封在他自己的天花板里，而且**只有带着 ceil 的人**才教得动——
       ceil 是 makeRookie 给每个青训定的，2022 那批真实名单里的人没有这个字段。
       所以你能带起来的永远是「本来就会长起来的年轻人」，你只是让他更快到那儿；
       联赛里那些成名选手不会因为你陪他复盘而突破自己的上限。
       世界的水位不该被玩家的行动点抬高——这是难度不被这条通道推走的第一道闸。 */
    const d=bondTopDim(p,true);
    p.r[d]=clamp(p.r[d]+A.mate,20,Math.min(99,p.ceil+2));
    line+=`${line?"，":""}${p.id} 的${d} +${A.mate.toFixed(2)}`;
  }
  addTrust(id,A.trust);
  // 只动和他有关的那几对（五人队里是四对），不是全队十对——见 BOND_TALK 上面那段
  if(A.rel){ try{ myRoster().filter(x=>!x.me&&x.id!==id).forEach(o=>addRel(id,o.id,A.rel)); }catch(e){} }
  const e=bondSee(p); if(e) e.talks=(e.talks||0)+1;
  if(r.role==="带人") checkAch("mentor");
  pushEvent(`${A.t}：<b>${p.id}</b>（${POSN[p.pos]||""}）。${line?`<span style="color:var(--cyan)">${line}</span>，`:""}他对你的信任 +${A.trust}，更衣室关系 +${A.rel}。`,"good","更衣室");
  render();
}
export function bondPanel(){
  if(!S.career||!S.team) return "";
  let ms=[];
  try{ ms=myRoster().filter(p=>!p.me); }catch(e){ return ""; }
  if(!ms.length) return "";
  const left=bondTalkLeft();
  return `<div class="card"><h2>找人聊聊<em>这个赛段还剩 ${left}/${BOND_TALK_PER_SPLIT} 次</em></h2>
    <div class="grid g5">${ms.map(p=>{
      const r=bondRoleVs(p)||{role:"并肩"}, A=BOND_TALK[r.role]||BOND_TALK["并肩"], c=bondTalkCan(p.id);
      const e=bondOf(p.id);
      return `<button class="act" data-bond="${p.id}" ${c.ok?"":'disabled style="opacity:.34"'} title="${c.ok?A.d:c.why}">
        <div class="t">${A.t} ${apTag("talk")}</div>
        <div class="d"><b>${p.id.slice(0,9)}</b> · ${POSN[p.pos]||""} · ${p.age||"?"} 岁
          <span class="tag${r.role==="带人"||r.role==="扛旗"?" g":""}">${r.role}</span><br>
          ${c.ok?A.d:"🔒 "+c.why}${e&&e.splits?`<br><span style="color:var(--ink-3)">一起打了 ${e.splits} 个赛段${
            (e.titles||[]).length?` · ${e.titles.length} 冠`:""}${e.talks?` · 聊过 ${e.talks} 次`:""}</span>`:""}</div></button>`;
    }).join("")}</div>
    <p class="note">同一个动作对老将、对同龄、对新人不是一回事——<b>角色是按五维均值和年龄差自动判的</b>。
      陪新人加练能真的把他练起来，但<b>封在他自己的天花板里</b>：你让他更快到那儿，不是把他拔到别处去。</p></div>`;
}
