/* ================= 业余赛事：城市争霸赛 / 主播杯 =================

   原来是报名之后一次性把所有轮次跑完，玩家只能看结果，全程没有参与。
   现在改成真正的赛程：

     报名 → 隔两周打第一轮 → 赢了才有下一轮 → 每轮更难
     轮次之间的周你照常训练、直播、冲分，也可以专门备战
     每一场都有节点决策，赢面靠你自己的属性和选择撑

   奖金按走到第几轮发，输了当场淘汰。                                */

/* 对手强度怎么定？

   两条约束，缺一不可：

   一、绝对强度，不跟着玩家走。
       国服第一去打城市争霸赛就该碾压，这是常识；
       一个大师去打，打得艰难才是对的。
       （之前试过按报名时的水平锚定，等于把「变强」这件事抵消掉了，
         练到国服第一还是一样难——不合理。）

   二、必须明显比职业赛容易。
       市级公开赛不该比 LPL 难。实测过一版带宽定高了的：
       业余杯赛胜率 55%，职业赛 65%——杯赛反而更难，荒谬。
       原因是职业赛有队友、默契、战术、士气一起抬，
       而这里几乎是纯个人，所以对手带必须压得更低。

   带宽按玩家在这个阶段的真实水平定标：
   第 8 周报名时玩家约 53，决赛时约 55。
   第一版定成 46→56，结果钻石段位夺冠率只有 5%——第一年基本
   打不赢，那这个赛事对新玩家就等于不存在。整体下调 3 分。

     城市争霸赛  43 → 52.5
       首轮明显打得过（网吧联队），决赛才追平你当时的水平（市队）。
       名单长度要和轮数一致，否则最后一支永远轮不到——决赛得是最强的那支。
     主播杯      47 → 55.5
       邀请制，门槛更高，整体上浮一档；决赛的冠军主播队要强过你。

   赛程节奏：一周一轮，整届 3–4 周打完。
   原来是两周一轮，城市赛从第 10 周拖到第 16 周——业余赛事不是
   这么办的，都是集中几周、一周多赛就结束。拖那么长还有个副作用：
   试训邀请要等赛事结束才能发，赛程占满中段就没有窗口了。

   注意：这里的数字和职业选手评分不是一把尺子——
   职业评分是在同位置同层级内做 z 标准化的（见 export_game.py），
   50 分意思是「该层级的平均水平」，不能跨系统直接比大小。      */
const CUPS={
  city:{ name:"城市争霸赛", rounds:4, gap:1, band:[43,52.5],
         prize:[0,25,70,180,420],
         opps:["网吧联队","本地车队","大学生战队","市队"] },
  stream:{ name:"主播杯", rounds:3, gap:1, band:[47,55.5],
         prize:[0,60,180,520],
         opps:["百万粉丝队","退役选手队","冠军主播队"] }
};

/* ---------- 报名之后：建赛程，而不是直接出结果 ---------- */
function enterCup(kind){
  const C=CUPS[kind]; if(!C) return;
  S.cups=S.cups||{};
  S.cups[kind]={ kind, name:C.name, round:1, rounds:C.rounds,
                 nextWeek:S.pre.week+C.gap, alive:true, wins:0, prep:0,
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
  const [lo,hi]=C.band;
  const t=(C.rounds>1)?(c.round-1)/(C.rounds-1):0;
  return lo+(hi-lo)*t+((c.oppRoll!==undefined)?c.oppRoll:0);
}
/* 把强度翻回段位，界面上直说「这一轮对手大概什么水平」。
   玩家对段位有直觉，对 56.9 这个数字没有。 */
function powerRank(p){
  const v=clamp((p-40)/0.38,0,100);
  let n=RANKS[0].n;
  RANKS.forEach(r=>{ if(v>=r.at) n=r.n; });
  return n;
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
  // 打得越多，被球探看到的次数越多。累积在这里，但兑现要等整届打完——
  // 赛程进行中发邀请会把比赛线整个短路（试过：玩家半决赛就签约走人）。
  S.pre.scoutSeen = (S.pre.scoutSeen||0) + 1;
  if(won){
    c.wins++;
    addFame(4+c.round*2);
    preLog(`<b>${C.name}</b> 第 ${c.round} 轮：${m.sc[0]}:${m.sc[1]} 击败 ${m.opp}。`,"good");
    // 这里原本会「每赢一轮就可能来邀请」，但那会把杯赛线整个短路：
    // 玩家在半决赛就签约走人，奖金、成就、决赛全都拿不到，
    // 职业赛胜率也从 66% 掉到 51%（签得太早，属性还没练起来）。
    // 邀请只在整届打完后发——机会数量靠段位和人气那两条线补。
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
  // 关键：不用夺冠。走得远，数据被记下来，就有人来问。
  if(typeof checkTryoutInvite==="function") checkTryoutInvite(k,reached,champion);
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
        <div class="sd"><div class="nm">${meName()}</div>
          <div class="pw">${powerRank(my)}水平 · ${my.toFixed(0)}</div></div>
        <div class="mid">VS</div>
        <div class="sd"><div class="nm">${cupOppName(k)}</div>
          <div class="pw">${powerRank(op)}水平 · ${op.toFixed(0)}</div></div>
      </div>
      <p class="note" style="margin-top:10px">${wait>0
        ? `还有 <b>${wait} 周</b>开打。这几周可以正常训练，也可以专门备战。`
        : `<b style="color:var(--gold)">就是本周。</b>`}
        ${c.prep>0?`　已备战 ${c.prep} 次。`:""}
        <br>${d>8?"这个级别的对手你已经打过太多了，稳住就行。"
             :d>3?"你占优，但别浪。"
             :d>-2?"势均力敌，就看临场那几个决定。"
             :d>-7?"对手比你强，得靠备战和决策去搏。"
             :"实力差得有点多——赢面很小，除非临场赌对。"}</p>
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
