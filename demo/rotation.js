/* ================= 轮换 · 赛程 · 队友伤病 =================

   玩家点名的三件事（2026-09-02）：
   · 随队参赛时看不到赛程——赛程只在一周一周的「下一场」里露过脸，
     随队出征 MSI/世界赛、替补看季后赛时更是只有几行日志。
   · 进了豪门没有晋升渠道——原来唯一的路是把五维均值练到「首发 −2」，
     被动等一个数字。替补拿不到正赛数据，也没人来挖，等于烂在板凳上。
   · 伤病只有你会受——队友都是铁人，首发永远不缺席。

   现在：
   · S.fix 记录本赛段每一周的赛果，「本周」页有一条赛程带，「世界」页有整张表；
     随队/替补看季后赛的间歇周有一张按周揭晓的日程卡。
   · 训练赛对位挑战：花行动点和首发打一场三局两胜的对位（每局你选打法，
     成功率看你那一维和他那一维的差距）。赢了攒「轮换资本」，攒到 3 教练给你
     一场正赛试用——赢了首发就是你的，输了回替补席，资本减半再来。
     训练赛战绩也会流出去：表现分里算一份，替补也能被人看见。
   · 队友伤病：每周每人 0.4%（27 岁以上略高），一次只倒一个，1–3 周。
     倒下的那个人上场要打折扣；倒的正好是你对位的首发，你就顶上——
     顶上期间赢一场，位置就是你的了。                                   */

/* ---------- 一、赛程记录 ---------- */
function fixKey(){ return `${S.si}-${S.split||0}`; }
function fixNote(week,opp,sc,won,played){
  if(!S.fix||S.fix.k!==fixKey()) S.fix={k:fixKey(),rows:{}};
  S.fix.rows[week]={opp,sc,won,played:!!played};
}
function fixRows(){
  if(!S.schedule||!S.schedule.length) return [];
  const ok=S.fix&&S.fix.k===fixKey();
  return S.schedule.map((opp,i)=>({w:i+1,opp,r:ok?(S.fix.rows[i+1]||null):null}));
}
/* 「本周」页的一条赛程带：每周一个小块，打过的标胜负，本周高亮 */
function fixtureStrip(){
  if(!S.career||S.step!=="season") return "";
  const rows=fixRows(); if(!rows.length) return "";
  return `<div class="fixt">${rows.map(x=>{
    const now=x.w===S.week, past=!!x.r;
    const cls=now?"now":past?(x.r.won?"w":"l"):"";
    const res=past?`${x.r.sc[0]}:${x.r.sc[1]}${x.r.played?"":"<i title=\"你没上场\">替</i>"}`:now?"本周":"";
    return `<span class="fc ${cls}" title="第 ${x.w} 周 vs ${x.opp}"><b>W${x.w}</b> ${x.opp}${res?` <em>${res}</em>`:""}</span>`;
  }).join("")}</div>`;
}
/* 「世界」页的整张赛程表：对手实力、战绩、结果、你有没有上 */
function fixtureCard(){
  if(!S.career||!S.team) return "";
  const rows=fixRows(); if(!rows.length) return "";
  const HL=S.homeLeague||"LPL", sea=SEASONS[S.si];
  const rec=S.record||{w:0,l:0};
  const trs=rows.map(x=>{
    const t=S.world[HL].find(q=>q.name===x.opp);
    const st=(S.standings[HL]||{})[x.opp]||{w:0,l:0};
    const pw=t?pwShow(power(t,0,sea.fav)).toFixed(1):"—";
    const now=x.w===S.week&&S.step==="season";
    const res=x.r?`<b class="${x.r.won?'w':'l'}">${x.r.won?"胜":"负"}</b> ${x.r.sc[0]}:${x.r.sc[1]}`:now?"本周":"—";
    const me=x.r?(x.r.played?"上场":`<span style="color:var(--ink-3)">替补席</span>`):"";
    // 打过的场次可以回看当场的全员数据与拆解（玩家点名）——档案里按 赛季/赛段/周 找那一行
    const ai=(S.archive||[]).findIndex(r=>r.si===S.si&&r.sp===(S.split||0)&&r.w===x.w&&r.opp===x.opp);
    const look=(x.r&&x.r.played&&ai>=0&&S.archive[ai].pm)?`<button class="btn ghost sm" data-pmv="${ai}" title="当场的全员数据与赛后拆解">看数据</button>`:"";
    return `<tr class="${now?'me':''}" style="${x.r?'':'opacity:.8'}">
      <td class="n">${x.w}</td><td>${typeof teamLogo==="function"?teamLogo(x.opp,18):""}${x.opp}</td>
      <td class="n mono">${pw}</td><td class="n mono">${st.w}−${st.l}</td><td class="n">${res}</td><td class="n">${me}</td><td class="n">${look}</td></tr>`;
  }).join("");
  return `<div class="card"><h2>赛程<em>${sea.tag} ${SPLITS[S.split||0]} · ${rec.w}胜 ${rec.l}负</em></h2>
    <div class="tw"><table><thead><tr><th class="n">周</th><th>对手</th><th class="n">实力</th><th class="n">对手战绩</th><th class="n">结果</th><th class="n">你</th><th class="n"></th></tr></thead>
    <tbody>${trs}</tbody></table></div>
    <p class="note">常规赛 ${WEEKS} 周每周一场 BO3，前六进季后赛。「替补席」的场次不计入你的个人战绩。</p></div>`;
}

/* ---------- 二、随队/间歇期的日程卡 ----------
   随队 MSI、世界赛，替补看季后赛：这些周原来只有日志。
   现在写一张按周揭晓的日程，本周之前的标「已揭晓（见大事记）」。 */
function setBreakAgenda(items,head){
  if(!S.off) return;
  S.off.agenda=items; S.off.agendaHead=head||"";
}
function breakAgendaCard(){
  if(!S.off||!S.off.agenda||!S.off.agenda.length) return "";
  const cur=S.off.week;
  return `<div class="card"><h2>${S.off.label||"间歇"} · 日程<em>第 ${cur}/${S.off.weeks} 周</em></h2>
    ${S.off.agendaHead?`<p class="note" style="margin-top:0">${S.off.agendaHead}</p>`:""}
    <div class="tw"><table><thead><tr><th class="n">周</th><th>日程</th><th class="n">状态</th></tr></thead>
    <tbody>${S.off.agenda.map(a=>`<tr class="${a.w===cur?'me':''}" style="${a.w<cur?'opacity:.55':''}">
      <td class="n">${a.w}</td><td>${a.t}</td>
      <td class="n">${a.w<cur?"已揭晓 · 见大事记":a.w===cur?"<b>本周</b>":"待揭晓"}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}

/* ---------- 三、训练赛对位挑战 ---------- */
const SCRIM_EDGE_NEED=3;       // 攒到这个数，教练给一场正赛试用
const SCRIM_POOL=[
  {q:"对线期：教练把你和他放在同一个位置对打。",ctx:"训练赛不会为你调整战术，队伍照常打自己的。",
   a:[{t:"抓他一个失误就越塔",dim:"操作",risk:1.2},{t:"控线压经济，不给机会",dim:"运营",risk:0.8},{t:"稳住不送，等打野来",dim:"心态",risk:0.6}]},
  {q:"中期：对面打野开始频繁上你这一路。",ctx:"他显然想在教练面前把你打穿。",
   a:[{t:"叫队友反蹲，反打一波",dim:"指挥",risk:1.0},{t:"换线拿资源，不跟他磨",dim:"运营",risk:0.8},{t:"单杀他，用操作说话",dim:"操作",risk:1.2}]},
  {q:"决胜团：两边都累了，这一波谁先动手。",ctx:"教练组全在身后看。",
   a:[{t:"先手开团",dim:"操作",risk:1.1},{t:"拉扯消耗，等他犯错",dim:"运营",risk:0.7},{t:"扛住压力打后手",dim:"心态",risk:0.9},{t:"指挥全队绕后",dim:"指挥",risk:1.0}]},
  {q:"BP：教练问你要不要拿他的本命英雄。",ctx:"拿了就是在他面前证明这个英雄你也会。",
   a:[{t:"拿，我比他玩得好",dim:"操作",risk:1.3},{t:"拿版本英雄，稳打",dim:"运营",risk:0.7},{t:"拿个功能型英雄，帮队伍赢",dim:"指挥",risk:0.9}]},
  {q:"第三局前，他在休息室里跟你说：「别太当真，训练赛而已。」",ctx:"你知道他是想让你松下来。",
   a:[{t:"笑一笑，上去更狠",dim:"心态",risk:1.0},{t:"当没听见，按自己节奏打",dim:"运营",risk:0.7},{t:"回一句「那你也别当真」",dim:"操作",risk:1.1}]},
  {q:"局面焦灼，你这边的辅助问要不要换你去打野的视野。",ctx:"训练赛里指挥权本来在他手上，不在你。",
   a:[{t:"接过指挥，报点开团",dim:"指挥",risk:1.2},{t:"听队伍的，先打好自己",dim:"心态",risk:0.6},{t:"自己去做视野，抓机会",dim:"运营",risk:0.8}]}
];
function scrimState(){ if(!S.scrim) S.scrim={edge:0,wins:0,played:0,trial:null,live:null}; return S.scrim; }
function scrimCanStart(){
  if(!S.career||!S.team||S.promoted||!S.understudy) return {ok:false,why:"你已经是首发了"};
  if(scrimTrialActive()) return {ok:false,why:"正赛试用中——用比赛说话"};
  const sc=scrimState(); if(sc.live) return {ok:false,why:"训练赛正在打"};
  const cost=(typeof apCost==="function")?apCost("duel"):2;
  if((S.ap||0)<cost) return {ok:false,why:`要 ${cost} 个行动点`};
  if(S.injury) return {ok:false,why:"带伤打不了对位"};
  // 限次（玩家 2026-09-06 点名：2 点一次、一周能打三轮不合理）：每周最多 2 次，连着两周最多 3 次
  const wk=scrimWeekKey(0), prev=scrimWeekKey(-1), log=sc.log||[];
  const thisWk=log.filter(k=>k===wk).length, twoWk=log.filter(k=>k===wk||k===prev).length;
  if(thisWk>=2) return {ok:false,why:"这周已经打了两次对位，教练不会再排"};
  if(twoWk>=3) return {ok:false,why:"两周内最多三次对位挑战——教练要看常规训练"};
  return {ok:true,cost};
}
function scrimWeekKey(d){
  d=d||0;
  if(S.step==="offseason"&&S.off) return "o"+S.si+"-"+S.off.next+"-"+((S.off.week||1)+d);
  return "s"+S.si+"-"+(S.split||0)+"w"+((S.week||1)+d);
}
/* 每局成功率：看你那一维和首发那一维的差距——这是极端加点的人的主场 */
function scrimOptP(opt){
  const inc=S.understudy; if(!inc) return 0.5;
  const mine=S.attrs[opt.dim]+((typeof gearBonus==="function")?gearBonus(opt.dim):0);
  const his=(inc.r&&inc.r[opt.dim])||50;
  let p=0.52+(mine-his)/38-(opt.risk-0.8)*0.10;
  p-=Math.max(0,(S.fatigue||0)-55)*0.003;
  if(typeof myFormMul==="function") p+=(myFormMul()-1)*1.2;
  return clamp(p,0.12,0.88);
}
function startScrim(){
  const c=scrimCanStart(); if(!c.ok) return;
  const sc=scrimState();
  (sc.log=sc.log||[]).push(scrimWeekKey(0)); if(sc.log.length>12) sc.log.shift();   // 限次用
  S.ap-=c.cost; addFat(12);
  const pool=SCRIM_POOL.slice(); for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  sc.live={sc:[0,0],round:1,flash:0,lines:[],pool:pool.slice(0,5).map(n=>SCRIM_POOL.indexOf(n)),done:false};
  render();
}
function scrimNode(){ const L=scrimState().live; if(!L) return null; return SCRIM_POOL[L.pool[(L.round-1)%L.pool.length]]; }
function scrimPick(i){
  const sc=scrimState(), L=sc.live; if(!L||L.done) return;
  const node=scrimNode(), opt=node.a[i]; if(!opt) return;
  const p=scrimOptP(opt), ok=rnd()<p;
  (L.rounds=L.rounds||[]).push({r:L.round,t:opt.t,dim:opt.dim,p:Math.round(p*100),ok,
    mine:Math.round(S.attrs[opt.dim]),his:Math.round((S.understudy&&S.understudy.r&&S.understudy.r[opt.dim])||50),flash:ok&&opt.risk>=1.1});
  if(ok){ L.sc[0]++; if(opt.risk>=1.1) L.flash++; } else L.sc[1]++;
  // 打过的那一维会长一点——对位训练赛本来就是最好的练法
  S.attrs[opt.dim]=Math.min(capOf(opt.dim),S.attrs[opt.dim]+(ok?0.16:0.08));
  L.lines.push(`<div><span class="hi">第${L.round}局</span> ${opt.t}（吃${opt.dim} · ${Math.round(p*100)}%）— ${
    ok?`<span class="w">打成了</span>${opt.risk>=1.1?" <span class=\"tag g\">亮眼</span>":""}`:`<span class="l">被他压住</span>`}</div>`);
  L.round++;
  if(L.sc[0]>=2||L.sc[1]>=2) endScrim();
  render();
}
function endScrim(){
  const sc=scrimState(), L=sc.live; if(!L) return;
  const won=L.sc[0]>L.sc[1], inc=S.understudy;
  L.done=true; sc.played++;
  if(won){
    sc.wins++;
    const gain=1+L.flash*0.5;
    sc.edge=q1(Math.min(SCRIM_EDGE_NEED+2,sc.edge+gain));
    if(typeof addStaff==="function") addStaff("coach",1.2);
    if(typeof addTrustAll==="function") addTrustAll(0.6);
    L.verdict=`你 ${L.sc[0]}:${L.sc[1]} 赢下对位。${L.flash?`有 ${L.flash} 波打得很亮，教练组记下了。`:""}轮换资本 <b>+${gain}</b> → ${sc.edge}/${SCRIM_EDGE_NEED}`;
    pushEvent(`训练赛对位 <b>${L.sc[0]}:${L.sc[1]}</b> 压过 <b>${inc?inc.id:"首发"}</b>${L.flash?"，还打出了亮眼操作":""}。轮换资本 ${sc.edge}/${SCRIM_EDGE_NEED}。`,"good","训练赛");
  }else{
    sc.edge=q1(Math.max(-1,sc.edge-0.5));
    if(typeof addStaff==="function") addStaff("coach",-0.4);
    L.verdict=`${L.sc[1]}:${L.sc[0]} 输给了他。这一场教练组看在眼里——轮换资本 <b>−0.5</b> → ${sc.edge}/${SCRIM_EDGE_NEED}。`;
    pushEvent(`训练赛对位 ${L.sc[0]}:${L.sc[1]} 输给 <b>${inc?inc.id:"首发"}</b>。差距在哪自己清楚。`,"info","训练赛");
  }
  // 攒够了：教练给正赛机会（要有比赛可打；间歇期先记着，下一场正赛兑现）
  if(sc.edge>=SCRIM_EDGE_NEED&&!sc.trial){
    sc.pendingTrial=true;
    L.verdict+=`<br><b style="color:var(--gold-hi)">教练找你谈了：下一场正赛，名单上是你。赢了位置就是你的；输了回替补席。</b>`;
    pushEvent(`教练组开会定了：<b>下一场正赛让你上</b>。「训练赛打成这样，不给你一场说不过去。赢了首发就是你的，输了别怪我。」`,"big","轮换");
  }
}
function scrimCard(){
  const sc=S.scrim, L=sc&&sc.live; if(!L) return "";
  const inc=S.understudy||{id:"首发"}, node=L.done?null:scrimNode();
  return `<div class="rankup"><div class="ru-inner ev-inner" style="max-width:560px">
    <div class="ru-eyebrow">训练赛 · 对位挑战 vs ${inc.id}</div>
    <div class="ev-q" style="font-size:22px;letter-spacing:.08em"><span class="mono">${L.sc[0]} : ${L.sc[1]}</span></div>
    ${node?`<div class="ev-q">${node.q}</div><div class="ev-ctx">${node.ctx}</div>
      <div class="grid g2" style="margin-top:14px">${node.a.map((a,i)=>{
        const p=scrimOptP(a);
        return `<button class="opt" data-scrimopt="${i}"><div class="t">${a.t}</div>
          <div class="d">吃 <b>${a.dim}</b>（你 ${S.attrs[a.dim].toFixed(0)} · 他 ${((inc.r&&inc.r[a.dim])||50).toFixed(0)}）· 成功率 <b style="color:${p>=0.6?'var(--cyan)':p>=0.4?'var(--gold)':'var(--red)'}">${Math.round(p*100)}%</b>${a.risk>=1.1?" · 打成算亮眼":""}</div></button>`;}).join("")}</div>`
    :`<div class="ev-ctx" style="margin-top:10px">${L.verdict||""}</div>
      ${scrimPostHtml(L,inc)}
      <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="scrimClose">回到本周 →</button></div>`}
    ${L.lines.length?`<div class="log" style="margin-top:12px;text-align:left">${L.lines.slice().reverse().join("")}</div>`:""}
  </div></div>`;
}
/* 训练赛对位的赛后拆解（玩家点名：训练赛也要有）：
   每一局选了什么打法、吃哪一维、你和他各多少、成功率、结果；再把五维摆一排比一遍，最后说明天练什么。 */
function scrimPostHtml(L,inc){
  if(!L||!L.done) return "";
  const rounds=L.rounds||[];
  const his=d=>(inc&&inc.r&&inc.r[d]!==undefined)?inc.r[d]:50;
  const cmp=DIMS.map(d=>({d,me:S.attrs[d],he:his(d),g:S.attrs[d]-his(d)}));
  const up=cmp.filter(x=>x.g>=1).sort((a,b)=>b.g-a.g), dn=cmp.filter(x=>x.g<=-1).sort((a,b)=>a.g-b.g);
  const won=L.sc[0]>L.sc[1];
  const fails=rounds.filter(r=>!r.ok), unlucky=rounds.filter(r=>!r.ok&&r.p>=65), lucky=rounds.filter(r=>r.ok&&r.p<=35);
  const adv=[];
  if(up.length) adv.push({good:true,q:`你压过他的：${up.map(x=>`${x.d} +${x.g.toFixed(0)}`).join("、")}`,how:"对位挑战每局选吃这几维的打法，成功率直接看这一维的差距"});
  if(dn.length) adv.push({q:`他压过你的：${dn.map(x=>`${x.d} ${x.g.toFixed(0)}`).join("、")}`,how:`临场别选吃这几维的选项；想正面赢他，就把「练${dn[0].d}」排进日常`});
  const wrong=fails.filter(r=>cmp.find(x=>x.d===r.dim&&x.g<-1));
  if(wrong.length) adv.push({q:`有 ${wrong.length} 局选了吃自己短板的打法`,how:"打法列表里写着成功率——低于五成的少碰，用最强的一维去打"});
  if(!won&&unlucky.length&&!wrong.length) adv.push({q:`${unlucky.length} 局成功率过六成还是没成`,how:"这是骰子背，不是你的问题。资本只扣 0.5，下周再打"});
  if(won&&lucky.length) adv.push({good:true,q:`${lucky.length} 局成功率不到四成却打成了`,how:"运气也算，但下次别指望它"});
  const li=x=>`<div class="rv-i${x.good?' good':''}"><span class="rq">${x.q}</span><span class="rh">${x.how}</span></div>`;
  return `<div class="review${won?' win':''}" style="text-align:left;margin-top:12px">
    <div class="rv-h">对位拆解 · ${won?"胜":"负"} ${L.sc[0]}:${L.sc[1]}${L.flash?` · 亮眼 ${L.flash} 波`:""}</div>
    ${rounds.length?`<div class="tw" style="margin:8px 0"><table>
      <thead><tr><th>局</th><th>打法</th><th>吃</th><th class="n">你 / 他</th><th class="n">成功率</th><th>结果</th></tr></thead>
      <tbody>${rounds.map(r=>`<tr><td class="n">${r.r}</td><td>${r.t}</td><td>${r.dim}</td><td class="n">${r.mine} / ${r.his}</td><td class="n">${r.p}%</td><td>${r.ok?`<span class="w">成了</span>${r.flash?' <span class="tag g">亮眼</span>':''}`:'<span class="l">没成</span>'}</td></tr>`).join("")}</tbody></table></div>`:""}
    <div class="tw" style="margin:8px 0"><table>
      <thead><tr><th>五维</th>${DIMS.map(d=>`<th class="n">${d}</th>`).join("")}</tr></thead>
      <tbody><tr><td>你</td>${cmp.map(x=>`<td class="n">${x.me.toFixed(0)}</td>`).join("")}</tr>
      <tr><td>${inc?inc.id:"首发"}</td>${cmp.map(x=>`<td class="n">${x.he.toFixed(0)}</td>`).join("")}</tr>
      <tr><td>差</td>${cmp.map(x=>`<td class="n ${x.g>=1?'w':x.g<=-1?'l':''}">${x.g>=0?"+":""}${x.g.toFixed(0)}</td>`).join("")}</tr></tbody></table></div>
    ${adv.length?`<div class="rv-g">${adv.map(li).join("")}</div>`:""}
  </div>`;
}
/* 替补页上的那一块：进度、按钮、说明 */
function scrimPanel(){
  if(!S.career||!S.understudy||S.promoted) return "";
  const sc=scrimState(), c=scrimCanStart();
  const him=avg(DIMS.map(d=>S.understudy.r[d])), me=avg(DIMS.map(d=>S.attrs[d]));
  const acad=(S.homeLeague||"LPL")==="LDL";
  const pct=clamp(Math.max(0,sc.edge)/SCRIM_EDGE_NEED*100,0,100);
  const cost=(typeof apCost==="function")?apCost("duel"):2;
  if(scrimTrialActive()){
    const T=sc.trial;
    return `<div class="scrimbox trial"><b style="color:var(--gold-hi)">正赛试用中</b> · ${T.why}。
      还有 <b>${T.games}</b> 场机会：<b>赢一场，首发就是你的</b>；输光了回替补席。</div>`;
  }
  return `<div class="scrimbox">
    <div class="sb-h"><b>${acad?"争取进名单":"抢首发"}</b> · 对位 <b>${S.understudy.id}</b>（综合 ${him.toFixed(0)}，你 ${me.toFixed(0)}）</div>
    <div class="at wide"><div class="lb">轮换资本</div>
      <div class="track"><div class="fill" style="width:${pct}%;background:linear-gradient(90deg,var(--gold-dim),var(--gold))"></div></div>
      <div class="vn mono"><b>${sc.edge}</b>/${SCRIM_EDGE_NEED}</div></div>
    <div class="row" style="margin-top:8px;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn sm" id="scrimStart" ${c.ok?"":'disabled style="opacity:.45"'}>训练赛对位挑战 ${typeof apTag==="function"?apTag("duel"):cost+"点"}</button>
      <span class="note" style="margin:0">${c.ok?`三局两胜，每局你选打法——<b>成功率看你那一维和他那一维的差距</b>，用你最强的一项去打。体能 −12。`:`🔒 ${c.why}`}</span>
    </div>
    <p class="note" style="margin:8px 0 0">两条路都通：<b>①</b> 训练赛赢到资本攒满 ${SCRIM_EDGE_NEED}，教练给你一场正赛——赢了坐稳；
      <b>②</b> 五维均值练到压过他（还差 ${Math.max(0,him-2-me).toFixed(1)}），直接转正。
      训练赛战绩也会流出去（表现分里算一份），替补不再是没人看得见的位置。${
      S.mateInjury&&S.understudy&&S.mateInjury.id===S.understudy.id?`<br><b style="color:var(--gold)">${S.understudy.id} 伤了——这几周名单上是你。</b>`:""}</p>
  </div>`;
}

/* ---------- 四、正赛试用 ---------- */
function scrimTrialActive(){ return !!(S.scrim&&S.scrim.trial); }
function meAsPlayer(){ return {id:S.name||"你",cn:"",pos:S.pos,age:S.age,r:S.attrs,me:true}; }
function grantTrial(games,why,opts){
  const inc=S.understudy; if(!inc||S.promoted) return false;
  const sc=scrimState(); if(sc.trial) return false;
  const t=myTeam(); if(!t) return false;
  let swapped=false;
  t.players=t.players.map(q=>{ if(!swapped&&(q===inc||q.id===inc.id)){ swapped=true; return meAsPlayer(); } return q; });
  if(!swapped){ t.players=t.players.map(q=>q.pos===S.pos&&!q.me?(swapped=true,meAsPlayer()):q); }
  if(!swapped) return false;
  sc.pendingTrial=false;
  sc.trial={games:Math.max(1,games|0),w:0,l:0,why:why||"教练给的机会",forgiven:false,injury:!!(opts&&opts.injury)};
  // 你顶上去是名单内的正常轮换，不算「换血」砸默契
  S.rosterSig=null;
  return true;
}
/* 每周赛前：有攒够的试用就兑现（isBenched 里调用） */
function scrimTrialCheck(){
  if(!S.career||S.promoted||!S.understudy) return false;
  const sc=scrimState();
  if(sc.trial) return true;
  if(sc.pendingTrial){
    if(grantTrial(1,"训练赛打出来的机会")){
      pushEvent(`本周名单公布：<b>${S.pos?POSN[S.pos]:""}位置写的是你</b>。${S.understudy.id} 坐替补席。`,"big","轮换");
      return true;
    }
  }
  return false;
}
function revertTrial(){
  const sc=scrimState(), T=sc.trial; if(!T) return;
  const inc=S.understudy, t=myTeam();
  if(t&&inc){ let done=false; t.players=t.players.map(q=>(!done&&q.me)?(done=true,inc):q); }
  sc.trial=null; S.rosterSig=null;
}
function confirmStarter(why){
  const sc=scrimState(), inc=S.understudy;
  sc.trial=null; sc.pendingTrial=false;
  S.promoted=true; S.understudy=null; S.benchLock=false; S.loseStreak=0;
  const t=myTeam(); if(t&&!t.players.some(q=>q.me)&&inc){ let d=false; t.players=t.players.map(q=>(!d&&(q===inc||q.id===inc.id))?(d=true,meAsPlayer()):q); }
  pushEvent((S.homeLeague||"LPL")==="LDL"
    ? `${why}<b>教练把你正式写进了 ${S.team} 的名单</b>。${inc?inc.id+" 退回替补。":""}`
    : `${why}<b>首发是你的了</b>。${inc?inc.id+" 退回替补席。":""}`,"big","转正");
  if(typeof checkAch==="function") checkAch("promote");
}
/* 每场正赛打完（endMatch 里调用） */
/* ---------- 首发被换下（2026-09-05 玩家点名）----------
   「你是队里最薄的一环——教练在看替补名单」原来只是一句话。现在兑现：
   坐着首发、是全队最薄的一环、连输三场（对手账面强太多的那场不算）→ 教练把你换下，
   替补（有青训队就从二队提人）顶上；你回替补席，而且不能靠数值自动回来——
   得在训练赛里攒够对位优势（SCRIM_EDGE_NEED）拿到试用，赢下来才是首发。 */
function weakestLink(){
  const mates=myRoster().filter(p=>!p.me); if(!mates.length) return false;
  const me=avg(DIMS.map(d=>S.attrs[d]));
  const tavg=avg(mates.map(p=>avg(DIMS.map(d=>p.r[d]))));
  return clamp(55+(me-tavg)*6,5,98)<45;     // 和 roleCard 的「首发竞争」同一把尺
}
function pickReplacement(){
  const t=myTeam(); const mates=t?t.players.filter(p=>!p.me):[];
  const tavg=mates.length?avg(mates.map(p=>avg(DIMS.map(d=>p.r[d])))):avg(DIMS.map(d=>S.attrs[d]));
  // 有青训队就从二队提人（同位置），没有就是队里的替补
  try{
    const acad=(S.homeLeague||"LPL")!=="LDL"&&S.world.LDL?S.world.LDL.find(x=>x.parent===S.team):null;
    const p=acad&&acad.players.find(q=>q.pos===S.pos&&!q.me);
    if(p) return Object.assign({},p,{r:Object.assign({},p.r),lg:S.homeLeague||"LPL",fromAcad:true});
  }catch(e){}
  const r=(typeof makeRookie==="function")?makeRookie(S.pos,tavg-2,S.homeLeague||"LPL"):null;
  return r||{id:"替补",pos:S.pos,age:20,r:Object.assign({},S.attrs)};
}
function demoteCheck(won,gap){
  if(!S.career||!S.promoted||(S.scrim&&S.scrim.trial)) return;
  if(won){ S.loseStreak=0; return; }
  if(gap<-8){ pushEvent(`输给账面强太多的对手（差 ${(-gap).toFixed(1)}），教练没把这场记在你头上。`,"info","轮换"); return; }
  S.loseStreak=(S.loseStreak||0)+1;
  if(!weakestLink()) return;
  if(S.loseStreak===2){
    pushEvent(`连输两场，而你是队里最薄的一环。<b>教练在看替补名单——再输一场就换人。</b>`,"bad","轮换");
    return;
  }
  if(S.loseStreak<3) return;
  const inc=pickReplacement(), t=myTeam();
  if(!t||!inc) return;
  let done=false; t.players=t.players.map(q=>(!done&&q.me)?(done=true,inc):q);
  S.promoted=false; S.understudy=inc; S.benchLock=true; S.loseStreak=0; S.rosterSig=null;
  if(S.scrim){ S.scrim.edge=0; S.scrim.trial=null; S.scrim.pendingTrial=false; }
  S.benchedSplits=(S.benchedSplits||0);   // 计数在赛段末照旧
  pushEvent(`<b>连输三场，教练把你换下了。</b>${inc.fromAcad?`二队的 <b>${inc.id}</b> 被提上来`:`<b>${inc.id}</b> 顶上`}，${POSN[S.pos]}位置这周起不是你。<br>
    <span style="color:var(--ink-3)">回替补席不是数值够了就能回来——训练赛里攒够 ${SCRIM_EDGE_NEED} 次对位优势，教练才会再给你一场试用；试用赢了，首发才重新是你的。</span>`,"bad","轮换");
  if(typeof checkAch==="function") checkAch("demoted");
}
function rotationAfterMatch(won,gap){
  demoteCheck(won,gap);
  const sc=S.scrim; if(!sc||!sc.trial) return;
  const T=sc.trial;
  if(won){ T.w++; confirmStarter("试用期第一场就赢了。"); return; }
  T.l++;
  if(gap<-6&&!T.forgiven){
    T.forgiven=true;
    pushEvent(`输了，但对手账面强太多（差 ${(-gap).toFixed(1)}），教练没把这场算在你头上：<b>再给你一场</b>。`,"info","轮换");
    return;
  }
  T.games--;
  if(T.games>0){ pushEvent(`输了。名单上还是你，<b>还有 ${T.games} 场机会</b>——再输就回替补席。`,"bad","轮换"); return; }
  const inc=S.understudy;
  revertTrial();
  sc.edge=q1(Math.max(0,Math.floor(sc.edge/2)));
  pushEvent(`试用期没赢下来。<b>${inc?inc.id:"首发"} 回到名单，你回替补席。</b>轮换资本减半（${sc.edge}/${SCRIM_EDGE_NEED}）——训练赛里再攒。`,"bad","轮换");
}

/* ---------- 五、队友伤病 ---------- */
const MATE_INJ=[
  {n:"手腕劳损",weeks:[1,3],w:4},{n:"腰伤",weeks:[1,2],w:3},
  {n:"急性肠胃炎",weeks:[1,1],w:3},{n:"状态问题需要休整",weeks:[2,3],w:2}
];
function mateInjuryRoll(){
  if(!S.career||!S.team||S.mateInjury) return;
  const t=myTeam(); if(!t) return;
  // 候选：名单里的四个队友；你坐替补时，名单上的首发也在里面（含你的对位）
  const mates=t.players.filter(p=>!p.me);
  for(const p of mates){
    let q=0.004; if((p.age||22)>=27) q+=0.002; if((p.age||22)>=30) q+=0.002;
    if(rnd()>=q) continue;
    const tot=MATE_INJ.reduce((a,x)=>a+x.w,0); let r=rnd()*tot;
    const inj=MATE_INJ.find(x=>(r-=x.w)<=0)||MATE_INJ[0];
    const wk=inj.weeks[0]+Math.floor(rnd()*(inj.weeks[1]-inj.weeks[0]+1));
    S.mateInjury={id:p.id,pos:p.pos,n:inj.n,left:wk};
    const isInc=!S.promoted&&S.understudy&&S.understudy.id===p.id;
    if(isInc&&!scrimTrialActive()){
      if(grantTrial(wk,`${p.id} ${inj.n}，你顶上`,{injury:true}))
        pushEvent(`<b>${p.id}</b> ${inj.n}，预计缺席 <b>${wk} 周</b>。教练把你写进了名单：<b>这 ${wk} 周里赢一场，位置就是你的。</b>`,"big","伤病");
      else pushEvent(`<b>${p.id}</b> ${inj.n}，预计缺席 <b>${wk} 周</b>。`,"bad","伤病");
    }else{
      pushEvent(`队友 <b>${p.id}</b>（${POSN[p.pos]||p.pos}）${inj.n}，预计缺席 <b>${wk} 周</b>。${
        wk>=2?"二队的人顶上来，战力要打折扣。":"这周带伤上，发挥要打折扣。"}`,"bad","伤病");
    }
    break;   // 一次只倒一个
  }
}
function mateInjuryTick(){
  const I=S.mateInjury; if(!I) return;
  I.left--;
  if(I.left<=0){
    pushEvent(`<b>${I.id}</b> 伤愈归队。`,"good","伤病");
    S.mateInjury=null;
    // 顶上期间没赢下来：他回来了，你回替补席
    if(S.scrim&&S.scrim.trial&&S.scrim.trial.injury&&!S.promoted){
      const sc=S.scrim; revertTrial();
      sc.edge=q1(Math.max(sc.edge,1));
      pushEvent(`${I.id} 回到名单，你回替补席。<span style="color:var(--ink-3)">顶上的那几场没赢下来——但你打过正赛了，教练心里有数。</span>`,"info","轮换");
    }
  }
}
/* 战力折扣：受伤的队友在名单上就是带伤/替补顶上 */
function mateInjuryHit(p){
  const I=S.mateInjury; if(!I||!p||p.me||p.id!==I.id) return 0;
  return -5.5;
}
function mateInjuryTag(p){
  const I=S.mateInjury; if(!I||!p||p.id!==I.id) return "";
  return `<span class="tag l" title="${I.n} · 还有 ${I.left} 周">伤 ${I.left}周</span>`;
}
function mateInjuryNote(){
  const I=S.mateInjury; if(!I) return "";
  return `<p class="note" style="color:var(--red);margin-top:6px"><b>${I.id}</b>（${POSN[I.pos]||I.pos}）${I.n}，还要 <b>${I.left} 周</b>——这段时间他那个位置的战力打折扣。</p>`;
}

/* ---------- 六、随队冠军 ----------
   玩家点名（2026-09-02）：「我跟着队伍在替补席混了一个冠军，这个也算冠军」。
   记成单独一类：生涯一览、结算、结局、顶栏都算进去并标「替补席随队」；
   成就、夺冠突破、转会保底仍只认亲手打下的——那些是关于你表现的判定。 */
function addRingTitle(t){ if(!S.career) return; S.career.ringTitles=(S.career.ringTitles||[]).concat([t]); }
function ringTitles(){ return (S.career&&S.career.ringTitles)||[]; }
function titleCount(){ return ((S.career&&S.career.titles)||[]).length+ringTitles().length; }
function titlesText(){
  const own=(S.career&&S.career.titles)||[], ring=ringTitles();
  return own.concat(ring.map(t=>`${t}<span class="tag" title="球队夺冠时你在替补席">随队</span>`)).join("、");
}
