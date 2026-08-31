/* ================= 托管 · 精简版模式 =================

   玩家原话：「部分玩家确实只专注于赛场，不想耗费精力在这一块」
   「相当于精简版游戏和完整版游戏一块推出，需要精简感到无聊的时候就一键自动托管」。

   所以它不是开局的难度选项，是一个**随时可切**的开关：同一个存档里
   玩腻了细节就托管，想回来管就关掉。

   实测一局赛场外有 80+ 次强制弹窗（随机事件 26.5 + 更衣室 16.1 +
   团队投入 40 个决策位 + 报名 1.7），外加 24 个商城按钮反复重扫。

   两条不能破的规矩：
     一、推荐走稳健路线，不是最优解。托管不收钱——玩家要的就是省心，
         再收他钱等于惩罚这种玩法。代价是隐性的：手动玩才能做托管不做的事
         （砸定制级外设、赌高价独家、事件里选高风险项）。
         精简版能打出不错的结果，完整版才有上限。
     二、不能是黑箱。每一件托管做过的事都要留痕，玩家随时能翻。
                                                                        */

const AUTO_KEYS=[
  {k:"buy",    n:"采购", d:"外设、课程、放松、团队投入"},
  {k:"biz",    n:"商务", d:"直播独家、杯赛报名"},
  {k:"daily",  n:"日常", d:"随机事件、更衣室谈话"},
  {k:"career", n:"生涯", d:"试训、转会、合同、下放", warn:true}
];
function autoOn(k){ return !!(S.auto && S.auto[k]); }
function autoAnyOn(){ return AUTO_KEYS.some(x=>autoOn(x.k)); }
function autoAllOn(){ return AUTO_KEYS.every(x=>autoOn(x.k)); }
function autoSet(k,v){
  S.auto=S.auto||{};
  S.auto[k]=!!v;
  render();
}
function autoToggleAll(){
  const on=!autoAllOn();
  S.auto=S.auto||{};
  AUTO_KEYS.forEach(x=>S.auto[x.k]=on);
  pushEvent(on
    ? `<b>赛场外交给团队打理了。</b>采购、商务、日常、生涯全部按推荐执行——
       随时可以在经济页收回来。<br>
       <span style="color:var(--ink-3)">推荐走的是稳健路线：不砸定制级外设、不赌高价独家、
       事件里选温和项。自己管的上限比这高。</span>`
    : `收回了托管。赛场外的事重新由你自己定。`, "info", "托管");
  render();
}

/* 托管做过的事，按周记一笔，界面上摊开给玩家看 */
function autoNote(txt){
  S.autoLog=S.autoLog||[];
  S.autoLog.push(txt);
  if(S.autoLog.length>40) S.autoLog=S.autoLog.slice(-40);
}
function autoLogClear(){ S.autoLog=[]; }

/* ---------- 一、采购 ----------
   先留出安全余额：手上永远得有下一次报名费和几次理疗的钱，
   不然托管会把你花到打不起比赛。 */
const AUTO_RESERVE=250;
function autoCash(){ return (S.money||0)-AUTO_RESERVE; }

/* 外设槽位排序：先武装自己最强的那一维——托管不替玩家改打法，
   只把他已经在走的路走顺。 */
function autoGearOrder(){
  const rank={};
  DIMS.slice().sort((a,b)=>S.attrs[b]-S.attrs[a]).forEach((d,i)=>rank[d]=i);
  return SLOTS.slice().sort((a,b)=>{
    const da=Object.keys(GEAR[a.k][1].e)[0], db=Object.keys(GEAR[b.k][1].e)[0];
    return (rank[da]===undefined?9:rank[da])-(rank[db]===undefined?9:rank[db]);
  });
}
/* 课程只买「现在就用得上」的。
   语言课是赌以后去外赛区，托管不赌——除非人已经在外面了，或者手上就有外赛区的报价。 */
function autoCourseWanted(){
  const want=[];
  const low=DIMS.slice().sort((a,b)=>S.attrs[a]-S.attrs[b])[0];
  if(low==="心态") want.push("psy");
  if(low==="运营") want.push("vod");
  if(typeof avgTrust==="function" && S.career && avgTrust()<45) want.push("comm");
  const abroad=(S.homeLeague&&S.homeLeague!=="LPL"&&S.homeLeague!=="LDL")
            || (S.proOffer&&S.proOffer.league&&S.proOffer.league!=="LPL")
            || (S.deal&&S.deal.league&&S.deal.league!=="LPL");
  if(abroad){
    const lg=(S.deal&&S.deal.league)||(S.proOffer&&S.proOffer.league)||S.homeLeague;
    want.push(lg==="LCK"?"kr":"en");
  }
  return want;
}
/* 每次最多做 3 件事——托管是替你打理，不是一秒钟把账户清空。 */
function autoBuy(){
  let n=0;
  // 1) 累到一定程度的疲劳：买「每万块清疲劳最多」的那一项
  if(S.fatigue>=70 && typeof RELAX!=="undefined"){
    const ok=RELAX.filter(x=>x.cost<=autoCash());
    const best=ok.sort((a,b)=>(-b.fat/b.cost)-(-a.fat/a.cost))[0];
    if(best && typeof buyRelax==="function"){
      buyRelax(best.k); autoNote(`买了「${best.n}」压疲劳`); n++;
    }
  }
  // 2) 团队投入：每赛段刷新，不用就浪费。按固定优先级来，不看局势——
  //    「看局势」正是手动玩的价值所在。
  if(n<3 && S.career && typeof SPEND!=="undefined"){
    for(const x of SPEND){
      if(S.buff&&S.buff[x.k]) continue;
      if(x.cost>autoCash()) continue;
      addMoney("team",-x.cost); x.run();
      pushEvent(`花 ${x.cost} 万：${x.n}。`,"info","开销");
      autoNote(`买了「${x.n}」`); n++;
      break;                                  // 一次一项，别一口气清空
    }
  }
  // 3) 外设：升到职业级（第 2 档）为止。
  //    定制级性价比低、上限高，那是手动玩的人该去赌的东西——
  //    只有余额已经多到没处花（>3000 万）时托管才碰。
  if(n<3 && typeof SLOTS!=="undefined"){
    const ceil=(S.money>3000)?3:2;
    for(const s of autoGearOrder()){
      const cur=(S.gear&&S.gear[s.k])||0;
      if(cur>=ceil) continue;
      const t=cur+1, g=GEAR[s.k][t];
      if(!g||g.cost>autoCash()) continue;
      buyGear(s.k,t); autoNote(`换了${s.n}：${g.n}`); n++;
      break;
    }
  }
  // 4) 课程：只买现在用得上的
  if(n<3 && typeof COURSES!=="undefined"){
    for(const k of autoCourseWanted()){
      const c=COURSES.find(x=>x.k===k);
      if(!c || (typeof hasCourse==="function"&&hasCourse(k))) continue;
      if(c.cost>autoCash()) continue;
      buyCourse(k); autoNote(`报了「${c.n}」`); n++;
      break;
    }
  }
  return n;
}

/* ---------- 二、商务 ---------- */
/* 独家签不签，看粉丝离天花板还有多远。
   还有空间就别锁死（自由身上限更高）；已经贴着天花板了，保底更划算。
   永远不签来抢人的那家：经理 −12 换 15% 保底，不值。 */
function autoStreamPick(){
  const fill=(typeof fanFill==="function")?fanFill():0.5;
  if(fill<0.6) return null;                     // null = 不签
  return (S.streamOffer&&S.streamOffer.club&&S.team)?"club":"solo";
}
function autoBiz(){
  if(S.streamOffer){
    const pick=autoStreamPick();
    if(pick===null){ declineStreamDeal(); autoNote("拒了平台独家（粉丝还有涨的空间）"); }
    else if(pick==="club"){ signStreamDeal("club"); autoNote(`签了俱乐部的合作平台`); }
    else { signStreamDeal(); autoNote("签了平台独家"); }
    return true;
  }
  if(S.signup){
    const m=S.signup;
    const afford = m.fee<=(S.money||0)*0.4;
    S.signup=null;
    if(m.need&&m.need()&&afford){
      if(typeof addMoney==="function") addMoney("fee",-m.fee); else S.money-=m.fee;
      if(S.pre&&!S.pre.cupTeam) S.pre.cupTeam=safeName((S.name&&S.name!=="无名"?S.name:"无名")+"战队");
      preLog(`交了 <b>${m.fee} 万</b>报名费，报了 ${m.name}。`,"info");
      enterCup(m.signup);
      autoNote(`报名了${m.name}`);
    } else {
      autoNote(`没报${m.name}（${m.need&&!m.need()?"门槛不够":"报名费占余额太多"}）`);
    }
    advancePreWeek();
    return true;
  }
  return false;
}

/* ---------- 三、日常 ---------- */
/* 事件的推荐项写在事件自己身上（rec 字段）。
   推荐项要花钱而余额不够时，退到第一个不花钱的选项——
   不能让托管把玩家花破产。 */
function autoPickOption(list, rec){
  let i=(typeof rec==="number"&&list[rec])?rec:0;
  const c=list[i]&&list[i].cost;
  if(c && (S.money||0)<c){
    const free=list.findIndex(x=>!x.cost);
    if(free>=0) i=free;
  }
  return i;
}
function autoDaily(){
  if(S.rndEv){
    const def=(typeof RANDOM_EVENTS!=="undefined")
      ? RANDOM_EVENTS.find(e=>e.id===S.rndEv.id) : null;
    const i=autoPickOption(S.rndEv.a, def?def.rec:0);
    resolveRandom(i);
    autoNote(`际遇：${S.rndEv?"":""}选了「${(def?def.a:[])[i]?def.a[i].t:"推荐项"}」`);
    return true;
  }
  if(S.rndResult){ S.rndResult=null; render(); return true; }
  if(S.locker){
    const ev=S.locker.ev;
    const i=autoPickOption(ev.a, ev.rec);
    const label=ev.a[i]?ev.a[i].t:"推荐项";
    resolveLocker(i);
    autoNote(`更衣室：选了「${label}」`);
    return true;
  }
  return false;
}

/* ---------- 四、生涯（默认关，开的时候会警告） ---------- */
function autoCareerStep(){
  const P=S.pre;
  // 试训邀请：差得不太远就去。去了不一定过，那是试训自己的事
  if(P && P.invite && P.invite.pending){
    const iv=P.invite; iv.pending=false;
    const gap=(typeof tryoutSkill==="function")?(tryoutSkill()-iv.expect):0;
    if(gap>=-4){ startTryout(iv.tier, iv.team, iv.expect); autoNote(`去了 ${iv.team} 的试训`); }
    else { autoNote(`没去 ${iv.team} 的试训（差得太远）`); render(); }
    return true;
  }
  // 试训四天：每天选和自己最强那一维对上的选项
  if(S.tryout){
    const t=S.tryout;
    if(t.done){ afterTryout(); return true; }
    const day=(typeof TRYOUT_DAYS!=="undefined")?TRYOUT_DAYS[t.day]:null;
    let i=1;
    if(day&&day.a&&day.a.length){
      let best=-1;
      day.a.forEach((o,k)=>{ const v=S.attrs[o.dim]||0; if(v>best){best=v;i=k;} });
    }
    resolveTryoutDay(i);
    return true;
  }
  // 合同：还一次价再签。谈崩的风险由 askDeal 自己管
  if(S.deal){
    const d=S.deal;
    if(d.dead){ dropDeal(); autoNote("合同谈崩了"); return true; }
    if(!d.asks){ askDeal("pay"); return true; }
    if(d.transfer){ signTransfer(); autoNote(`转会签了 ${d.team}`); }
    else { signDeal(); autoNote(`签了 ${d.team}`); }
    return true;
  }
  // 转会问询：对方比现在这支强就走
  if(S.proOffer){
    const o=S.proOffer;
    const mine=(typeof clubStanding==="function")?clubStanding(S.team):null;
    const his=(typeof clubStanding==="function")?clubStanding(o.team):null;
    const better = (o.league&&o.league!=="LPL") ? true
                 : (mine&&his) ? (his.power>mine.power) : true;
    if(better){ takeProOffer(); autoNote(`接了 ${o.team} 的问询`); }
    else { dropProOffer(); autoNote(`婉拒了 ${o.team}`); }
    return true;
  }
  // 下放青训队：连着拿不到比赛就去打，能打比赛比坐板凳强
  if(S.confirm && S.confirm.tag==="senddown"){
    const c=S.confirm; S.confirm=null;
    if((S.benchedSplits||0)>=2){ autoNote("接受了下放，去 LDL 打比赛"); if(c.fn) c.fn(); }
    else { autoNote("拒绝了下放，留在一队等机会"); if(c.alt&&c.alt.fn) c.alt.fn(); else render(); }
    return true;
  }
  return false;
}

/* ---------- 调度 ---------- */
/* 一次处理一件事。render 在外面被锁住了，所以这里可以放心地一件件做。 */
function autoStep(){
  if(S.step==="create"||S.step==="end") return false;
  // 日常（际遇/更衣室）在比赛里也要处理：更衣室谈话恰恰是打完那一刻弹的，
  // 那时候 step 还是 "match"。把 match 整个排除掉，托管就会在这里卡死。
  if(autoOn("daily") && autoDaily()) return true;
  // 别的都等比赛打完再说——比赛里的选择是 S.match.node，不归托管管
  if(S.step==="match") return false;
  if(autoOn("biz")    && autoBiz())        return true;
  if(autoOn("career") && autoCareerStep()) return true;
  if(autoOn("buy")){
    // 采购一周跑一次就够，不用每次渲染都翻一遍商城
    const wk=(typeof weekKey==="function")?weekKey():"";
    if(S._autoBuyWk!==wk){ S._autoBuyWk=wk; if(autoBuy()) return true; }
  }
  return false;
}
let _autoBusy=false;
function autoSweep(){
  if(_autoBusy) return;
  if(!S||!S.auto||!autoAnyOn()) return;
  _autoBusy=true;
  try{ for(let i=0;i<30;i++){ if(!autoStep()) break; } }
  catch(e){
    /* 托管出错不能把整局卡死——交回给玩家自己点。
       但绝不能静默：把错误记下来，否则「托管悄悄不干活」永远查不出来。 */
    S._autoErr=(e&&e.message)||String(e);
    if(typeof console!=="undefined"&&console.warn) console.warn("托管出错：",e);
  }
  finally{ _autoBusy=false; }
}
/* 「现在就按推荐执行一次」——不开托管也能用的一次性按钮 */
function autoOnce(){
  if(_autoBusy) return;
  _autoBusy=true;
  const before=(S.autoLog||[]).length;
  try{
    for(let i=0;i<30;i++){
      let did=false;
      if(autoDaily()) did=true;
      else if(autoBiz()) did=true;
      else { S._autoBuyWk=null; if(autoBuy()) did=true; }
      if(!did) break;
    }
  }catch(e){ S._autoErr=(e&&e.message)||String(e); }
  finally{ _autoBusy=false; }
  const n=(S.autoLog||[]).length-before;
  pushEvent(n?`按推荐执行了 <b>${n}</b> 件事：${(S.autoLog||[]).slice(-n).join("、")}。`
             :`按推荐看了一遍，<b>暂时没有该做的事</b>。`,"info","托管");
  render();
}

/* ---------- 界面 ---------- */
/* 经济页顶部那张卡。开关摆开，代价也写在脸上。 */
function autoCard(){
  const all=autoAllOn();
  return `<div class="card"><h2>托管<em>${autoAnyOn()?"已开启":"未开启"}</em></h2>
    <p class="note" style="margin:0 0 12px">赛场外的杂事可以整包交出去，
      <b>随时可以再收回来</b>——同一个存档里来回切，不用重开。</p>
    <div class="row" style="margin:0 0 12px">
      <button class="btn ${all?"ghost":""}" id="autoAll">${all?"全部收回":"一键全托管"}</button>
      <button class="btn ghost" id="autoNow">现在就按推荐执行一次</button>
    </div>
    <p class="note" style="margin:0 0 8px;color:var(--ink-3)">下面四格<b>点一下就是开关</b>，可以只交出去一部分。</p>
    <div class="autogrid">${AUTO_KEYS.map(x=>`
      <button class="autoitem ${autoOn(x.k)?"on":""}" data-auto="${x.k}">
        <div class="t"><span class="sw">${autoOn(x.k)?"●":"○"}</span>${x.n}${
          autoOn(x.k)?'<span class="tag g">托管中</span>':'<span class="tag">未托管</span>'}</div>
        <div class="d">${x.d}</div>
        ${x.warn?`<div class="d" style="color:var(--red)">这是主线——托管掉基本等于看别人打</div>`:""}
      </button>`).join("")}</div>
    <p class="note" style="margin-top:12px">推荐走的是<b>稳健路线</b>，不是最优解：
      不砸定制级外设、不赌高价独家、事件里选温和项。
      <b>自己管的上限比托管高</b>——这是「精简版能打、完整版有上限」的意思。</p>
    ${autoAnyOn()?`<div class="ver" style="margin-top:10px">
      <b>开了之后会怎样</b><br>
      ${autoOn("daily")?"际遇和更衣室谈话不再弹窗问你，直接按推荐处理。<br>":""}
      ${autoOn("biz")?"直播独家、杯赛报名自动决定。<br>":""}
      ${autoOn("buy")?"有钱就自动添装备、买课、压疲劳。<br>":""}
      ${autoOn("career")?'<span style="color:var(--red)">试训、转会、合同、下放也自动了——主线交出去了。</span><br>':""}
      做过的每一件都会写进日志，<b>本周页顶部</b>也有一条「托管中」随时能收回。</div>`:""}
    ${(S.autoLog&&S.autoLog.length)?`<div class="ver" style="margin-top:10px">
      <b>托管最近做的事</b><br>${S.autoLog.slice(-8).join("　·　")}</div>`:""}
    <div class="row" style="margin-top:12px">
      <button class="btn ghost" id="autoBack">回到本周，接着打 →</button>
    </div>
  </div>`;
}
/* 本周页顶部那条细条：托管开着的时候，让玩家一眼看见它替自己做了什么 */
function autoBar(){
  if(!autoAnyOn()) return "";
  const log=(S.autoLog||[]).slice(-3);
  const names=AUTO_KEYS.filter(x=>autoOn(x.k)).map(x=>x.n).join("·");
  return `<div class="autobar">
    <span class="ab-k">托管中</span>
    <span class="ab-t">${names}${log.length
      ? `　—　最近：${log.join("、")}`
      : `　—　这几类事不会再停下来问你，行动点还是你自己花`}</span>
    <button class="rt-x" id="autoOff">收回</button>
  </div>`;
}
