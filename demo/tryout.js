/* ================= 试训与签约 =================

   原来这一段是：分数够了 → 弹出几个报价 → 点一下，签完了。
   「试训」两个字只出现在标题里，实际上没有试训，也没有谈判。

   现在拆成四段，每一段都能失败：

     一、邀请   城市赛打得好就有俱乐部来问，不用非得夺冠。
                不同的成绩，来的俱乐部档次不同。
     二、试训   去队里待几天，四个环节分别考操作、运营、指挥、心态，
                体质决定你后面几天还剩多少状态。每个环节都要做选择。
     三、评级   你的表现对上这家俱乐部的期望，得出 A+ / A / B / C / D。
                档次决定给不给合同、给什么合同——首发、替补还是青训。
     四、谈判   年薪、签字费、合同年限、违约金。你可以还价，
                但底气来自试训评级和手上有几家在抢你，还价过头会谈崩。   */

/* ---------- 俱乐部档次 ----------
   expect 是这家俱乐部的期望值，试训得分要对着它比。
   豪门当然更难——同样的表现，在弱队是 A，在豪门可能只有 C。 */
const CLUB_TIERS = {
  top:   { n:"豪门",   expect:62, pay:[180,420], sign:[120,300], years:3, buyout:[900,2200] },
  mid:   { n:"中游",   expect:52, pay:[90,190],  sign:[40,120],  years:2, buyout:[350,900] },
  low:   { n:"弱队",   expect:44, pay:[55,110],  sign:[15,50],   years:2, buyout:[150,400] },
  acad:  { n:"青训队", expect:36, pay:[18,42],   sign:[0,12],    years:2, buyout:[40,120] }
};

/* ---------- 试训的四个环节 ----------
   每个环节考一个维度，三个选项分别偏向不同的能力。
   risk 高的选项成了加得多，砸了扣得也多——
   底子薄的人赌一把是合理的，底子厚的人没必要赌。 */
const TRYOUT_DAYS = [
  { n:"第一天 · 单排考核", dim:"操作",
    ctx:"教练组在你身后架了台机器录屏。他们不看输赢，看你处理每一个细节的方式。",
    a:[{t:"拿出绝活英雄", dim:"操作", risk:1.3, d:"最能打出你的上限，但一旦被针对就很难看"},
       {t:"选版本强势位", dim:"运营", risk:0.8, d:"稳定发挥，不容易出彩"},
       {t:"选团队向英雄", dim:"指挥", risk:1.0, d:"展示视野和判断，个人数据会很难看"}] },
  { n:"第二天 · 训练赛", dim:"运营",
    ctx:"和一队打训练赛。你被安排在对位上，队伍不会为你调整战术。",
    a:[{t:"自己带节奏", dim:"指挥", risk:1.3, d:"打成了就是核心，打崩了就是不合群"},
       {t:"跟着队伍打", dim:"运营", risk:0.7, d:"融入度高，但显不出你"},
       {t:"专注打对位", dim:"操作", risk:1.0, d:"个人数据好看，教练看得出你只顾自己"}] },
  { n:"第三天 · 复盘会", dim:"指挥",
    ctx:"教练把昨天那波团战倒了七遍，然后问你：这一波，你觉得问题在谁身上。",
    a:[{t:"承认失误，给出方案", dim:"心态", risk:0.8, d:"教练最想听到的答案"},
       {t:"坚持自己的判断", dim:"指挥", risk:1.3, d:"说服了就是有主见，没说服就是听不进话"},
       {t:"把责任揽下来", dim:"心态", risk:0.6, d:"稳妥，但显得没有自己的想法"}] },
  { n:"第四天 · 经理面谈", dim:"心态",
    ctx:"经理把合同的样子摆在桌上，但没有推过来。他先问你：你觉得自己值多少。",
    a:[{t:"报一个高数字", dim:"心态", risk:1.4, d:"有底气是加分项，没底气就是不自量力"},
       {t:"说先看表现", dim:"运营", risk:0.7, d:"稳，但会被当成不自信"},
       {t:"谈规划不谈钱", dim:"指挥", risk:1.0, d:"聊你想成为什么样的选手"}] }
];

/* ---------- 一、邀请 ---------- */
/* 你现在的个人水平，和试训评分同一把尺子 */
function tryoutSkill(){
  return S.attrs.操作*0.34 + S.attrs.运营*0.24 + S.attrs.指挥*0.20
       + S.attrs.心态*0.14 + S.attrs.体质*0.08;
}
/* 城市赛/主播杯打完之后叫一次：打得好就有人来问。
   关键点是**不用夺冠**——走得远，数据被记下来，就够了。 */
function checkTryoutInvite(kind, reached, champion){
  const C = (typeof CUPS !== "undefined") ? CUPS[kind] : null;
  if(!C) return;
  const rounds = C.rounds;
  // 走到一半以上就进视野；夺冠自然更受关注
  const depth = reached / rounds;
  if(depth < 0.5 && !champion) return;
  let tier = champion ? "mid" : depth >= 0.75 ? "low" : "acad";
  // 主播杯自带流量，俱乐部更看重
  if(kind === "stream" && tier !== "top") tier = tier === "acad" ? "low" : "mid";
  tier = fitTier(tier);
  addInvite(tier, `${C.name}走到第 ${reached+ (champion?0:1)} 轮${champion?"并夺冠":""}`);
}
/* 段位或人气到了也会有人来问——不是只有比赛这一条路 */
function checkRankInvite(){
  const P = S.pre; if(!P || P.invite) return;
  if(P.rankInvited) return;
  if(P.rank >= RANKS[4].at){          // 宗师
    P.rankInvited = true;
    addInvite(fitTier("low"), `排位打到${rankFull(P.rank)}`);
  }
}
/* 成绩决定「有没有人看你」，个人水平决定「谁来看你」。
   两头都要卡：水平不够，成绩再好也只有青训队打电话；
   水平明显超出，档次低的队自己就知道留不住你，会有更好的队来。 */
const TIER_ORDER = ["acad", "low", "mid", "top"];
function fitTier(tier){
  const me = tryoutSkill();
  let i = TIER_ORDER.indexOf(tier);
  // 往上：明显够得着更高一档就往上走
  while(i < TIER_ORDER.length-1 && me >= CLUB_TIERS[TIER_ORDER[i+1]].expect + 6) i++;
  // 往下：连这一档的门槛都差得远，就只剩青训队
  while(i > 0 && me < CLUB_TIERS[TIER_ORDER[i]].expect - 10) i--;
  return TIER_ORDER[i];
}
function addInvite(tier, reason){
  const P = S.pre; if(!P) return;
  if(P.invite && P.invite.pending) return;      // 一次只处理一个，别堆
  const T = CLUB_TIERS[tier];
  const team = pickClub(tier);
  if(!team) return;
  P.invite = { tier, team, reason, pending:true, week:P.week, expect:T.expect };
  preLog(`<b>${team}</b> 看了你的比赛录像——${reason}。<b>他们邀请你去队里试训。</b>`, "big");
  if(typeof render === "function") render();
}
/* 按档次挑一家真实存在的俱乐部 */
function pickClub(tier){
  try{
    const lg = S.world && S.world.LPL ? S.world.LPL : null;
    if(!lg || !lg.length) return null;
    const rk = lg.map(t=>({n:t.name, p:power(t)})).sort((a,b)=>b.p-a.p);
    const seg = { top:[0,3], mid:[4,10], low:[11,rk.length-1], acad:[11,rk.length-1] }[tier];
    const lo = Math.min(seg[0], rk.length-1), hi = Math.min(seg[1], rk.length-1);
    const pick = rk[lo + Math.floor(rnd()*(hi-lo+1))];
    return tier === "acad" ? pick.n + " 青训队" : pick.n;
  }catch(e){ return null; }
}
/* 邀请卡：接受就进试训，拒绝就继续练 */
function inviteCard(){
  const P = S.pre, iv = P && P.invite;
  if(!iv || !iv.pending) return "";
  const T = CLUB_TIERS[iv.tier];
  const me = tryoutSkill(), gap = me - iv.expect;
  return `<div class="card savecont"><h2>试训邀请<em>${T.n}</em></h2>
    <h3>${typeof teamLogo==="function"?teamLogo(iv.team,22):""} ${iv.team}</h3>
    <p class="note" style="margin:0 0 10px">因为${iv.reason}。<br>
      去队里待四天，教练组会从操作、运营、指挥、心态四个方面评估你。
      <b>试训不是走过场——评级不够就没有合同</b>，评级高低也决定给你什么档次的合同。</p>
    <div class="ver">
      他们的期望值 <b>${iv.expect}</b>　·　你现在 <b>${me.toFixed(0)}</b><br>
      <span style="color:${gap>=4?'var(--cyan)':gap>=-4?'var(--gold)':'var(--red)'}">${
        gap>=8 ? "以你现在的水平，这次试训应该很轻松。"
        : gap>=2 ? "你够得上他们的要求，稳住就行。"
        : gap>=-4 ? "刚好在门槛上——四天里每个选择都算数。"
        : gap>=-10 ? "他们的期望比你现在高不少，得靠临场发挥。"
        : "说实话，这个档次的队伍现在还不适合你。去了大概率是陪跑。"}</span></div>
    <div class="row">
      <button class="btn" id="ivgo">去试训 →</button>
      <button class="btn ghost" id="ivno">先不去，继续练</button>
    </div>
    <p class="note">拒绝不会关上门，但这家俱乐部今年不会再来第二次。</p></div>`;
}

/* ---------- 二、试训过程 ---------- */
function startTryout(tier, team, expect){
  S.tryout = { tier, team, expect, day:0, score:0, lines:[], fat:0, done:false };
  render();
}
function tryoutDay(){ return TRYOUT_DAYS[S.tryout.day]; }
/* 体质差的人，后面几天会明显掉状态——这是体质在这里的意义 */
function tryoutFatiguePenalty(){
  const t = S.tryout;
  const stamina = S.attrs.体质;
  return t.day * Math.max(0, (52 - stamina)) * 0.055;
}
function resolveTryoutDay(i){
  const t = S.tryout, D = TRYOUT_DAYS[t.day], opt = D.a[i];
  const v = S.attrs[opt.dim] - tryoutFatiguePenalty();
  const p = clamp(0.22 + (v/100)*0.62, 0.08, 0.92);
  const ok = rnd() < p;
  // 成败对称。原来失败只扣 0.85 倍，四个环节累下来整体偏正，
  // 结果刚够门槛的人也有三成概率拿 A+——评级就没意义了。
  const delta = (ok ? 1 : -1) * opt.risk * 4.2;
  t.score += delta;
  t.lines.push(`<div><span class="hi">${D.n.split(" · ")[1]}</span> ${opt.t} — ${
    ok ? '<span class="w">教练点了头</span>' : '<span class="l">没打动他们</span>'
  }　<b style="color:${delta>0?'var(--cyan)':'var(--red)'}">${delta>0?"+":""}${delta.toFixed(1)}</b></div>`);
  t.day++;
  if(t.day >= TRYOUT_DAYS.length) endTryout();
  else render();
}
/* 最终评级：四天的表现 + 你的底子，一起对上这家的期望 */
function tryoutGrade(){
  const t = S.tryout;
  const total = tryoutSkill() + t.score;
  const d = total - t.expect;
  // 贴着期望值就是 B——「能用，但不到能托付的程度」。
  // A+ 要明显高出一截，否则档次分不开。
  if(d >= 16) return { g:"A+", d, tier:"first" };
  if(d >= 8)  return { g:"A",  d, tier:"start" };
  if(d >= 0)  return { g:"B",  d, tier:"sub" };
  if(d >= -9) return { g:"C",  d, tier:"acad" };
  return { g:"D", d, tier:null };
}
function endTryout(){
  const t = S.tryout;
  t.done = true;
  t.result = tryoutGrade();
  addFat(18);
  // 一家只给一次机会。不消耗掉的话，评了 D 可以回头再试一次，
  // 反复刷到 A+ 为止——那评级就白设计了。
  consumeOffer(t.team);
  if(typeof checkAch === "function") checkAch("tryout", { grade:t.result.g });
  render();
}
function tryoutCard(){
  const t = S.tryout; if(!t) return "";
  const T = CLUB_TIERS[t.tier];
  if(t.done){
    const r = t.result;
    return `<div class="card"><h2>试训结束<em>${t.team} · ${T.n}</em></h2>
      <div class="ver" style="text-align:center">
        <div style="font-size:44px;font-weight:700;color:${
          r.g==="D"?"var(--red)":r.g[0]==="A"?"var(--gold-hi)":"var(--cyan)"}">${r.g}</div>
        <div style="margin-top:6px">${
          r.g==="A+" ? "教练组开会时用了「捡到了」这个说法。"
          : r.g==="A" ? "四天下来，他们对你没有保留意见。"
          : r.g==="B" ? "他们觉得你能用，但还不到能托付的程度。"
          : r.g==="C" ? "差了一口气。要么再练一年，要么从青训做起。"
          : "教练组没有留你的意思。"}</div>
      </div>
      ${t.lines.length?`<div class="log">${t.lines.slice().reverse().join("")}</div>`:""}
      <div class="row"><button class="btn" id="tryoutdone">${
        r.tier ? "谈合同 →" : "接受结果"}</button></div></div>`;
  }
  const D = tryoutDay();
  const pen = tryoutFatiguePenalty();
  return `<div class="card"><h2>${D.n}<em>${t.team} · 第 ${t.day+1}/4 天</em></h2>
    <p class="note" style="margin:0 0 12px">${D.ctx}</p>
    ${pen>1?`<p class="note" style="color:var(--red)">连着几天下来你已经有点撑不住了，
      发挥打了折扣（−${pen.toFixed(1)}）。<b>体质在这种时候才看得出来。</b></p>`:""}
    <div class="grid g2">${D.a.map((a,i)=>`<button class="opt" data-tryout="${i}">
      <div class="t">${a.t}</div>
      <div class="d">吃 <b>${a.dim}</b> · ${a.risk>=1.3?"高风险高回报":a.risk>=1?"中等":"稳健"}<br>${a.d}</div>
    </button>`).join("")}</div>
    ${t.lines.length?`<div class="log">${t.lines.slice().reverse().join("")}</div>`:""}</div>`;
}

/* ---------- 三、合同报价 ---------- */
/* 档次决定基准，评级在基准上浮动 */
const DEAL_TIERS = {
  first: { n:"核心首发", mul:1.00, k:"start" },
  start: { n:"首发",     mul:0.80, k:"start" },
  sub:   { n:"替补",     mul:0.55, k:"sub"   },
  acad:  { n:"青训合同", mul:0.30, k:"sub"   }
};
function makeDeal(){
  const t = S.tryout, r = t.result, T = CLUB_TIERS[t.tier], D = DEAL_TIERS[r.tier];
  const lerp=(a,b,x)=>a+(b-a)*clamp(x,0,1);
  const q = clamp((r.d + 10) / 26, 0, 1);          // 评级在这家队里的相对位置
  S.deal = {
    team:t.team, clubTier:t.tier, dealTier:r.tier, grade:r.g, kind:D.k,
    salary: Math.round(lerp(T.pay[0], T.pay[1], q) * D.mul),
    sign:   Math.round(lerp(T.sign[0], T.sign[1], q) * D.mul),
    years:  T.years,
    buyout: Math.round(lerp(T.buyout[0], T.buyout[1], q) * D.mul),
    asks: 0, leverage: dealLeverage(r.g), dead:false, signed:false, log:[]
  };
  S.tryout = null;
  render();
}
/* 还价的底气：试训评级 + 人气 + 段位。没有底气就别开口。 */
function dealLeverage(grade){
  const g = { "A+":26, "A":18, "B":10, "C":4 }[grade] || 0;
  return clamp(g + Math.min(S.fame,300)*0.045 + (S.pre.rank)*0.12, 5, 62);
}
/* 四个可以谈的方向。每个都有代价——不是免费加钱。 */
const DEAL_ASKS = [
  { k:"pay",    n:"要求加薪",   d:"年薪 +25%",
    hint:"最直接，也最容易谈崩", cost:16,
    run:d=>{ d.salary = Math.round(d.salary*1.25); } },
  { k:"sign",   n:"要求签字费", d:"签字费翻倍",
    hint:"一次性到手，俱乐部相对好接受", cost:10,
    run:d=>{ d.sign = Math.max(8, Math.round(d.sign*2)); } },
  { k:"years",  n:"缩短合同",   d:"年限 −1，更早成为自由身",
    hint:"打得好的话，早一年重签就是涨薪", cost:13,
    run:d=>{ d.years = Math.max(1, d.years-1); } },
  { k:"buyout", n:"压低违约金", d:"违约金 −40%",
    hint:"以后想走，别的队更容易买走你", cost:14,
    run:d=>{ d.buyout = Math.round(d.buyout*0.6); } }
];
function askDeal(k){
  const d = S.deal; if(!d || d.dead || d.signed) return;
  const A = DEAL_ASKS.find(x=>x.k===k); if(!A) return;
  d.asks++;
  // 提得越多越难：第一次好说，第三次就是得寸进尺
  const p = clamp((d.leverage - A.cost - (d.asks-1)*14) / 40 + 0.5, 0.06, 0.93);
  const ok = rnd() < p;
  if(ok){
    A.run(d);
    d.log.push(`<div><span class="hi">${A.n}</span> — <span class="w">对方同意了</span></div>`);
  } else {
    // 谈崩不是立刻失败，先降条件；提得太过分才会真的走人
    const blow = rnd() < clamp((d.asks-1)*0.24 + (A.cost-d.leverage)/70, 0.04, 0.55);
    if(blow){
      d.dead = true;
      d.log.push(`<div><span class="hi">${A.n}</span> — <span class="l">对方收回了报价</span></div>`);
      preLog(`<b>${d.team}</b> 觉得你要的太多，把合同收回去了。`, "bad");
    } else {
      d.salary = Math.round(d.salary*0.93);
      d.log.push(`<div><span class="hi">${A.n}</span> — <span class="l">被拒绝，对方把年薪压了一点</span></div>`);
    }
  }
  render();
}
function dealCard(){
  const d = S.deal; if(!d) return "";
  const D = DEAL_TIERS[d.dealTier], T = CLUB_TIERS[d.clubTier];
  if(d.dead){
    return `<div class="card"><h2>谈判破裂<em>${d.team}</em></h2>
      <p class="note">你把价格要到了对方不能接受的位置。这家今年不会再谈了。</p>
      ${d.log.length?`<div class="log">${d.log.slice().reverse().join("")}</div>`:""}
      <div class="row"><button class="btn ghost" id="dealend">继续练下去 →</button></div></div>`;
  }
  const lev = d.leverage;
  return `<div class="card"><h2>合同谈判<em>${d.team} · ${T.n}</em></h2>
    <h3>${D.n}<span class="tag g">试训 ${d.grade}</span></h3>
    <div class="grid g2" style="margin:12px 0">
      <div class="ver"><div class="k">年薪</div><div class="v mono" style="font-size:22px;color:var(--gold-hi)">${d.salary}<small> 万/赛段</small></div></div>
      <div class="ver"><div class="k">签字费</div><div class="v mono" style="font-size:22px">${d.sign}<small> 万</small></div></div>
      <div class="ver"><div class="k">合同年限</div><div class="v mono" style="font-size:22px">${d.years}<small> 赛段</small></div></div>
      <div class="ver"><div class="k">违约金</div><div class="v mono" style="font-size:22px">${d.buyout}<small> 万</small></div></div>
    </div>
    <p class="note">你的底气 <b>${lev.toFixed(0)}</b>——来自试训评级、人气和段位。
      已经提了 <b>${d.asks}</b> 次要求，<b>提得越多越容易谈崩</b>。</p>
    <div class="grid g2">${DEAL_ASKS.map(a=>{
      const p = clamp((lev - a.cost - d.asks*14)/40 + 0.5, 0.06, 0.93);
      return `<button class="act" data-ask="${a.k}">
        <div class="t">${a.n} <span class="tag">成功率 ${(p*100).toFixed(0)}%</span></div>
        <div class="d">${a.d}<br><span style="color:var(--ink-3)">${a.hint}</span></div></button>`;
    }).join("")}</div>
    ${d.log.length?`<div class="log">${d.log.slice().reverse().join("")}</div>`:""}
    <div class="row">
      <button class="btn" id="dealsign">就这么签 →</button>
      <button class="btn ghost" id="dealno">不签，再练一年</button>
    </div>
    <p class="note">签字费当场到账，年薪每个赛段结算一次。违约金越高，以后别队越难把你买走。<br>
      <b>不签也是一条路</b>——青训合同签下去就是两个赛段的板凳，
      再练一年换一家更好的队未必更亏。但这家今年不会再来了。</p>
  </div>`;
}


/* 主动拒签。评级过了不等于必须签——给的是青训合同的话，
   再练一年换一家更好的队是完全合理的打法，不该被系统堵死。
   代价由 dropDeal 里的 consumeOffer 承担：这家今年就没了。 */
function declineDeal(){
  const d = S.deal; if(!d) return;
  const D = DEAL_TIERS[d.dealTier];
  preLog(`拒绝了 <b>${d.team}</b> 的${D.n}（年薪 ${d.salary} 万）。
    你觉得自己值更多——那就得在剩下的时间里证明它。`, "info");
  dropDeal();
}

/* ---------- 四、签字 ---------- */
/* 谈完了才真正进队。签字费当场到账，其余条款写进合同，
   之后每个赛段结算薪资、到期续约、转会时看违约金。 */
function signDeal(){
  const d = S.deal; if(!d || d.dead || d.signed) return;
  d.signed = true;
  const P = S.pre;
  if(!P.world)    P.world = cloneWorld();
  if(!P.baseline) P.baseline = leagueBaseline(P.world);
  // 青训队的名字带后缀，签的其实是俱乐部本身
  let teamName = d.team.replace(/ 青训队$/, "");
  // 邀请是从 S.world 里挑的队名，签约时用的是新克隆的 world。
  // 正常情况下名字一致，但万一对不上（老存档、数据换版），
  // 不能让它崩在签约这一步——退回到一支中游队。
  if(!P.world.LPL.some(t=>t.name===teamName)){
    const rk=P.world.LPL.map(t=>({n:t.name,p:power(t)})).sort((a,b)=>b.p-a.p);
    teamName=rk[Math.min(6,rk.length-1)].n;
  }
  const D = DEAL_TIERS[d.dealTier];
  P.offers = [{ k:d.kind, team:teamName, t:D.n, d:"", note:"", league:"LPL" }];
  S.money += d.sign;
  if(d.sign) preLog(`签字费 <b>${d.sign} 万</b>到账。`, "good");
  S.pendingContract = {
    years:d.years, left:d.years, salary:d.salary, sign:d.sign,
    buyout:d.buyout, team:teamName, tier:d.dealTier, grade:d.grade,
    clubTier:d.clubTier
  };
  preLog(`和 <b>${teamName}</b> 签下 <b>${D.n}</b> 合同：
    年薪 ${d.salary} 万 · ${d.years} 个赛段 · 违约金 ${d.buyout} 万。`, "big");
  S.deal = null;
  acceptOffer(0);
}
/* 把这家从今年的可选名单里划掉 */
function consumeOffer(team){
  const P = S.pre; if(!P) return;
  if(P.offers) P.offers.forEach(o=>{ if(o.team === team || team.indexOf(o.team)===0) o.used = true; });
  if(P.invite && P.invite.team === team) P.invite.pending = false;
}
/* 试训没过，或者谈崩了：这家今年到此为止 */
function dropDeal(){
  const team = (S.deal && S.deal.team) || (S.tryout && S.tryout.team);
  if(team) consumeOffer(team);
  S.deal = null; S.tryout = null;
  const P = S.pre;
  // 年末的窗口里，如果所有队都试过了，这一年就到此为止
  if(P && S.step === "offer" && P.offers && P.offers.every(o=>o.used)){
    preLog(`转会窗口关了。<b>今年没有一家给出合同。</b>`, "bad");
    preNextYear();
    return;
  }
  render();
}
/* 试训结束按「谈合同」：没评上就直接结束 */
function afterTryout(){
  const t = S.tryout;
  if(!t) return;
  if(!t.result || !t.result.tier){ dropDeal(); return; }
  makeDeal();
}
