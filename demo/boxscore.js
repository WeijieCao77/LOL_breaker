/* ================= 全员数据（Box Score） =================

   玩家点名（2026-09-02）：在弱队里数值很突出却赢不了，「这是队友的问题」——
   可赛后只有你一个人的 KDA，谁在坑看不出来；球探也只看战绩，弱队里的强个人
   永远没人来问。

   现在每个系列赛为双方十个人各合成一行数据：K/D/A、分均补刀、伤害占比、评分。
   合成的骨架：
   · 每个人的数值（操作/运营/心态/体质加权）× 当赛段状态，相对全场十人均值
   · 队伍胜负：赢的一边整体抬一档，输的一边压一档
   · 你的临场选择：节点打成了给你加、砸了给你扣——数据要对得上你做的决定
   · 队友背锅：你的节点净成功却输了，多出来的那份「输」记在队友头上；
     反过来你节点砸了却赢了，功劳分给队友
   · 位置画像：辅助的 K 低 A 高，AD 的伤害占比天然最高，等等
   伤害占比在队内归一到 100%。评分口径和原来一样（0.2–2.0，1.0 是及格线）。

   这些数据三处用：赛后拆解的「全员数据」表、比赛档案回放、球探评分
   （proPerf 看你本赛段的场均评分和「院长」次数，不再只看队伍战绩）。 */

const BOX_POS_ORDER=["top","jng","mid","bot","sup"];
function boxAbility(p){
  const r=p.r||p;
  const v=(r.操作||50)*0.34+(r.运营||50)*0.28+(r.心态||50)*0.14+(r.体质||50)*0.10;
  const fm=(typeof formMul==="function")?(p.me?myFormMul():formMul(p)):1;
  return v*fm;
}
function synthBoxScore(m,won){
  const mine=myRoster(), opp=(m.opp&&m.opp.players)||[];
  if(!mine.length||!opp.length) return null;
  const all=mine.concat(opp);
  const mean=avg(all.map(boxAbility));
  const games=m.sc[0]+m.sc[1];
  const okN=(m.nodeLog||[]).filter(n=>n.ok).length, failN=(m.nodeFails||0);
  // 队友背锅 / 分功：看你临场选择的净结果和比赛结果是否相符
  const mateShift=(!won&&okN-failN>=1)?-0.07:(won&&failN-okN>=1)?0.05:0;
  const line=(p,side)=>{
    const T=(typeof POS_STATLINE!=="undefined"?POS_STATLINE[p.pos]:null)||[4.1,2.5,5.2,8.8,0.28];
    let perf=1+(boxAbility(p)-mean)*0.04+(side==="mine"?(won?0.12:-0.10):(won?-0.10:0.12));
    if(p.me) perf+=okN*0.05-failN*0.05;
    else if(side==="mine") perf+=mateShift;
    perf+=(rnd()-0.5)*0.28;
    perf=clamp(perf,0.45,1.7);
    const k=q1(T[0]*perf), d=q1(T[1]*(2-perf)*0.85+0.6), a=q1(T[2]*(0.8+perf*0.25));
    const cs=q1(T[3]*(0.9+perf*0.12));
    const kda=q1((k+a)/Math.max(1,d));
    const rating=Math.round(clamp(0.35+perf*0.55+(kda-2.6)*0.045,0.2,2.0)*100)/100;   // 两位小数：十个人并排才分得开
    return {id:p.id,pos:p.pos,me:!!p.me,k,d,a,cs,kda,rating,_w:T[4]*(0.8+perf*0.25)};
  };
  const sortPos=(x,y)=>BOX_POS_ORDER.indexOf(x.pos)-BOX_POS_ORDER.indexOf(y.pos);
  const M=mine.map(p=>line(p,"mine")).sort(sortPos), O=opp.map(p=>line(p,"opp")).sort(sortPos);
  [M,O].forEach(side=>{ const tot=side.reduce((s,x)=>s+x._w,0)||1; side.forEach(x=>{ x.dmg=Math.round(x._w/tot*100); delete x._w; }); });
  const me=M.find(x=>x.me)||M[0];
  const mates=M.filter(x=>!x.me);
  const mateAvg=mates.length?avg(mates.map(x=>x.rating)):me.rating;
  const worst=mates.length?mates.reduce((a,b)=>a.rating<=b.rating?a:b):null;
  const best=M.concat(O).reduce((a,b)=>a.rating>=b.rating?a:b);
  // 院长：输了，但你是全队最亮的那个，而且队友集体拉胯
  const carry=!won&&me.rating>=1.15&&mates.every(x=>me.rating>=x.rating+0.25)&&mateAvg<0.95;
  // 一人成军：赢了，队友全员不及格
  const soloWin=won&&me.rating>=1.25&&mates.length>0&&mateAvg<0.9&&mates.every(x=>x.rating<1.0);
  return {games,mine:M,opp:O,mateAvg:q1(mateAvg),worst:worst?worst.id:null,worstR:worst?worst.rating:null,
          mvp:best.id,carry,soloWin,okN,failN};
}

/* ---------- 赛后 / 档案回放共用的表 ---------- */
function boxScoreHtml(box,won,oppName){
  if(!box||!box.mine) return "";
  const row=(x,side)=>{
    const tag=x.id===box.mvp?`<span class="tag g">MVP</span>`:(side==="mine"&&x.id===box.worst&&x.rating<0.8)?`<span class="tag l">洞</span>`:"";
    const rc=x.rating>=1.1?"var(--cyan)":x.rating<0.85?"var(--red)":"var(--ink)";
    return `<tr class="${x.me?'me':''}">
      <td class="n" style="color:var(--ink-3)">${POSN[x.pos]||x.pos}</td>
      <td>${x.me?`<b style="color:var(--gold-hi)">${x.id}</b>`:x.id}${tag}</td>
      <td class="n mono">${Math.round(x.k*box.games)}/${Math.round(x.d*box.games)}/${Math.round(x.a*box.games)}</td>
      <td class="n mono">${x.cs}</td>
      <td><span class="bxbar"><i style="width:${x.dmg}%"></i></span><span class="mono">${x.dmg}%</span></td>
      <td class="n mono" style="color:${rc};font-weight:700">${x.rating.toFixed(2)}</td></tr>`;
  };
  const me=box.mine.find(x=>x.me);
  let verdict="";
  if(me){
    const mates=box.mine.filter(x=>!x.me);
    if(box.carry) verdict=`你评分 <b>${me.rating.toFixed(2)}</b> 全队最高，队友场均只有 <b>${box.mateAvg.toFixed(2)}</b>${box.worst?`，<b>${box.worst}</b>（${box.worstR.toFixed(2)}）是这场的洞`:""}。<b>这场输球不算在你头上</b>——数据球探看得到。`;
    else if(box.soloWin) verdict=`队友没有一个及格，你 <b>${me.rating.toFixed(2)}</b> 硬把比赛拿下来了。`;
    else if(!won&&me.rating<0.85) verdict=`你这场 <b>${me.rating.toFixed(2)}</b>，队里${box.worst&&box.worst!==me.id&&box.worstR<me.rating?`还有更差的（${box.worst} ${box.worstR.toFixed(2)}）`:"没人比你更差"}。输球有你的一份。`;
    else if(!won&&box.okN>box.failN&&box.mateAvg<0.95) verdict=`你临场 ${box.okN} 成 ${box.failN} 败，选择没错；队友场均 <b>${box.mateAvg.toFixed(2)}</b>，这场是他们丢的。`;
    else if(won&&me.id===box.mvp) verdict=`全场 MVP 是你。`;
    else if(won&&mates.length&&box.mvp&&mates.some(x=>x.id===box.mvp)) verdict=`这场赢在 <b>${box.mvp}</b>，你是跟着赢的。`;
  }
  return `<div class="box"><div class="rv-h">全员数据 · BO${box.games}${oppName?` · vs ${oppName}`:""}</div>
    <div class="tw"><table class="bxt"><thead><tr><th class="n">位置</th><th>选手</th><th class="n">KDA<small style="font-weight:400;color:var(--ink-3)">（${box.games} 局合计）</small></th><th class="n">分均补刀</th><th>伤害占比</th><th class="n">评分</th></tr></thead>
    <tbody>${box.mine.map(x=>row(x,"mine")).join("")}
    <tr class="bxsep"><td colspan="6">${oppName||"对手"}</td></tr>
    ${box.opp.map(x=>row(x,"opp")).join("")}</tbody></table></div>
    ${verdict?`<p class="note" style="margin:8px 0 0">${verdict}</p>`:""}
    <p class="note" style="margin:6px 0 0;color:var(--ink-3)">数据按各人数值、状态、胜负和你的临场选择合成：你选对了却输，多出来的那份「输」记在队友头上。评分 1.0 及格，1.1 以上亮眼，0.85 以下拖后腿。</p>
  </div>`;
}

/* 本赛段的场均评分与院长次数——球探看的是这个，不只看队伍战绩 */
function splitRating(){
  const rows=(S.archive||[]).filter(x=>x.si===S.si&&x.sp===(S.split||0)&&(x.tag==="联赛"||x.tag==="LDL"));
  if(!rows.length) return null;
  return avg(rows.map(x=>x.rating));
}
