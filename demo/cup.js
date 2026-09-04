/* ================= 业余赛事：城市争霸赛 / 主播杯 =================

   原来是报名之后一次性把所有轮次跑完，玩家只能看结果，全程没有参与。
   现在改成真正的赛程：

     报名 → 隔一周打第一轮 → 赢了才有下一轮 → 每轮更难
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
/* 轮次要有名字。
   玩家原话：「不要写第几轮第几轮，要写清楚小组赛，半决赛，决赛等等」。
   「第 3 轮」既不知道离冠军还有多远，也不知道这一场有多重——
   而「半决赛」这三个字自带分量。 */
/* 2026-08-31 经济重锚：业余赛事的钱是业余的钱——
   原来城市赛冠军 420 万、主播杯 520 万，比青训年薪高一个数量级，
   「还没上岸先暴富」。现在城市赛冠军 50 万、主播杯 80 万：
   仍然是普通人一年的收入，但不再扭曲整条经济曲线。
   这些比赛真正的价值是履历（resumeCap 的试训通道），不是钱。 */
/* 统一标尺（2026-09-02）：对手带按新曲线的段位语义摆——
   城市赛＝钻石到大师（45-57），主播杯＝大师到王者（52-64）。
   玩家开局属性没动（~45 恰在钻石门口），相对难度和过去一致。 */
const CUPS={
  city:{ name:"城市争霸赛", rounds:4, gap:1, band:[47,59],
         prize:[0,2,8,20,50],
         rn:["小组赛","八强赛","半决赛","决赛"],
         opps:["网吧联队","本地车队","大学生战队","市队"] },
  stream:{ name:"主播杯", rounds:3, gap:1, band:[54,66],
         prize:[0,10,30,80],
         rn:["小组赛","半决赛","决赛"],
         opps:["百万粉丝队","退役选手队","冠军主播队"] },
  /* 全明星周末的娱乐表演赛（现实原型：LPL 全明星周末「主播对抗」）。
     邀请制看人气，免报名费，输了也有出场费——这是舞台，不是淘汰赛。
     主办方配明星队友，所以不动你的车队，胜负按个人发挥算。 */
  show:{ name:"全明星周末 · 主播表演赛", rounds:1, gap:1, band:[60,60],
         prize:[5,15],
         rn:["表演赛"],
         opps:["明星联队"] }
};

/* 这一轮叫什么。round 从 1 开始；越界就退回「第 N 轮」，不让它崩。 */
function cupRoundName(kind, round){
  const C=CUPS[kind]; const i=(round||1)-1;
  return (C&&C.rn&&C.rn[i]) ? C.rn[i] : `第 ${round} 轮`;
}
/* 走到第几轮＝走到哪一场（用来写「止步半决赛」这种） */
function cupReachName(kind, reached){
  const C=CUPS[kind]; if(!C) return `${reached} 轮`;
  if(reached>=C.rounds) return "夺冠";
  return `止步${cupRoundName(kind, reached+1)}`;
}

/* 业余队名：报名时玩家起的名字，没起就用选手 ID */
function cupTeamName(){
  return (S.pre&&S.pre.cupTeam)?escapeHtml(S.pre.cupTeam):meName();
}

/* ---------- 车队：随机路人队友 ----------
   业余赛不是一个人打的——报名时从路人池里抽 4 个队友组成车队。
   数值锚定赛事带宽（城市赛钻石档、主播杯更高一档），
   默契战术从很低起步：路人车队本来就是临时拼的，
   要靠训练赛/复盘/合练/双排真的练出来（和职业队同一套行动）。 */
const PUB_NAMES=["一刀","峡谷小","野区暴君","中路一霸","河道蟹","閃现撞墙","下饭","超神","躺赢",
  "带妹","netcafe","Wraith","Zzz","Kite","Muffin","Pudge","北极","卡莎驾到","操作拉满","布隆天下第一",
  "蓝Buff是我的","不吃兵线","龙魂猎人","逆风翻盘王","泉水指挥官","扫地僧","夜行者","小飞侠"];
function drawCupMates(kind){
  const C=CUPS[kind]||CUPS.city;
  const [lo,hi]=C.band;
  // 名字不重复：一次抽四个人，抽到重名的（「泉水指挥官36」和「泉水指挥官76」
  // 同时在队里）看着像 bug
  const pool=PUB_NAMES.slice();
  for(let i=pool.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  let pi=0;
  S.pre.mates=POS.filter(p=>p.k!==S.pos).map(p=>{
    // 偏上沿抽：愿意跟你组队打比赛的路人，本来就是这个池子里想赢的那批
    const lvl=lo+(0.45+0.55*rnd())*(hi-lo);
    const r={};
    DIMS.forEach(d=>r[d]=clamp(Math.round(lvl+(rnd()*14-7)),30,80));   // 全体系 +5
    return {id:(pool[pi++%pool.length])+(10+Math.floor(rnd()*90)),
            pos:p.k, age:16+Math.floor(rnd()*14), r};
  });
  // 临时车队：默契战术起点偏低，信任一般——这正是战队行动的用武之地
  S.squad={syn:45+Math.floor(rnd()*8), tac:47+Math.floor(rnd()*8)};
  S.trust={};
  S.pre.mates.forEach(m=>S.trust[m.id]=42+Math.floor(rnd()*14));
  preLog(`车队「<b>${cupTeamName()}</b>」集结：${
    S.pre.mates.map(m=>`${m.id}（${POSN[m.pos]}）`).join("、")}。<br>
    <span style="color:var(--ink-3)">临时拼的队，默契和战术都得从头练——战队行动解锁了。</span>`,"big");
}
/* ---------- 报名之后：建赛程，而不是直接出结果 ---------- */
function enterCup(kind){
  const C=CUPS[kind]; if(!C) return;
  S.cups=S.cups||{};
  S.cups[kind]={ kind, name:C.name, round:1, rounds:C.rounds,
                 nextWeek:S.pre.week+C.gap, alive:true, wins:0, prep:0,
                 oppRoll:rollOpp() };
  // 抽车队：手上已有活的车队就沿用（两个赛事一起打也是同一批人），
  // 没有才抽新的——练出来的默契跟着车队走。
  // 表演赛除外：主办方配明星队友，不动你的车队
  if(kind!=="show"&&(!S.pre.mates||!S.pre.mates.length)) drawCupMates(kind);
  if(kind==="stream"){ S.flags=S.flags||{}; S.flags.chainInv=1; }   // 任务链：主播杯的请柬到手
  // 别把间隔写死在文案里——赛程从两周一轮改成一周一轮之后，
  // 这句「中间这两周」就成了假话。
  preLog(`报名成功。<b>${C.name}</b> 赛程：<b>${C.rn.join(" → ")}</b>（共 ${C.rounds} 轮，一周一轮）。
    ${cupRoundName(kind,1)}在 <b>第 ${S.cups[kind].nextWeek} 周</b>打响，这段时间可以正常训练，也可以专门备战。`,"good");
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
function powerRank(p){ return tierOf(p); }   // 统一实力尺：同一张表
function cupOppName(k){
  const c=cupOf(k), C=CUPS[k];
  return C.opps[Math.min(c.round-1,C.opps.length-1)];
}
/* 你的业余赛战力。
   有车队之后就是真的战队战力：你（权重 2，车队围着你打）+ 四个路人
   的个人数值，再乘默契、战术、士气——和职业赛同一套构成，只是
   系数更敏感（路人队从 30 练到 60 的收益要看得见）。
   老档没有车队时退回纯个人的旧公式。 */
/* 统一实力尺：杯赛也读五维均值（原来是操作 .42 的另一把尺，玩家开局在旧尺上 45.4、
   新尺上 42.6——对手带整体下移 3 补偿，夺冠率不变） */
function cupPersonal(p){ return strength(p); }
function cupMyPower(k){
  const solo=cupPersonal(S.attrs)
       +(typeof gearBonus==="function"?gearBonus("操作")*0.4:0);
  const legacy=((k&&cupOf(k))?cupOf(k).prep*1.15:0)+(S.pre.cupPrep||0)*0.55;
  if(S.pre&&S.pre.mates&&S.pre.mates.length){
    // 业余赛就是大腿抬着队友打：你占 72%，车队水位占 28%——
    // 定标目标是「刚组队时 ≈ 旧的纯个人公式，练满默契战术后略强」，
    // 用 40 局批测对齐过旧版夺冠率（城市赛 ~52%、主播杯 ~40%）
    const teamAvg=(solo+S.pre.mates.reduce((a,m)=>a+cupPersonal(m),0))/(1+S.pre.mates.length);
    const base=solo*0.72+teamAvg*0.28;
    const syn=(typeof squadOf==="function")?squadOf("syn"):50;
    const tac=(typeof squadOf==="function")?squadOf("tac"):50;
    const mor=(typeof avgTrust==="function")?avgTrust():50;
    // 业余队的磨合弹性比职业队大得多——从 44 练到 65 的差距要打得出来
    return base*(1+(syn-50)/550)*(1+(tac-50)/650)*(1+(mor-50)/900)+legacy;
  }
  return solo+legacy;
}

/* ---------- 备战 ----------

   备战里有两样东西，性质完全不同：

   · 针对这一个对手的功课（看他们的录像、找弱点）——换了对手就作废
   · 练下来的战术执行和配合默契——这是你自己的东西，不会因为
     换个对手就没了，也不会因为换个赛事就归零

   原来两样混在一个 c.prep 里，每轮清零，等于上一轮的功课全白做。
   现在拆开：前者留在 c.prep（每轮重置），后者进 S.pre.cupPrep（永久），
   并且真的落到属性上——运营和指挥会涨，在试训和职业赛里一样有用。  */
function cupPrep(k){
  const c=cupOf(k);
  const cost=(typeof apCost==="function")?apCost("cupprep"):1;
  if(S.pre.ap<cost||!c||!c.alive) return;
  c.prep++;
  S.pre.cupPrep=(S.pre.cupPrep||0)+1;
  addFat(11);
  S.pre.ap-=cost;
  // 练配合这件事本身会长本事，所以给一点真实的属性成长（受天赋瓶颈约束）
  const g1=Math.min(0.34,Math.max(0,capOf("运营")-S.attrs.运营));
  const g2=Math.min(0.26,Math.max(0,capOf("指挥")-S.attrs.指挥));
  S.attrs.运营+=g1; S.attrs.指挥+=g2;
  preLog(`针对 <b>${cupOppName(k)}</b> 看了录像，也把几套配合过了一遍。
    ${(g1+g2)>0.05?`<span class="hi">运营 +${g1.toFixed(2)}　指挥 +${g2.toFixed(2)}</span>`:""}`,"info");
  if(typeof noteAct==="function") noteAct("pre","prep");
  render();
}

/* 每周推进时叫一次：到点的比赛要提醒，不然玩家会错过 */
function cupTick(){
  activeCups().forEach(c=>{
    const wait=c.nextWeek-S.pre.week;
    if(wait===1) preLog(`<b>${c.name}</b> <b>${cupRoundName(c.kind,c.round)}</b>下周开打，对手 ${cupOppName(c.kind)}。`,"info");
    else if(wait<=0&&!c.due){ c.due=true;
      preLog(`<b>${c.name}</b> <b>${cupRoundName(c.kind,c.round)}</b>就是本周——随时可以上场。`,"good"); }
    if(wait>0) c.due=false;
  });
}

/* 本周到点、但还没打的比赛 */
function dueCups(){
  return activeCups().filter(c=>c.nextWeek<=S.pre.week);
}
/* 不打就是弃权。
   原来推进周次完全不检查这个：比赛可以被无限期挂着，赛程也不往前走，
   于是「本周开打」永远显示在那儿，等于这场比赛不存在。
   现实里没上场就是弃权，这里也一样——但必须先问清楚。 */
function forfeitCup(k){
  const c=cupOf(k), C=CUPS[k];
  if(!c||!c.alive) return;
  c.alive=false;
  preLog(`<b>${C.name}</b> ${cupRoundName(k,c.round)}开赛时你没有出现。<b>按弃权处理。</b>`,"bad");
  cupPayout(k,false);
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
function cupWinP(m,swing){
  const my=cupMyPower(m.kind)+(swing||0);
  return clamp(1/(1+Math.exp(-(my-m.op)/5.5)),0.05,0.95);
}
function resolveCupNode(i){
  const m=S.cupMatch, opt=m.node.a[i], v=S.attrs[opt.dim];
  const p=clamp(0.30+(v/100)*0.55,0.15,0.9);
  const ok=rnd()<p;
  const was=cupWinP(m,m.swing);
  m.swing+=(ok?1:-1)*opt.risk*5.0;
  const now=cupWinP(m,m.swing);
  const d=Math.round(now*100)-Math.round(was*100);
  m.lines.push(`<div><span class="hi">第${m.game}局</span> ${opt.t} — ${
    ok?'<span class="w">成了</span>':'<span class="l">没成</span>'}　<span class="${
      d>0?'w':d<0?'l':''}">赢面 ${Math.round(was*100)}% → ${Math.round(now*100)}%</span></div>`);
  // 赛后拆解用的结构化账本（玩家点名：只要是比赛就要有赛后拆解）
  (m.nodeLog=m.nodeLog||[]).push({g:m.game,t:opt.t,dim:opt.dim,p:Math.round(p*100),ok,d});
  m.node=null;
  cupPlayGame();
}
function cupPlayGame(){
  const m=S.cupMatch;
  const my=cupMyPower(m.kind)+m.swing;
  const p=clamp(1/(1+Math.exp(-(my-m.op)/5.5)),0.05,0.95);
  const win=rnd()<p;
  (m.gameLog=m.gameLog||[]).push({g:m.game,p:Math.round(p*100),win});
  if(win) m.sc[0]++; else m.sc[1]++;
  m.lines.push(`<div>第${m.game}局 ${win?'<span class="w">胜</span>':'<span class="l">负</span>'}</div>`);
  m.game++; m.swing*=0.4;
  cupNextGame();
}
function endCupMatch(){
  const m=S.cupMatch, k=m.kind, c=cupOf(k), C=CUPS[k];
  const won=m.sc[0]>m.sc[1];
  m.done=true;
  // 赛后拆解要读「这场比赛当时」的账（外部测评抓的：原来先推进下一轮 / 清备战 / 解散车队，
  // 玩家再打开拆解——标题变成下一轮、备战显示 0、决赛后车队那几行整个消失）。
  // 结束那一刻先把状态冻一份，cupPostCard 只读它。
  try{
    const soloNow=cupPersonal(S.attrs)+(typeof gearBonus==="function"?gearBonus("操作")*0.4:0);
    const mates=(S.pre&&S.pre.mates)||[];
    m.snap={ round:c.round, prep:c.prep, my:cupMyPower(k), teamName:cupTeamName(),
      hasMates:mates.length>0,
      teamAvg:mates.length?(soloNow+mates.reduce((a,x)=>a+cupPersonal(x),0))/(1+mates.length):soloNow,
      syn:(typeof squadOf==="function")?squadOf("syn"):50, tac:(typeof squadOf==="function")?squadOf("tac"):50,
      mor:(typeof avgTrust==="function")?avgTrust():50, legacyPrep:(S.pre&&S.pre.cupPrep)||0 };
  }catch(e){}
  // 打得越多，被俱乐部看到的次数越多。累积在这里，但兑现要等整届打完——
  // 赛程进行中发邀请会把比赛线整个短路（试过：玩家半决赛就签约走人）。
  S.pre.scoutSeen = (S.pre.scoutSeen||0) + 1;
  if(typeof tacAdd==="function") tacAdd(2, `${C.name}${cupRoundName(k,c.round)}`);   // 成建制比赛每打一轮都涨
  if(won){
    c.wins++;
    addFans(4+c.round*2);
    preLog(`<b>${C.name}</b> ${cupRoundName(c.kind,c.round)}：${m.sc[0]}:${m.sc[1]} 击败 ${m.opp}。`,"good");
    // 这里原本会「每赢一轮就可能来邀请」，但那会把杯赛线整个短路：
    // 玩家在半决赛就签约走人，奖金、成就、决赛全都拿不到，
    // 职业赛胜率也从 66% 掉到 51%（签得太早，属性还没练起来）。
    // 邀请只在整届打完后发——机会数量靠段位和人气那两条线补。
    if(c.round>=C.rounds){
      c.alive=false; cupPayout(k,true);
    } else {
      // 清掉的只是「针对上一个对手」的功课；练出来的东西在 S.pre.cupPrep 里留着
      c.round++; c.prep=0; c.oppRoll=rollOpp();
      c.nextWeek=S.pre.week+C.gap;
      preLog(`晋级 <b>${cupRoundName(k,c.round)}</b>，对手是 <b>${cupOppName(k)}</b>，<b>第 ${c.nextWeek} 周</b>开打。`,"info");
    }
  } else {
    c.alive=false;
    preLog(`<b>${C.name}</b> ${cupRoundName(c.kind,c.round)}：${m.sc[0]}:${m.sc[1]} 不敌 ${m.opp}，止步于此。`,"bad");
    cupPayout(k,false);
  }
  render();
}
function cupPayout(k,champion){
  const c=cupOf(k), C=CUPS[k];
  const reached=champion?C.rounds:c.wins;
  const prize=(C.prize||[])[reached]||0;
  if(prize){ if(typeof addMoney==="function") addMoney("prize",prize); else S.money+=prize;
    preLog(`奖金到账 <b>${prize} 万</b>。`,"good"); }
  addFans(reached*(k==="stream"?6:4));
  if(k==="city") S.pre.cityCup=reached;
  else if(k==="stream") S.pre.streamCup=reached;
  if(k==="show"){
    // 表演赛的收获是曝光：全场镜头都在你身上
    addFans(28);
    S.pre.scoutSeen=(S.pre.scoutSeen||0)+2;
    preLog(champion
      ?`表演赛打服全场。<b>弹幕都在问：这人为什么还不打职业？</b>`
      :`表演赛输了，但没人在乎比分——<b>整个圈子都记住了你的名字。</b>`,"big");
  }
  if(typeof checkAch==="function") checkAch("cup",{kind:k,win:reached});
  // 关键：不用夺冠。走得远，数据被记下来，就有人来问。
  if(k!=="show"&&typeof checkTryoutInvite==="function") checkTryoutInvite(k,reached,champion);
  if(champion&&k!=="show") preLog(`<b>${C.name} 冠军。</b>这个名字开始有人记住了。`,"big");
  if(champion&&k!=="show"&&typeof tacAdd==="function") tacAdd(3,`${C.name}夺冠`);
  // 任务链「从网吧到主舞台」：城市赛进八强 → 主播杯受邀 → 任一冠军
  S.flags=S.flags||{};
  if(k==="city"&&reached>=1) S.flags.chainCity=1;
  if(champion&&k!=="show") S.flags.chainChamp=1;
  if(S.flags.chainCity&&S.flags.chainInv&&S.flags.chainChamp&&!S.flags.chainDone){
    S.flags.chainDone=1;
    if(typeof tacAdd==="function") tacAdd(5,"走完了从网吧到主舞台的路");
    preLog(`<b>从网吧到主舞台</b>——城市赛八强、主播杯请柬、一座冠军，这条路你走完了。<span style="color:var(--ink-3)">俱乐部的青训教练翻你录像时，会从头看到尾。</span>`,"big");
  }
  // 车队的生命周期跟着赛事走：全打完了，路人各回各家，战队栏目重新上锁
  if(!S.career&&S.pre.mates&&S.pre.mates.length&&
     typeof activeCups==="function"&&activeCups().length===0){
    if(S.cupMatch) S.cupMatch.disbandAfter=true;   // 看完拆解点「继续」再散伙——拆解里车队那几行得还在
    else disbandCrew();
  }
  // 结算先挂在这场比赛上，等玩家看完比分点「继续」再弹总结。
  // 之前这里直接 S.cupMatch=null，被淘汰那一场的比分和过程会凭空消失——
  // 玩家只看到一个「止步第几轮」的框，不知道最后那局是怎么输的。
  if(S.cupMatch) S.cupMatch.result={kind:k,name:C.name,reached,rounds:C.rounds,prize,champion};
  else S.cupResult={kind:k,name:C.name,reached,rounds:C.rounds,prize,champion};
}
/* 看完比分，收起比赛卡；该弹总结的时候再弹 */
function cupDismissMatch(){
  const m=S.cupMatch;
  if(m&&m.result) S.cupResult=m.result;
  S.cupMatch=null;
  if(m&&m.disbandAfter&&typeof disbandCrew==="function") disbandCrew();
  render();
}

/* 车队散伙：赛事全部打完（或跨年）就各回各家。
   下一次报名重新抽人、重新取名——车队就是一届一拼的。 */
function disbandCrew(){
  if(!S.pre) return;
  const nm=(S.pre.cupTeam)?`「${escapeHtml(S.pre.cupTeam)}」`:"车队";
  S.pre.mates=null; S.squad=null; S.trust=null; S.pre.cupTeam=null;
  preLog(`${nm}散伙了——比赛打完，路人队友们各回各家。<br>
    <span style="color:var(--ink-3)">下次报名会重新组队、重新取名。练出来的本事（运营/指挥/场次积累）跟着你走。</span>`,"info");
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
    return `<div class="card cup"><h2>${C.name}<em>${cupRoundName(k,c.round)} · 第 ${c.round}/${C.rounds} 轮</em></h2>
      <div class="next">
        <div class="sd"><div class="nm">${cupTeamName()}</div>
          <div class="pw">${powerRank(my)}水平 · ${my.toFixed(0)}</div></div>
        <div class="mid">VS</div>
        <div class="sd"><div class="nm">${cupOppName(k)}</div>
          <div class="pw">${powerRank(op)}水平 · ${op.toFixed(0)}</div></div>
      </div>
      <p class="note" style="margin-top:10px">${wait>0
        ? `还有 <b>${wait} 周</b>开打。这期间可以正常训练，也可以专门备战。`
        : `<b style="color:var(--gold)">就是本周。</b>`}
        ${c.prep>0?`　本轮针对性备战 ${c.prep} 次。`:""}${
          (S.pre.cupPrep||0)>0?`　<span class="hi">累计练了 ${S.pre.cupPrep} 次，战术与配合 +${((S.pre.cupPrep||0)*0.55).toFixed(1)}（不清零）</span>`:""}
        <br>${(()=>{
          // 只给两个裸数字，玩家没法判断那意味着几成把握——
          // 于是小概率翻车会被当成机制坏了。把赢面直接写出来。
          const p=clamp(1/(1+Math.exp(-(my-op)/5.5)),0.05,0.95);
          const bo3=p*p*(3-2*p);            // 三局两胜的整场胜率
          return `单局赢面 <b>${(p*100).toFixed(0)}%</b>　·　这一轮（三局两胜）<b>${(bo3*100).toFixed(0)}%</b>`;
        })()}
        <br>${d>8?"这个级别的对手你已经打过太多了，稳住就行。"
             :d>3?"你占优，但别浪——三局两胜里翻车不是稀奇事。"
             :d>-2?"势均力敌，就看临场那几个决定。"
             :d>-7?"对手比你强，得靠备战和决策去搏。"
             :"实力差得有点多——赢面很小，除非临场赌对。"}</p>
      ${S.pre.mates&&S.pre.mates.length?`<div class="oppinfo">${
        S.pre.mates.map(m=>`<span class="chipx">${typeof avatarOf==="function"?avatarOf(m,18):""} ${m.id} <b>${POSN[m.pos]}</b><i class="ovr">实力 ${
          (typeof ovrOf==="function"?ovrOf(m):avg(DIMS.map(d=>m.r[d]))).toFixed(0)}</i></span>`).join("")}</div>
      <p class="note" style="margin-top:8px">备战就是练队：<b>「本周」里的战队行动</b>（训练赛/复盘/合练/双排）
        喂的默契与战术，直接乘在这支车队的战力上——去「战队」页看拆解。</p>`:""}
      ${wait<=0?`<div class="row"><button class="btn" data-cupgo="${k}">上场 →</button></div>`:""}</div>`;
  }).join("");
}
function cupMatchCard(){
  const m=S.cupMatch; if(!m) return "";
  const C=CUPS[m.kind]||CUPS.city;
  const c=cupOf(m.kind);
  return `<div class="card"><h2>${C.name}<em>${cupRoundName(m.kind,c?c.round:1)} · 三局两胜</em></h2>
    <div class="vs">
      <div class="side"><div class="nm">${cupTeamName()}</div></div>
      <div class="score">${m.sc[0]} : ${m.sc[1]}</div>
      <div class="side"><div class="nm">${m.opp}</div></div>
    </div>
    ${m.node?`<div class="node"><div class="q">${m.node.q}</div><div class="ctx">${m.node.ctx}</div>
      <div class="grid g2">${m.node.a.map((a,i)=>`<button class="opt" data-cupnode="${i}">
        <div class="t">${a.t}</div><div class="d">吃 <b>${a.dim}</b> · ${a.risk>0.8?'高风险高回报':'稳健'}</div>
      </button>`).join("")}</div></div>`:""}
    ${m.lines.length?`<div class="log">${m.lines.slice().reverse().join("")}</div>`:""}
    ${m.done&&!m.pmSeen?`<div class="row"><button class="btn primary" id="cuppm">赛后拆解 →</button></div>`:""}
  </div>
  ${m.done&&m.pmSeen?`${cupPostCard(m)}<div class="row"><button class="btn primary" id="cupdone">继续 →</button></div>`:""}`;
}
/* ---------- 杯赛赛后拆解（玩家点名：只要是比赛就要有赛后拆解）----------
   和职业赛同一套零件（pmRowsHtml / pmNodesHtml），但账按业余赛的公式拆：
   你自己的底子、车队水位、默契 / 战术 / 士气、备战积累，再加临场每个节点的成功率与结果。
   对手在业余赛里只是一个水位数，所以「个人底子」那一行就是你和这个水位的差。 */
function cupPostCard(m){
  if(!m||!m.done) return "";
  const k=m.kind, C=CUPS[k]||CUPS.city, c=cupOf(k);
  const won=m.sc[0]>m.sc[1];
  // 只读开赛时冻的那份账（m.snap）；老存档里没有快照的比赛才退回读当前状态
  const sn=m.snap||null;
  const solo=cupPersonal(S.attrs)+(typeof gearBonus==="function"?gearBonus("操作")*0.4:0);
  const prepRound=sn?sn.prep:((c)?c.prep:0);
  const legacy=prepRound*1.15+(sn?sn.legacyPrep:((S.pre&&S.pre.cupPrep)||0))*0.55;
  const my=sn?sn.my:cupMyPower(k), op=m.op;
  const roundName=cupRoundName(k, sn?sn.round:(c?c.round:1));
  const hasMates=sn?sn.hasMates:!!(S.pre&&S.pre.mates&&S.pre.mates.length);
  const rows=[];
  rows.push({n:"个人底子",v:solo-op,
    fix:solo<op?"你一个人的水平还在这一轮对手之下——排位和训练都在长它。":"你的个人水平压得住这一轮的对手。"});
  if(hasMates){
    const teamAvg=sn?sn.teamAvg:(solo+S.pre.mates.reduce((a,x)=>a+cupPersonal(x),0))/(1+S.pre.mates.length);
    const base=solo*0.72+teamAvg*0.28;
    rows.push({n:"车队水位",v:(teamAvg-solo)*0.28,
      fix:teamAvg<solo?"四个路人队友拖了你的后腿——车队是抽到的，能做的是把默契和战术练上去。":"这支车队的路人不弱，跟得上你。"});
    const syn=sn?sn.syn:((typeof squadOf==="function")?squadOf("syn"):50);
    const tac=sn?sn.tac:((typeof squadOf==="function")?squadOf("tac"):50);
    const mor=sn?sn.mor:((typeof avgTrust==="function")?avgTrust():50);
    rows.push({n:"默契",v:base*((syn-50)/550),fix:syn<50?"五个人还没磨合：「网吧开黑」「战队合练」直接涨。":"配合是加分项。"});
    rows.push({n:"战术",v:base*((tac-50)/650),fix:tac<50?"没什么战术：「看职业录像」「战术复盘」喂它。":"战术在你这边。"});
    rows.push({n:"士气",v:base*((mor-50)/900),fix:mor<50?"车队里有人不服你——多开黑、别甩锅。":"更衣室没问题。"});
  }
  rows.push({n:"备战积累",v:legacy,fix:legacy<1?"这一轮没怎么备战：针对性备战每次 +1.15，练出来的战术与配合 +0.55 且不清零。":"备战的功课兑现在这里了。"});
  rows.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  const diff=my-op;
  const upset=(won&&diff<-1.5)||(!won&&diff>1.5);
  const luck=[];
  (m.gameLog||[]).forEach(g=>{
    if(!g.win&&g.p>=70) luck.push(`第${g.g}局赢面 <b>${g.p}%</b> 还是丢了——${(m.nodeLog||[]).some(n=>n.g===g.g&&!n.ok)?"那一波是你自己没打成，账本上记着。":"这就是十次里还要输一次的那一次。"}`);
    if(g.win&&g.p<=30) luck.push(`第${g.g}局赢面只有 <b>${g.p}%</b> 却拿下了——运气也是实力的一部分，别指望它常来。`);
  });
  // 复盘：这场输在哪、明天点哪个按钮
  const adv=[];
  const fails=(m.nodeLog||[]).filter(n=>!n.ok);
  if(fails.length){
    const cnt={}; fails.forEach(n=>cnt[n.dim]=(cnt[n.dim]||0)+1);
    const worst=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0];
    adv.push({q:`临场决策砸了 ${fails.length} 次（多数吃「${worst}」）`,how:`节点成功率直接看对应属性——「练${worst}」提上去，同样的选择就多几成把握；或者临场挑吃你长项的选项`});
  }
  const bad=n=>{ const r=rows.find(x=>x.n===n); return r&&r.v<=-0.4; };
  if(bad("个人底子")) adv.push({q:"个人水平还没到这一轮的对手",how:"排位、训练、看录像——业余赛的对手一轮比一轮强，早一轮开始练"});
  if(bad("车队水位")||bad("默契")) adv.push({q:"车队配合生疏",how:"「网吧开黑」「战队合练」「队友双排」——默契直接乘在车队战力上"});
  if(bad("战术")) adv.push({q:"没有战术",how:"「看职业录像」「战术复盘」，战术素养还能带进职业队"});
  if(!won&&legacy<1) adv.push({q:"这一轮没备战",how:"杯赛卡上的「针对性备战」每次 +1.15；练出来的配合 +0.55 且跨轮不清零"});
  const li=x=>`<div class="rv-i${x.good?' good':''}"><span class="rq">${x.q}</span><span class="rh">${x.how}</span></div>`;
  const advHtml=won
    ?`<div class="review win"><div class="rv-h">复盘</div><p class="note" style="margin:6px 0 0">这场赢在<b>${rows.filter(r=>r.v>=0.4).slice(0,2).map(r=>r.n).join("、")||"临场"}</b>。下一轮对手更强——别停。</p></div>`
    :(adv.length?`<div class="review"><div class="rv-h">复盘 · 这场输在哪，明天练什么</div><div class="rv-g">${adv.map(li).join("")}</div></div>`
      :`<div class="review"><div class="rv-h">复盘</div><p class="note" style="margin:6px 0 0">各项都没明显吃亏——这场输在概率上。数值只决定每局胜率，不保证结果。</p></div>`);
  return `<div class="card"><h2>赛后拆解 · ${C.name} ${roundName} vs ${m.opp}<em>${won?"胜":"负"} ${m.sc[0]}:${m.sc[1]}</em></h2>
    <div class="pm-head">
      <span>赛事战力 <b>${my.toFixed(1)}</b> vs <b>${op.toFixed(1)}</b></span>
      <span class="pm-diff ${diff>=0?'up':'dn'}">${diff>=0?"+":""}${diff.toFixed(1)}</span>
    </div>
    ${upset?`<div class="pm-upset">${won?"账面上你是劣势——这场是打出来的，节点决策和运气都站在了你这边。":"账面上你占优，还是输了。数值只决定每局胜率——看看临场账本，剩下的是运气。"}</div>`:""}
    ${typeof pmRowsHtml==="function"?pmRowsHtml(rows):""}
    ${typeof pmNodesHtml==="function"?pmNodesHtml(m.nodeLog||[],luck):""}
    ${advHtml}
    <p class="note">这些就是模拟器判胜负时用的数，不是事后编的解释。业余赛里对手只是一个水位，所以没有对位选手的账。</p>
  </div>`;
}
/* ---------- 职业前的战队页：车队真实存在 ---------- */
function preSquadCard(){
  if(!S.pre||!S.pre.mates||!S.pre.mates.length) return "";
  const my=cupMyPower(null);
  const syn=(typeof squadOf==="function")?squadOf("syn"):50;
  const tac=(typeof squadOf==="function")?squadOf("tac"):50;
  const mor=(typeof avgTrust==="function")?avgTrust():50;
  const bar=(v)=>`<div class="track"><div class="fill" style="width:${clamp(v,0,100)}%;background:${
    v>=62?"linear-gradient(90deg,var(--cyan-dim),var(--cyan))":
    v>=42?"linear-gradient(90deg,#6B5A2A,var(--gold))":
          "linear-gradient(90deg,#5A2228,var(--red))"}"></div></div>`;
  return `<div class="card"><h2>车队「${cupTeamName()}」<em>赛事战力 ${my.toFixed(1)}</em></h2>
    <h3 style="font-size:13px;color:var(--ink-3);margin:0 0 8px">五个人</h3>
    <div class="attrs">
      ${[{id:meName(),pos:S.pos,r:S.attrs,me:true}].concat(S.pre.mates).map(p=>{
        const v=cupPersonal(p.me?S.attrs:p);
        return `<div class="at wide"><div class="lb">${POSN[p.pos]}</div>${bar(v)}
          <div class="vn mono"><b>${v.toFixed(0)}</b>${typeof avatarOf==="function"?avatarOf(p,22):""}<span class="pname">${
            p.me?'<b style="color:var(--gold)">你</b>':p.id}</span></div></div>`;
      }).join("")}
    </div>
    <h3 style="font-size:13px;color:var(--ink-3);margin:16px 0 8px">这五个人像不像一支队</h3>
    <div class="attrs">
      <div class="at"><div class="lb">默契</div>${bar(syn)}<div class="vn mono"><b>${Math.round(syn)}</b></div></div>
      <div class="at"><div class="lb">战术</div>${bar(tac)}<div class="vn mono"><b>${Math.round(tac)}</b></div></div>
      <div class="at"><div class="lb">士气</div>${bar(mor)}<div class="vn mono"><b>${Math.round(mor)}</b></div></div>
    </div>
    <p class="note">临时拼的车队，默契战术从很低起步——<b>「本周」里的战队行动</b>
      （训练赛/战术复盘/合练/双排）就是练它们的，练出来的每一分都乘在赛事战力上。
      签约职业队后，车队解散，这套本事跟着你走。</p></div>`;
}
function cupResultCard(){
  const r=S.cupResult; if(!r) return "";
  return `<div class="rankup"><div class="ru-inner" style="max-width:440px">
    <div class="ru-icon">${typeof gicon==="function"?gicon("cup",52):""}</div>
    <div class="ru-eyebrow">${r.name}</div>
    <div class="ru-tier">${r.champion?"冠军":(r.kind?`止步${cupRoundName(r.kind,r.reached+1)}`:`止步第 ${r.reached+1} 轮`)}</div>
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
