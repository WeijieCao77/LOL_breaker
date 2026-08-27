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
    <p class="note">这些就是模拟器判胜负时用的数，不是事后编的解释。按影响从大到小排。</p>
  </div>`;
}
