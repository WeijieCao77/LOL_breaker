/* ================= AI 转会市场 =================

   玩家原话：「这个世界的选手不会转会吗？二队实力都超过一队了也不提拔也不转会……
   转会会造成队伍实力变化、默契降低、选手间关系变化，现在的世界太过于死板。」

   两个窗口，和玩家自己的升队窗口对齐：
   · 季中间歇（春→夏）：提拔 / 下放——二队某位置比一队强 2 分以上，七成概率换上去，被顶掉的人下放
   · 休赛期：提拔 / 下放 + 跨队转会——弱队（下半区）里高于队均 4 分、27 岁以下的好手，
     被上半区某支该位置更弱的队买走，被顶掉的人反向流动（每个联赛最多约 30% 的队数）
   代价：换过人的 AI 队默契 −6 / 战术 −2.7 一次，之后每个窗口回补 +3 / +1.35 直到回到原水位；
   主角所在队走 watchRoster → disruptSynergy 那套（默契砸、离队队友事件、新人重建信任与关系）。
   主角自己的位置 AI 不碰——那由替补/换下机制管。 */

const MKT={promoGap:2, promoP:0.7, xferP:0.35, maxPerLeague:0.3, synHit:6, synHeal:3};

function mktOvr(p){ const r=p.r||p; return avg(DIMS.map(d=>r[d]||0)); }
function mktIsMine(t){ return !!(S.team&&t&&t.name===S.team); }
function mktSynHit(t,n){
  if(!t||t.syn===undefined) return;
  if(t.synBase===undefined) t.synBase=t.syn;
  t.syn=Math.max(20,q1(t.syn-MKT.synHit*n));
  if(t.tac!==undefined){ if(t.tacBase===undefined) t.tacBase=t.tac; t.tac=Math.max(20,q1(t.tac-MKT.synHit*0.45*n)); }
}
function mktHeal(){
  Object.keys(S.world||{}).forEach(lg=>(S.world[lg]||[]).forEach(t=>{
    if(mktIsMine(t)) return;
    if(t.synBase!==undefined&&t.syn<t.synBase) t.syn=q1(Math.min(t.synBase,t.syn+MKT.synHeal));
    if(t.tacBase!==undefined&&t.tac<t.tacBase) t.tac=q1(Math.min(t.tacBase,t.tac+MKT.synHeal*0.45));
  }));
}

/* 提拔 / 下放：只在 LPL 与其二队之间 */
function aiPromotions(){
  const out=[]; const L=S.world&&S.world.LDL, P=S.world&&S.world.LPL; if(!L||!P) return out;
  L.forEach(acad=>{
    const par=P.find(t=>t.name===acad.parent); if(!par) return;
    POS.forEach(x=>{
      const a=acad.players.find(q=>q.pos===x.k&&!q.me), f=par.players.find(q=>q.pos===x.k);
      if(!a||!f||f.me) return;
      if((mktIsMine(par)||mktIsMine(acad))&&x.k===S.pos) return;   // 主角的位置不由 AI 动
      if(mktOvr(a)<mktOvr(f)+MKT.promoGap||rnd()>=MKT.promoP) return;
      par.players=par.players.map(q=>q===f?a:q);
      acad.players=acad.players.map(q=>q===a?f:q);
      a.lg=par.players[0]&&par.players[0].lg||"LPL"; f.lg="LDL";
      mktSynHit(par,1); mktSynHit(acad,1);
      out.push({kind:"promo",team:par.name,acad:acad.name,up:a.id,down:f.id,pos:x.k});
    });
  });
  return out;
}

/* 跨队转会：联赛内部；被买走的人与被顶掉的人互换东家 */
function aiTransfers(){
  const out=[];
  Object.keys(S.world||{}).forEach(lg=>{
    if(lg==="LDL") return;
    const teams=S.world[lg]; if(!teams||teams.length<4) return;
    const pw=t=>{ try{ return power(t,0,SEASONS[S.si]&&SEASONS[S.si].fav); }catch(e){ return avg(t.players.map(mktOvr)); } };
    const rank=teams.slice().sort((a,b)=>pw(b)-pw(a));
    const half=Math.floor(rank.length/2);
    const top=rank.slice(0,half), bottom=rank.slice(half);
    const cap=Math.max(2,Math.round(teams.length*MKT.maxPerLeague));
    let moves=0;
    const cands=[];
    bottom.forEach(t=>{
      const avgT=avg(t.players.map(mktOvr));
      t.players.forEach(p=>{
        if(p.me) return;
        if(mktIsMine(t)&&p.pos===S.pos) return;
        if((p.age||22)<=27&&mktOvr(p)>=avgT+4) cands.push({p,t});
      });
    });
    for(let i=cands.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [cands[i],cands[j]]=[cands[j],cands[i]]; }
    for(const c of cands){
      if(moves>=cap) break;
      if(rnd()>=MKT.xferP) continue;
      const buyers=top.filter(b=>{
        const cur=b.players.find(q=>q.pos===c.p.pos);
        return cur&&!cur.me&&!(mktIsMine(b)&&c.p.pos===S.pos)&&mktOvr(cur)<mktOvr(c.p)-1;
      });
      if(!buyers.length) continue;
      const b=buyers[Math.floor(rnd()*buyers.length)];
      const cur=b.players.find(q=>q.pos===c.p.pos);
      b.players=b.players.map(q=>q===cur?c.p:q);
      c.t.players=c.t.players.map(q=>q===c.p?cur:q);
      mktSynHit(b,1); mktSynHit(c.t,1); moves++;
      out.push({kind:"xfer",lg,who:c.p.id,from:c.t.name,to:b.name,swap:cur.id,pos:c.p.pos});
    }
  });
  return out;
}

/* 一个窗口：full=true 是休赛期（提拔+转会），false 是季中（只提拔） */
function aiMarketWindow(full){
  if(!S.world) return [];
  mktHeal();
  const moves=aiPromotions().concat(full?aiTransfers():[]);
  const news=[];
  moves.forEach(m=>{
    if(m.kind==="promo") news.push(`<div>${m.team}：二队 <b>${m.up}</b> 提上一队（${POSN[m.pos]}），${m.down} 下放 ${m.acad}</div>`);
    else news.push(`<div>${m.lg}：<b>${m.who}</b>（${POSN[m.pos]}）从 ${m.from} 转会 ${m.to}，${m.swap} 反向加盟 ${m.from}</div>`);
    if(S.team&&[m.team,m.acad,m.from,m.to].includes(S.team)){
      const txt=m.kind==="promo"
        ? (m.team===S.team?`<b>队内调动</b>：二队的 <b>${m.up}</b> 提上来了，${m.down} 下放 ${m.acad}。`
                           :`<b>队内调动</b>：一队把 <b>${m.up}</b> 提走了，${m.down} 下放到队里。`)
        : (m.to===S.team?`<b>转会</b>：俱乐部签下 <b>${m.who}</b>（${POSN[m.pos]}），${m.swap} 被送去 ${m.from}。`
                        :`<b>转会</b>：<b>${m.who}</b> 转会去了 ${m.to}，${m.swap} 加盟顶上。`);
      pushEvent(txt+`<span style="color:var(--ink-3)">新面孔进来，默契要重新磨，信任和更衣室关系也从头来。</span>`,"bad","转会");
      if(typeof syncTrust==="function") syncTrust();
      if(typeof syncRelations==="function") syncRelations();
    }
  });
  if(moves.length){
    S.news=(S.news||[]).concat([`<div class="hi">— ${full?"休赛期":"季中"}转会窗口：${moves.length} 笔变动 —</div>`]).concat(news.slice(0,14));
  }
  // 注意：这里绝不能重算 S.baseline——它是「签约时的联赛水位」，proPerf 拿它算你的相对表现；
  // 第一版在这里重算，水位被年年抬高，问询归零、转会均值从 4.4 掉到 2.1（120 局批测抓的）。
  // 年度均值另存 S.lgAvg（finishOffseason 里更新），给版本关键属性的红利算法用。
  return moves;
}
