/* ================= 赛后归因 =================

   不编解释。列出来的每一项，就是模拟器判定胜负时真正用到的那个数
   —— base 的差、每个权重的差、版本相性、宿敌加成、节点决策的摆动。
   按对结果的贡献从大到小排，每一项都写「怎么调整」。

   数值只决定每回合胜率，所以账面占优照样可能输——
   那种情况面板会直接说出来，而不是硬找理由。                        */

function attribute(myTeamPlayers,oppTeamObj,fatigue,verFav){
  const oppPlayers=oppTeamObj.players||oppTeamObj;
  const A=squadBreakdown(myTeamPlayers,fatigue,verFav);           // 我方
  const B=squadBreakdown(oppPlayers,0,verFav,oppTeamObj.players?oppTeamObj:null);  // 对手用对手自己的默契/战术
  const rows=[];

  // base 差：拆到「能力」与「状态」两层
  const abilityOf=(ps)=>avg(ps.map(p=>{
    const r=p.r||p;
    return r.操作*0.34+r.运营*0.28+r.心态*0.14+r.体质*0.10;
  }));
  const myAb=abilityOf(myTeamPlayers), opAb=abilityOf(oppPlayers);
  rows.push({n:"个人能力",v:myAb-opAb,
    fix:myAb<opAb?"五个人的底子就比对面薄。练自己，或者等队伍补强。":"底子占优，把它打出来。"});

  const myFm=avg(myTeamPlayers.map(p=>p.me?myFormMul():formMul(p)));
  const opFm=avg(oppPlayers.map(p=>formMul(p)));
  rows.push({n:"状态",v:(myFm-opFm)*myAb,
    fix:myFm<opFm?"手感不在。休息、稳住更衣室，状态下个赛段会回来。":"状态在你这边。"});

  // 各权重差，折算成等效战力
  const fixOf={
    默契:"换过人就要重新磨。多合练、多双排。",
    战术:"准备不够。战术复盘和训练赛。",
    士气:"更衣室出问题了。处理好队友关系，或者花钱团建。",
    指挥:"队里没人扛得起指挥。练自己的指挥，或者引进老将。",
    体能:"人是累的。该休息了。"
  };
  A.ws.forEach((w,i)=>{
    const ow=B.ws[i];
    rows.push({n:w.n,v:(w.mult-ow.mult)*A.base,
      fix:(w.mult<ow.mult?fixOf[w.n]:"这一项你是占优的。")});
  });

  // 版本相性
  const vf=(typeof versionFit==="function")?versionFit():0;
  if(Math.abs(vf)>0.2){
    const sea=SEASONS[S.si];
    rows.push({n:"版本相性",v:vf,
      fix:vf<0?`这个版本强调${sea.dim}，不是你的强项。适应力高能缓一缓，或者把${sea.dim}练上去。`
              :`版本站在你这边，趁这一年多拿分。`});
  }
  return {rows:rows.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)),
          myTotal:A.total+vf, opTotal:B.total};
}

/* ---------- 复盘：把输因翻译成「明天点哪个按钮」 ----------
   玩家要的不是又一遍数字，是结论：这场为什么输、我该练什么、
   队伍该补什么——而且每一条都对得上日常训练里真实存在的操作。
   数据来源还是归因表：挑贡献最大的负项，逐条给做法。 */
function reviewAdvice(m){
  const A=m.attr; if(!A) return null;
  const rows=A.rows, sea=SEASONS[S.si];
  const personal=[], team=[];
  const bad=n=>{ const r=rows.find(x=>x.n===n); return (r&&r.v<=-0.25)?r:null; };

  /* —— 个人 —— */
  /* 对位账：长项和短板一起说。
     玩家实锤（2026-09-02）：「复盘总说我的短板比对面低多少，不提长项——
     我是极端加点，这是不鼓励极端加点吗」。不是。战力是加权和
     （操作 .34 / 运营 .28 / 心态 .14 / 体质 .10），没有短板惩罚；
     指挥不进个人战力，只取全队最高值做乘数。所以：
     · 只点真正进公式的四维，按「权重 × 差距」排，不按裸差距排；
     · 你压过对位的项先说，那是这场的本钱；
     · 极端加点的人明说：短板只在临场节点抽到它时吃亏，不用为了均衡去补。 */
  const W={操作:0.34,运营:0.28,心态:0.14,体质:0.10};
  const foes=(m.opp.players||m.opp), foe=foes.find&&foes.find(q=>q.pos===S.pos);
  const base=(S.baseline&&S.baseline[S.homeLeague||"LPL"])||50;
  const cmp=Object.keys(W).map(d=>{ const g=S.attrs[d]-(foe?foe.r[d]:base); return {d,g,eff:g*W[d]}; });
  const strong=cmp.filter(x=>x.g>=3).sort((a,b)=>b.eff-a.eff).slice(0,2);
  const weak=cmp.filter(x=>x.g<-1).sort((a,b)=>a.eff-b.eff).slice(0,2);
  const vals=DIMS.map(d=>S.attrs[d]), mu=avg(vals), sd=Math.sqrt(avg(vals.map(x=>(x-mu)**2)));
  const extreme=sd>=9;
  if(strong.length){
    personal.push({good:true,q:`长项：${strong.map(x=>`${x.d}比对位高 ${x.g.toFixed(0)}`).join("、")}`,
      how:`这是你的本钱——临场节点里多选吃「${strong[0].d}」的选项，成功率直接看这一维；训练赛对位也用它打`});
  }
  if(bad("个人能力")){
    weak.forEach(({d,g})=>{
      const capped=S.attrs[d]>=capOf(d)-0.05;
      const P=(typeof BREAK_PATHS!=="undefined")?BREAK_PATHS[d]:null;
      personal.push({q:`${d}比对位低 ${(-g).toFixed(0)} 分（权重 ${W[d]}）`,
        how:capped&&P?`已到瓶颈——突破方法：${P.how}`
          :extreme?`补不补看你：这项权重 ${W[d]}，补 5 点只值 ${(5*W[d]).toFixed(1)} 战力；把长项练到顶往往更划算`
          :`日常多点「练${d}」，装备/课程里也有加${d}的`});
    });
    if(extreme&&weak.length) personal.push({good:true,q:"关于极端加点",
      how:"战力是加权和，没有短板惩罚。极端加点只在临场节点抽到你的短板维度时吃亏——那种节点记得选另一个选项"});
  }
  if(bad("状态")) personal.push({q:"手感不在（状态低谷）",
    how:"点「打排位」找手感；状态是按战绩、体能、更衣室每赛段重算的——先把这三样稳住"});
  if(bad("体能")) personal.push({q:`体能只剩 ${100-Math.round(S.fatigue)}/100`,
    how:"点「休息」，或商城买按摩/理疗（花钱不占行动点）——疲劳是直接乘在战力上的"});
  if(bad("版本相性")) personal.push({q:`逆版本：本赛季吃「${sea.dim}」，你这一项还低于联赛平均`,
    how:`把「练${sea.dim}」排进日常；天赋练均衡一点，适应力也能缓冲版本`});
  const fd=m.failDims||[];
  if(fd.length>=2){
    const c={}; fd.forEach(d=>c[d]=(c[d]||0)+1);
    const worst=Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
    personal.push({q:`临场决策砸了 ${fd.length} 次（多数吃「${worst}」）`,
      how:`节点成功率直接看对应属性——把「练${worst}」提上去，同样的选择就多几成把握`});
  }

  /* —— 团队 —— */
  if(bad("默契")){
    let extra="";
    if(typeof relOf==="function"&&S.rel){
      const v=Object.entries(S.rel).sort((a,b)=>a[1]-b[1])[0];
      if(v&&v[1]<32){ const [a,b]=v[0].split("|"); extra=`；${a} 和 ${b} 已经不怎么说话了——先「团队建设」或约饭缓和`; }
    }
    team.push({q:"五个人配合生疏",how:`战队行动里点「战队合练」「队友双排」最直接；刚换过人就得接受磨合期${extra}`});
  }
  if(bad("战术")) team.push({q:"战术准备不足",how:"战队行动里点「战术复盘」「训练赛」——复盘做得多教练也会更信你"});
  if(bad("士气")) team.push({q:`更衣室不稳（平均信任 ${Math.round(typeof avgTrust==="function"?avgTrust():50)}）`,
    how:"商城「团队建设」「约队友吃火锅」，更衣室事件别火上浇油；赢球本身也是最好的粘合剂"});
  if(bad("指挥")) team.push({q:"队里没人扛得起指挥",
    how:"练自己的「指挥」；或者等威望够了「点名引援」一个老将——27 岁以上老将同队还能顶开你的指挥瓶颈"});
  return {personal,team};
}

/* ---------- 拆解卡的零件：现场版和档案回放共用同一套渲染 ---------- */
function pmRowsHtml(rows){
  return `<div class="pmrows">${rows.map(r=>{
    const w=clamp(Math.abs(r.v)/6*100,4,100);
    return `<div class="pmr ${r.v>=0?'up':'dn'}">
      <span class="pn">${r.n}</span>
      <span class="pbar"><i style="width:${w}%"></i></span>
      <span class="pv mono">${r.v>=0?"+":""}${r.v.toFixed(1)}</span>
      <span class="pf">${r.fix}</span></div>`;
  }).join("")}</div>`;
}
/* 临场账本：每个节点的成功率与结果、以及「高赢面还是输了」的说法 */
function pmNodesHtml(nodes,luck){
  if((!nodes||!nodes.length)&&(!luck||!luck.length)) return "";
  return `<div class="review"><div class="rv-h">临场账本 · 概率与骰子</div>
    ${(nodes||[]).map(n=>`<div class="rv-i">
      <span class="rq">第${n.g}局「${n.t}」（吃${n.dim} · 成功率 ${n.p}%）</span>
      <span class="rh">${n.ok?'<span class="w">成了</span>':'<span class="l">没成</span>'} · 赢面 ${n.d>=0?"+":""}${n.d} 个百分点</span></div>`).join("")}
    ${(luck||[]).map(l=>`<p class="note" style="margin:6px 0 0">${l}</p>`).join("")}
  </div>`;
}
function pmAdviceHtml(adv,won,rows){
  const li=x=>`<div class="rv-i ${x.good?'good':''}"><span class="rq">${x.q}</span><span class="rh">${x.how}</span></div>`;
  const goods=(adv&&adv.personal||[]).filter(x=>x.good);
  if(won){
    const tops=rows.filter(r=>r.v>=0.4).slice(0,2).map(r=>r.n);
    if(!tops.length&&!goods.length) return "";
    return `<div class="review win"><div class="rv-h">复盘</div>
      ${tops.length?`<p class="note" style="margin:6px 0 0">这场赢在<b>${tops.join("、")}</b>。别松——优势项每赛段都在向 50 回归，要一直喂。</p>`:""}
      ${goods.length?`<div class="rv-g">${goods.map(li).join("")}</div>`:""}</div>`;
  }
  if(!adv||(!adv.personal.length&&!adv.team.length))
    return `<div class="review"><div class="rv-h">复盘</div>
      <p class="note" style="margin:6px 0 0">各项都没明显吃亏——这场输在概率上。数值只决定每回合胜率，不保证结果。</p></div>`;
  if(!adv.personal.some(x=>!x.good)&&!adv.team.length)
    return `<div class="review"><div class="rv-h">复盘</div>
      <div class="rv-g">${goods.map(li).join("")}</div>
      <p class="note" style="margin:6px 0 0">个人和团队都没明显吃亏——这场输在概率上。数值只决定每回合胜率，不保证结果。</p></div>`;
  return `<div class="review"><div class="rv-h">复盘 · 这场输在哪，明天练什么</div>
    ${adv.personal.length?`<div class="rv-g"><b>个人</b>${adv.personal.map(li).join("")}</div>`:""}
    ${adv.team.length?`<div class="rv-g"><b>团队</b>${adv.team.map(li).join("")}</div>`:""}
  </div>`;
}
/* 「90% 也翻车」的说法（玩家点名要的）：先认骰子，再给镜头。
   锅只甩给真实存在的数——那局你自己节点失手就点你自己；
   队友状态系数全队最低且确实拉胯才点队友；都不占，就承认是概率。
   在 endMatch 现场算好存成文字：回放时队友状态早变了，不能重算。 */
function pmLuckLines(m){
  const out=[];
  (m.gameLog||[]).forEach(g=>{
    if(!g.win&&g.p>=70){
      const ownFail=(m.nodeLog||[]).find(n=>n.g===g.g&&!n.ok);
      let tail;
      if(ownFail) tail=`那波「${ownFail.t}」是你自己没打成——账本上面记着。`;
      else{
        let worst=null;
        try{
          myRoster().filter(p=>!p.me).forEach(p=>{
            const f=formMul(p);
            if(!worst||f<worst.f) worst={id:p.id,f};
          });
        }catch(e){}
        tail=(worst&&worst.f<0.97)
          ?`回放里 <b>${worst.id}</b> 慢了半拍（状态系数 ${worst.f.toFixed(2)}，全队最低）——不过 ${g.p}% 本来也保不了底。`
          :`没什么可甩的——${g.p}% 就是十次里还要输一次，这次骰子背。`;
      }
      out.push(`第${g.g}局赢面 <b>${g.p}%</b> 还是丢了：${tail}`);
    }
    if(g.win&&g.p<=30)
      out.push(`第${g.g}局赢面只有 <b>${g.p}%</b> 却拿下了——运气也是实力的一部分，但别指望它常来。`);
  });
  return out;
}

/* 赛后面板（现场版）：比赛结束后独立成一屏，看完才能「继续」 */
function postMatchCard(){
  const m=S.match;
  if(!m||!m.done||!m.attr) return "";
  const {rows,myTotal,opTotal}=m.attr;
  const won=m.sc[0]>m.sc[1];
  const diff=myTotal-opTotal;
  // 账面 vs 结果：不一致就直说
  const upset=(won&&diff<-1.5)||(!won&&diff>1.5);
  return `<div class="card"><h2>赛后拆解 · vs ${m.oppName}<em>${won?"胜":"负"} ${m.sc[0]}:${m.sc[1]}</em></h2>
    <div class="pm-head">
      <span>综合 <b>${myTotal.toFixed(1)}</b> vs <b>${opTotal.toFixed(1)}</b></span>
      <span class="pm-diff ${diff>=0?'up':'dn'}">${diff>=0?"+":""}${diff.toFixed(1)}</span>
    </div>
    ${upset?`<div class="pm-upset">${won
      ? "账面上你是劣势——这场是打出来的，不是数值给的。节点决策和运气都站在了你这边。"
      : "账面上你占优，还是输了。数值只决定每回合的胜率，不保证结果——看看状态、体能，剩下的是运气。"}</div>`:""}
    ${pmRowsHtml(rows)}
    ${typeof boxScoreHtml==="function"?boxScoreHtml(m.box,won,m.oppName):""}
    ${pmNodesHtml(m.nodeLog,m.luck)}
    ${pmAdviceHtml(reviewAdvice(m),won,rows)}
    <p class="note">这些就是模拟器判胜负时用的数，不是事后编的解释。按影响从大到小排。<br>
      点过「继续」也不丢：<b>我的 → 比赛档案</b>里能回看最近 12 场的拆解。</p>
  </div>`;
}

/* 档案回放：用当时存下来的归因和账本，不重算（重算就不是那场比赛了） */
function pmReplayCard(){
  const x=(S.archive||[])[S.pmView];
  if(!x||!x.pm) return "";
  const pm=x.pm, diff=pm.my-pm.op, won=x.win;
  const seaTag=SEASONS[x.si]?SEASONS[x.si].tag:"";
  return `<div class="rankup"><div class="ru-inner" style="max-width:560px;max-height:86vh;overflow-y:auto;text-align:left">
    <div class="ru-eyebrow">比赛档案 · 拆解回放</div>
    <h2 style="margin:0 0 6px">${seaTag} ${x.tag} · vs ${x.opp}<em style="float:right">${won?"胜":"负"} ${x.sc[0]}:${x.sc[1]}</em></h2>
    <div class="pm-head">
      <span>综合 <b>${pm.my.toFixed(1)}</b> vs <b>${pm.op.toFixed(1)}</b></span>
      <span class="pm-diff ${diff>=0?'up':'dn'}">${diff>=0?"+":""}${diff.toFixed(1)}</span>
    </div>
    ${pmRowsHtml(pm.rows)}
    ${(typeof boxScoreHtml==="function"&&x.box)?boxScoreHtml(x.box,won,x.opp):""}
    ${pmNodesHtml(pm.nodes,pm.luck)}
    ${pmAdviceHtml(pm.adv,won,pm.rows)}
    <div class="row" style="justify-content:center;margin-top:10px">
      <button class="btn" id="pmclose">关闭</button></div>
  </div></div>`;
}
