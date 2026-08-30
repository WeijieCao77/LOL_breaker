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
function initStaff(){
  S.staff={coach:46+Math.floor(rnd()*10), mgr:46+Math.floor(rnd()*10)};
}
function coachTrust(){ return clamp((S.staff&&S.staff.coach)||50,0,100); }
function mgrTrust(){ return clamp((S.staff&&S.staff.mgr)||50,0,100); }
function addStaff(k,n){
  if(!S.staff) initStaff();
  // q1：写入就掐掉浮点尾巴，否则回归公式滚几个赛段，
  // 界面上就会出现 47.60402559999999 这种数
  S.staff[k]=q1(clamp(S.staff[k]+n,0,100));
}

/* ---------- 威望 ---------- */
/* 0~100。这是「别人凭什么听你的」的量化。 */
function cloutOf(){
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
  if(typeof avgTrust==="function") v+=clamp((avgTrust()-50)*0.16,-6,6);
  return clamp(Math.round(v),0,100);
}
function cloutTier(c){
  if(c>=78) return {n:"队魂",d:"你说的话，俱乐部会认真听。"};
  if(c>=62) return {n:"核心",d:"你在这支队里说得上话。"};
  if(c>=44) return {n:"主力",d:"打得不错，但还轮不到你定阵容。"};
  if(c>=26) return {n:"轮换",d:"先把位置坐稳再说别的。"};
  return {n:"新人",d:"没人会听一个新人的意见。"};
}

/* ---------- 队友两两关系 ---------- */
/* 除了「对你的信任」，队友之间也有关系。
   两个互相看不顺眼的人在场上就是配合不起来——直接吃默契。 */
function initRelations(){
  S.rel={};
  const m=myRoster().filter(p=>!p.me);
  for(let i=0;i<m.length;i++) for(let j=i+1;j<m.length;j++){
    S.rel[relKey(m[i].id,m[j].id)]=42+Math.floor(rnd()*20);
  }
}
function relKey(a,b){ return [a,b].sort().join("|"); }
function relOf(a,b){ const v=S.rel&&S.rel[relKey(a,b)]; return v===undefined?50:v; }
function addRel(a,b,n){
  if(!S.rel) return;
  const k=relKey(a,b);
  if(S.rel[k]===undefined) return;
  S.rel[k]=clamp(S.rel[k]+n,0,100);
}
function syncRelations(){
  if(!S.rel) { initRelations(); return; }
  const ids=myRoster().filter(p=>!p.me).map(p=>p.id);
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
function relMod(){
  const v=Object.values(S.rel||{});
  if(!v.length) return 1;
  const worst=Math.min(...v);
  const mean=avg(v);
  return 1+((mean-50)/900)+((worst<32)?-(32-worst)/700:0);
}
/* 关系每赛段的自然漂移：一起赢会更近，一起输会互相埋怨 */
function relDrift(won){
  Object.keys(S.rel||{}).forEach(k=>{
    S.rel[k]=q1(clamp(S.rel[k]+(won?1.6:-2.2)+(rnd()*5-2.5),0,100));
  });
}

/* ---------- 挂牌队友 ---------- */
function canList(){
  const c=cloutOf(), ct=coachTrust();
  if(c<55) return {ok:false,why:`威望不够（${c}/55）。先打出成绩再谈阵容。`};
  if(ct<68) return {ok:false,why:`教练不认你（信任 ${Math.round(ct)}/68）。他不会为你动人。`};
  if(S.listCooldown>0) return {ok:false,why:`刚提过一次，${S.listCooldown} 个赛段内别再提。`};
  return {ok:true};
}
/* 成功率：目标越弱、你威望越高、教练越信你、你和他关系越差，越容易 */
function listOdds(t){
  const perf=t.r.操作*.34+t.r.运营*.28+t.r.心态*.14+t.r.体质*.10;
  const teamAvg=avg(myRoster().map(p=>p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10));
  let p=0.30;
  p+=(cloutOf()-55)/120;
  p+=(coachTrust()-68)/180;
  p+=clamp((teamAvg-perf)/16,-0.2,0.32);        // 他确实打得差
  p-=clamp((trustOf(t.id)-50)/200,-0.15,0.22);  // 他跟你关系好，你反而难开口
  if(t.age>=27) p+=0.08;                         // 老将本来就该换了
  if(t.rookie) p-=0.10;                          // 青训才提上来，俱乐部要脸面
  return clamp(p,0.05,0.82);
}
function doList(id){
  const t=myRoster().find(p=>p.id===id);
  if(!t||!canList().ok) return;
  const p=listOdds(t), ok=rnd()<p;
  S.listCooldown=3;
  if(ok){
    const lg=S.homeLeague||"LPL";
    const team=myTeam();
    const base=(S.baseline&&S.baseline[lg])||50;
    const nr=makeRookie(t.pos,base-3);
    team.players=team.players.map(q=>q===t?nr:q);
    addStaff("coach",-4);                        // 教练替他惋惜
    addTrustAll(-6); relDrift(false);
    pushEvent(`你向教练组提出换掉 <b>${t.id}</b>，成功了。<br>
      ${t.id} 被挂牌，<b>${nr.id}</b> 从青训提上来。<br>
      <span style="color:var(--red)">更衣室安静了很久——他们知道这是你提的。</span>`,"big","话语权");
    syncTrust(); syncRelations();
    if(typeof checkAch==="function") checkAch("clout",{kind:"list",ok:true});
    if(typeof disruptSynergy==="function") disruptSynergy(1,`${t.id} 被挂牌`);
  }else{
    addTrust(t.id,-26); addTrustAll(-9); addStaff("coach",-14); relDrift(false);
    if(typeof addSquad==="function") addSquad("syn",-6);
    pushEvent(`你提出换掉 <b>${t.id}</b>，教练组没同意——<b>而且消息走漏了</b>。<br>
      <span style="color:var(--red)">${t.id} 知道了。整个更衣室都知道了。</span>`,"bad","话语权");
    if(typeof checkAch==="function") checkAch("clout",{kind:"list",ok:false});
  }
  render();
}

/* ---------- 点名引援 ---------- */
function canSign(){
  const c=cloutOf(), mt=mgrTrust();
  if(c<66) return {ok:false,why:`威望不够（${c}/66）。这种要求得是队魂级别的人才提得动。`};
  if(mt<72) return {ok:false,why:`经理不认你（信任 ${Math.round(mt)}/72）。他要先看到你值这个钱。`};
  if(S.signCooldown>0) return {ok:false,why:`本赛季已经提过，${S.signCooldown} 个赛段后再说。`};
  return {ok:true};
}
/* 你能要到多好的人，取决于威望和经理信任 */
function signTargets(){
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
  return pool.filter(x=>x.ovr<=reach+4&&x.ovr>=teamAvg-1)
             .sort((a,b)=>b.ovr-a.ovr).slice(0,5);
}
function signOdds(x){
  const teamAvg=avg(myRoster().filter(p=>!p.me).map(p=>
    p.r.操作*.34+p.r.运营*.28+p.r.心态*.14+p.r.体质*.10));
  let p=0.50;
  p+=(cloutOf()-66)/110;
  p+=(mgrTrust()-72)/160;
  p-=clamp((x.ovr-teamAvg)/18,0,0.30);        // 要得越好越难
  if(x.lg!==(S.homeLeague||"LPL")) p-=0.12;   // 跨赛区更麻烦
  return clamp(p,0.10,0.82);
}
function doSign(id){
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
      ((S.baseline&&S.baseline[x.lg])||50)-4):q);
    team.players=team.players.map(q=>q===out?Object.assign({},x.p):q);
    addStaff("mgr",-3);
    pushEvent(`俱乐部按你的要求把 <b>${x.p.id}</b>${x.p.cn?`（${x.p.cn}）`:""} 签了下来，
      ${out.id} 腾出位置。<br><b>这是你的话语权换来的——现在成绩得对得起它。</b>`,"big","话语权");
    syncTrust(); syncRelations();
    if(typeof checkAch==="function") checkAch("clout",{kind:"sign",ok:true});
    if(typeof disruptSynergy==="function") disruptSynergy(1,`${x.p.id} 加盟`);
  }else{
    addStaff("mgr",-12);
    pushEvent(`你向经理提出签下 <b>${x.p.id}</b>。<br>
      对方要价太高，谈崩了。<span style="color:var(--red)">经理觉得你不太懂行情。</span>`,"bad","话语权");
  }
  render();
}

/* ---------- 每赛段维护 ---------- */
function cloutTick(won){
  if(S.listCooldown>0) S.listCooldown--;
  if(S.signCooldown>0) S.signCooldown--;
  // 信任向 50 回归：教练和经理不会因为你两年前打得好就一直信你。
  // 不加这条，中期之后门槛形同虚设。
  if(S.staff){
    S.staff.coach=q1(clamp(S.staff.coach+(50-S.staff.coach)*0.32,0,100));
    S.staff.mgr  =q1(clamp(S.staff.mgr  +(50-S.staff.mgr)  *0.32,0,100));
  }
  // 教练看你练不练、比赛顶不顶
  const g=(S.record?S.record.w+S.record.l:0);
  if(g>0) addStaff("coach",((S.record.w/g)-0.5)*22);
  addStaff("coach",clamp((S.btk&&S.btk.vod||0)-1,-1,3));      // 复盘做得多，教练喜欢
  if(S.fatigue>78) addStaff("coach",-2);                       // 把自己练废了他也不高兴
  // 经理看你值不值钱
  addStaff("mgr",clamp((S.fans-90)/26,-4,6));
  if(g>0) addStaff("mgr",((S.record.w/g)-0.5)*12);
  relDrift(g>0&&S.record.w>=S.record.l);
  syncRelations();
}

/* ---------- 界面 ---------- */
function cloutCard(){
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

    <h3 style="font-size:13px;color:var(--ink-3);margin:18px 0 8px">挂牌队友
      ${L.ok?'<span class="tag g">可以提</span>':'<span class="tag">条件不足</span>'}</h3>
    ${L.ok?`<div class="grid g2">${mates.map(t=>{
        const p=listOdds(t);
        return `<button class="act" data-list="${t.id}">
          <div class="t">${typeof avatarOf==="function"?avatarOf(t,20):""} 挂牌 ${t.id}</div>
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
           <div class="t">${typeof avatarOf==="function"?avatarOf(x.p,20):""} 要 ${x.p.id}${x.p.cn?`（${x.p.cn}）`:""}</div>
           <div class="d">${POSN[x.p.pos]}　来自 ${x.team}
             成算 <b style="color:${p>=0.5?'var(--cyan)':p>=0.3?'var(--gold)':'var(--red)'}">${(p*100).toFixed(0)}%</b></div></button>`;
       }).join("")}</div>`:`<p class="note">现在没有你够得着又值得要的人。</p>`;})()
      :`<p class="note lockhow">🔒 ${G.why}</p>`}
  </div>`;
}

/* 队友关系网 */
function relCard(){
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
    <p class="note">这是<b>队友互相之间</b>的关系，撑的是默契——和「他们对你的信任」是两回事。
      ${worst.v<32?`<b style="color:var(--red)">${worst.a.id} 和 ${worst.b.id} 已经不怎么说话了</b>——这会直接吃掉默契。`
        :"目前没有闹到台面上的矛盾。"}
      合练和团建能缓和，连败会加剧。</p></div>`;
}
