/* ================= 业余赛事：城市争霸赛 / 主播杯 =================

   原来是报名之后一次性把所有轮次跑完，玩家只能看结果，全程没有参与。
   现在改成真正的赛程：

     报名 → 隔两周打第一轮 → 赢了才有下一轮 → 每轮更难
     轮次之间的周你照常训练、直播、冲分，也可以专门备战
     每一场都有节点决策，赢面靠你自己的属性和选择撑

   奖金按走到第几轮发，输了当场淘汰。                                */

/* 对手强度怎么定？

   一开始写的是固定值（城市赛 34 起步，每轮 +4.2）。问题是玩家在
   第 10 周就已经有 53 的战力了——首轮胜率 98%，决赛还有 86%，
   整个赛程夺冠率 77%，而且首轮最无聊：领先 17.8 分，毫无悬念。

   现在改成「报名那一刻锚定你自己的水平」，再按轮次往上爬：
     lead0  首轮你领先多少（正数=你占优）
     step   每轮对手涨多少
   数值是按 BO3 反推的：三局两胜会把单局优势放大，
   单局 73% 到了 BO3 就是 85%，所以 lead0 要压得比直觉低。
   于是首轮是场稳的，越往后越紧，最后一轮要靠备战和临场决策去搏。
   floor 是绝对下限，防止水平太低的人报名后面对一群更弱的对手。   */
const CUPS={
  city:{ name:"城市争霸赛", rounds:4, gap:2, lead0:2.6, step:2.3, floor:34,
         prize:[0,25,70,180,420],
         opps:["网吧联队","本地车队","大学生战队","青训预备组","市队"] },
  stream:{ name:"主播杯", rounds:3, gap:2, lead0:0.5, step:2.6, floor:40,
         prize:[0,60,180,520],
         opps:["百万粉丝队","退役选手队","平台官方队","冠军主播队"] }
};

/* ---------- 报名之后：建赛程，而不是直接出结果 ---------- */
function enterCup(kind){
  const C=CUPS[kind]; if(!C) return;
  S.cups=S.cups||{};
  S.cups[kind]={ kind, name:C.name, round:1, rounds:C.rounds,
                 nextWeek:S.pre.week+C.gap, alive:true, wins:0, prep:0,
                 anchor:cupMyPower(null),      // 报名时的你，就是这届赛事的标尺
                 oppRoll:rollOpp() };
  preLog(`报名成功。<b>${C.name}</b> 第一轮在 <b>第 ${S.cups[kind].nextWeek} 周</b>——
    中间这两周你可以练，也可以专门备战。`,"good");
}
/* 对手强度随轮次递增 */
function cupOf(k){ return (S.cups||{})[k]; }
function activeCups(){ return Object.values(S.cups||{}).filter(c=>c.alive); }
function rollOpp(){ return (rnd()-0.5)*3.0; }   // 每轮抽一次，签运
function cupOppPower(k){
  const c=cupOf(k), C=CUPS[k];
  if(!c||!C) return 0;
  const anchor=(c.anchor!==undefined)?c.anchor:C.floor+C.lead0;
  const v=anchor-C.lead0+(c.round-1)*C.step;
  return Math.max(C.floor+(c.round-1)*C.step, v)+((c.oppRoll!==undefined)?c.oppRoll:0);
}
function cupOppName(k){
  const c=cupOf(k), C=CUPS[k];
  return C.opps[Math.min(c.round-1,C.opps.length-1)];
}
/* 你的业余赛战力：和职业赛不同，这里几乎全看个人 */
function cupMyPower(k){
  return S.attrs.操作*0.42+S.attrs.运营*0.28+S.attrs.心态*0.18+S.attrs.体质*0.12
       +(S.attrs.指挥-50)*0.12
       +(typeof gearBonus==="function"?gearBonus("操作")*0.4:0)
       +((k&&cupOf(k))?cupOf(k).prep*1.6:0);      // 备战的收益
}

/* ---------- 备战 ---------- */
function cupPrep(k){
  const c=cupOf(k);
  if(S.pre.ap<=0||!c||!c.alive) return;
  c.prep++;
  addFat(11);
  S.pre.ap--;
  preLog(`针对 <b>${cupOppName(k)}</b> 看了他们的录像，找到了几个能打的点。`,"info");
  if(typeof noteAct==="function") noteAct("pre","prep");
  render();
}

/* 每周推进时叫一次：到点的比赛要提醒，不然玩家会错过 */
function cupTick(){
  activeCups().forEach(c=>{
    const wait=c.nextWeek-S.pre.week;
    if(wait===1) preLog(`<b>${c.name}</b> 第 ${c.round} 轮下周开打，对手 ${cupOppName(c.kind)}。`,"info");
    else if(wait<=0&&!c.due){ c.due=true;
      preLog(`<b>${c.name}</b> 第 ${c.round} 轮就是本周——随时可以上场。`,"good"); }
    if(wait>0) c.due=false;
  });
}

/* ---------- 开打 ---------- */
function startCupMatch(k){
  const opp=cupOppName(k), op=cupOppPower(k);
  S.cupMatch={ kind:k, opp, op, sc:[0,0], need:2, game:1, lines:[], node:null, swing:0, done:false };
  cupNextGame();
}
function cupNextGame(){
  const m=S.cupMatch;
  if(m.sc[0]>=m.need||m.sc[1]>=m.need){ endCupMatch(); return; }
  // 复用比赛节点池，但只取通用的那些（业余赛没有国际赛/赛点那套）
  const ALL=(typeof NODES_MORE!=="undefined")?NODES.concat(NODES_MORE):NODES;
  const ctx=Object.assign({},m,{lead:m.sc[0]-m.sc[1]});
  let pool=ALL.filter(n=>{ try{ return n.when(ctx); }catch(e){ return false; } });
  m.seen=m.seen||[];
  const fresh=pool.filter(n=>!m.seen.includes(n.q));
  if(fresh.length) pool=fresh;
  m.node=pool[Math.floor(rnd()*pool.length)];
  if(m.node) m.seen.push(m.node.q);
  render();
}
function resolveCupNode(i){
  const m=S.cupMatch, opt=m.node.a[i], v=S.attrs[opt.dim];
  const p=clamp(0.30+(v/100)*0.55,0.15,0.9);
  const ok=rnd()<p;
  m.swing+=(ok?1:-1)*opt.risk*5.0;
  m.lines.push(`<div><span class="hi">第${m.game}局</span> ${opt.t} — ${
    ok?'<span class="w">成了</span>':'<span class="l">没成</span>'}</div>`);
  m.node=null;
  cupPlayGame();
}
function cupPlayGame(){
  const m=S.cupMatch;
  const my=cupMyPower(m.kind)+m.swing;
  const p=clamp(1/(1+Math.exp(-(my-m.op)/5.5)),0.05,0.95);
  const win=rnd()<p;
  if(win) m.sc[0]++; else m.sc[1]++;
  m.lines.push(`<div>第${m.game}局 ${win?'<span class="w">胜</span>':'<span class="l">负</span>'}</div>`);
  m.game++; m.swing*=0.4;
  cupNextGame();
}
function endCupMatch(){
  const m=S.cupMatch, k=m.kind, c=cupOf(k), C=CUPS[k];
  const won=m.sc[0]>m.sc[1];
  m.done=true;
  if(won){
    c.wins++;
    addFame(4+c.round*2);
    preLog(`<b>${C.name}</b> 第 ${c.round} 轮：${m.sc[0]}:${m.sc[1]} 击败 ${m.opp}。`,"good");
    if(c.round>=C.rounds){
      c.alive=false; cupPayout(k,true);
    } else {
      c.round++; c.prep=0; c.oppRoll=rollOpp();
      c.nextWeek=S.pre.week+C.gap;
      preLog(`下一轮对手是 <b>${cupOppName(k)}</b>，<b>第 ${c.nextWeek} 周</b>开打。`,"info");
    }
  } else {
    c.alive=false;
    preLog(`<b>${C.name}</b> 第 ${c.round} 轮：${m.sc[0]}:${m.sc[1]} 不敌 ${m.opp}，止步于此。`,"bad");
    cupPayout(k,false);
  }
  render();
}
function cupPayout(k,champion){
  const c=cupOf(k), C=CUPS[k];
  const reached=champion?C.rounds:c.wins;
  const prize=(C.prize||[])[reached]||0;
  if(prize){ S.money+=prize; preLog(`奖金到账 <b>${prize} 万</b>。`,"good"); }
  addFame(reached*(k==="stream"?6:4));
  if(k==="city") S.pre.cityCup=reached;
  else S.pre.streamCup=reached;
  if(typeof checkAch==="function") checkAch("cup",{kind:k,win:reached});
  if(champion) preLog(`<b>${C.name} 冠军。</b>这个名字开始有人记住了。`,"big");
  // 结算先挂在这场比赛上，等玩家看完比分点「继续」再弹总结。
  // 之前这里直接 S.cupMatch=null，被淘汰那一场的比分和过程会凭空消失——
  // 玩家只看到一个「止步第几轮」的框，不知道最后那局是怎么输的。
  if(S.cupMatch) S.cupMatch.result={name:C.name,reached,rounds:C.rounds,prize,champion};
  else S.cupResult={name:C.name,reached,rounds:C.rounds,prize,champion};
}
/* 看完比分，收起比赛卡；该弹总结的时候再弹 */
function cupDismissMatch(){
  const m=S.cupMatch;
  if(m&&m.result) S.cupResult=m.result;
  S.cupMatch=null;
  render();
}

/* ---------- 界面 ---------- */
/* 两个赛事时间会重叠，所以是列表，不是单个 */
function cupCard(){
  const list=activeCups();
  if(!list.length) return "";
  return list.map(c=>{
    const k=c.kind, C=CUPS[k];
    const wait=Math.max(0,c.nextWeek-S.pre.week);
    const my=cupMyPower(k), op=cupOppPower(k);
    const d=my-op;
    return `<div class="card cup"><h2>${C.name}<em>第 ${c.round}/${C.rounds} 轮</em></h2>
      <div class="next">
        <div class="sd"><div class="nm">${meName()}</div><div class="pw">状态 ${my.toFixed(0)}</div></div>
        <div class="mid">VS</div>
        <div class="sd"><div class="nm">${cupOppName(k)}</div><div class="pw">强度 ${op.toFixed(0)}</div></div>
      </div>
      <p class="note" style="margin-top:10px">${wait>0
        ? `还有 <b>${wait} 周</b>开打。这几周可以正常训练，也可以专门备战。`
        : `<b style="color:var(--gold)">就是本周。</b>`}
        ${c.prep>0?`　已备战 ${c.prep} 次。`:""}
        <br>${d>4?"这一轮对手不算强。":d>-2?"势均力敌，就看临场那几个决定。":"对手比你强，得靠决策赌一把。"}</p>
      <div class="row">
        <button class="act" data-cupprep="${k}" style="flex:1" ${S.pre.ap<=0?'disabled':''}>
          <div class="t">备战</div><div class="d">看对手录像，提升这一轮的赢面</div></button>
        ${wait<=0?`<button class="btn" data-cupgo="${k}">上场 →</button>`:""}
      </div></div>`;
  }).join("");
}
function cupMatchCard(){
  const m=S.cupMatch; if(!m) return "";
  const C=CUPS[m.kind]||CUPS.city;
  const c=cupOf(m.kind);
  return `<div class="card"><h2>${C.name}<em>第 ${c?c.round:1} 轮 · 三局两胜</em></h2>
    <div class="vs">
      <div class="side"><div class="nm">${meName()}</div></div>
      <div class="score">${m.sc[0]} : ${m.sc[1]}</div>
      <div class="side"><div class="nm">${m.opp}</div></div>
    </div>
    ${m.node?`<div class="node"><div class="q">${m.node.q}</div><div class="ctx">${m.node.ctx}</div>
      <div class="grid g2">${m.node.a.map((a,i)=>`<button class="opt" data-cupnode="${i}">
        <div class="t">${a.t}</div><div class="d">吃 <b>${a.dim}</b> · ${a.risk>0.8?'高风险高回报':'稳健'}</div>
      </button>`).join("")}</div></div>`:""}
    ${m.lines.length?`<div class="log">${m.lines.slice().reverse().join("")}</div>`:""}
    ${m.done?`<div class="row"><button class="btn" id="cupdone">继续 →</button></div>`:""}
  </div>`;
}
function cupResultCard(){
  const r=S.cupResult; if(!r) return "";
  return `<div class="rankup"><div class="ru-inner" style="max-width:440px">
    <div class="ru-eyebrow">${r.name}</div>
    <div class="ru-tier">${r.champion?"冠军":`止步第 ${r.reached+1} 轮`}</div>
    <div class="ru-txt">${r.champion
      ? "你把这个比赛赢到底了。这种地方赛事的冠军不值多少钱，但它是你简历上的第一行。"
      : r.reached>=2 ? "走到了后面几轮。数据被记下来了，这比奖金重要。"
      : r.reached>=1 ? "赢了一轮。至少证明了不是来凑数的。"
      : "首轮就被淘汰。这条路比想象中难。"}</div>
    ${r.prize?`<div class="evres"><span class="er up">奖金 <b>+${r.prize} 万</b></span></div>`:""}
    <div class="row" style="justify-content:center">
      <button class="btn" id="cupresok">知道了</button></div>
  </div></div>`;
}
