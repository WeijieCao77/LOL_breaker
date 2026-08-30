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
  if(bad("个人能力")){
    // 差在哪一维：跟你的对位比；没有对位就跟联赛均值比
    const foes=(m.opp.players||m.opp), foe=foes.find&&foes.find(q=>q.pos===S.pos);
    const gaps=DIMS.map(d=>({d,g:S.attrs[d]-(foe?foe.r[d]:((S.baseline&&S.baseline[S.homeLeague||"LPL"])||50))}))
      .sort((a,b)=>a.g-b.g).filter(x=>x.g<-1).slice(0,2);
    gaps.forEach(({d,g})=>{
      const capped=S.attrs[d]>=capOf(d)-0.05;
      const P=(typeof BREAK_PATHS!=="undefined")?BREAK_PATHS[d]:null;
      personal.push({q:`${d}比对位低 ${(-g).toFixed(0)} 分`,
        how:capped&&P?`已到瓶颈——突破方法：${P.how}`:`日常多点「练${d}」，装备/课程里也有加${d}的`});
    });
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

/* 赛后面板 */
function postMatchCard(){
  const m=S.match;
  if(!m||!m.done||!m.attr) return "";
  const {rows,myTotal,opTotal}=m.attr;
  const won=m.sc[0]>m.sc[1];
  const diff=myTotal-opTotal;
  // 账面 vs 结果：不一致就直说
  const upset=(won&&diff<-1.5)||(!won&&diff>1.5);
  return `<div class="card"><h2>赛后拆解<em>${won?"胜":"负"} ${m.sc[0]}:${m.sc[1]}</em></h2>
    <div class="pm-head">
      <span>综合 <b>${myTotal.toFixed(1)}</b> vs <b>${opTotal.toFixed(1)}</b></span>
      <span class="pm-diff ${diff>=0?'up':'dn'}">${diff>=0?"+":""}${diff.toFixed(1)}</span>
    </div>
    ${upset?`<div class="pm-upset">${won
      ? "账面上你是劣势——这场是打出来的，不是数值给的。节点决策和运气都站在了你这边。"
      : "账面上你占优，还是输了。数值只决定每回合的胜率，不保证结果——看看状态、体能，剩下的是运气。"}</div>`:""}
    <div class="pmrows">${rows.map(r=>{
      const w=clamp(Math.abs(r.v)/6*100,4,100);
      return `<div class="pmr ${r.v>=0?'up':'dn'}">
        <span class="pn">${r.n}</span>
        <span class="pbar"><i style="width:${w}%"></i></span>
        <span class="pv mono">${r.v>=0?"+":""}${r.v.toFixed(1)}</span>
        <span class="pf">${r.fix}</span></div>`;
    }).join("")}</div>
    ${(()=>{
      const R=reviewAdvice(m);
      if(!R) return "";
      if(won){
        const tops=rows.filter(r=>r.v>=0.4).slice(0,2).map(r=>r.n);
        return tops.length?`<div class="review win"><div class="rv-h">复盘</div>
          <p class="note" style="margin:6px 0 0">这场赢在<b>${tops.join("、")}</b>。别松——优势项每赛段都在向 50 回归，要一直喂。</p></div>`:"";
      }
      if(!R.personal.length&&!R.team.length)
        return `<div class="review"><div class="rv-h">复盘</div>
          <p class="note" style="margin:6px 0 0">各项都没明显吃亏——这场输在概率上。数值只决定每回合胜率，不保证结果。</p></div>`;
      const li=x=>`<div class="rv-i"><span class="rq">${x.q}</span><span class="rh">${x.how}</span></div>`;
      return `<div class="review"><div class="rv-h">复盘 · 这场输在哪，明天练什么</div>
        ${R.personal.length?`<div class="rv-g"><b>个人</b>${R.personal.map(li).join("")}</div>`:""}
        ${R.team.length?`<div class="rv-g"><b>团队</b>${R.team.map(li).join("")}</div>`:""}
      </div>`;
    })()}
    <p class="note">这些就是模拟器判胜负时用的数，不是事后编的解释。按影响从大到小排。</p>
  </div>`;
}
