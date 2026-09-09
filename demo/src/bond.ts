import { DIMS, SEASONS, SPLITS, avg, myRoster, ovrOf, pushEvent, q1 } from "./main";
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
