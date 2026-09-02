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
/* 2026-08-31 重锚（玩家拍板）：
   · expect 全档 +6——钻石实力（综合 ~48）在二队试训最多 B，评级不再白给。
   · pay 对齐限薪令后的现实：青训 5–30 万/年，豪门明星 200–800 万/年。
     注意 pay 是「每赛段」发的（一年春夏两次），所以表里的数是年表 ÷2。
     首测踩过这个坑：按年表直填，钱中位直接飙到 2356 万。 */
/* 统一标尺（2026-09-02）：expect 对齐各档的真实水位——
   青训 59≈LDL 首发 / 弱队 65≈王者(LPL平均) / 中游 71≈国服前100 / 豪门 79≈国服前10。
   宗师(60)的人在二队试训评 B，履历通道进来的（~55）评 C 拿青训约——各得其所。 */
const CLUB_TIERS = {
  top:   { n:"豪门",   expect:79, pay:[100,400], sign:[60,150], years:3, buyout:[900,2200] },
  mid:   { n:"中游",   expect:71, pay:[45,130],  sign:[20,60],  years:2, buyout:[350,900] },
  low:   { n:"弱队",   expect:65, pay:[20,60],   sign:[8,25],   years:2, buyout:[150,400] },
  acad:  { n:"二队/青训", expect:59, pay:[3,15],    sign:[0,4],    years:2, buyout:[40,120] }
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
/* 各档俱乐部的门槛，和你现在的位置——玩家点名（2026-09-02）：
   「进俱乐部看不到段位门槛和我的当前实力」。两把尺子都摆出来：
   实力期望（试训评级用的综合）和段位底线（试训邀请的准入）。 */
function tierCard(){
  const me = tryoutSkill();
  const rk = (S.pre && typeof S.pre.rank==="number") ? S.pre.rank : null;
  const rows = TIER_ORDER.slice().reverse().map(k=>{
    const T = CLUB_TIERS[k], need = TIER_RANK[k];
    const okS = me >= T.expect, okR = rk===null || rk >= need;
    const gap = T.expect - me;
    return `<tr><td><b>${T.n}</b></td>
      <td class="n mono">${T.expect}</td>
      <td class="n">${typeof rankName==="function"?rankName(need):need}</td>
      <td class="n" style="color:${okS?'var(--cyan)':gap<=6?'var(--gold)':'var(--red)'}">${okS?"够了":`差 ${gap.toFixed(0)}`}</td>
      <td class="n" style="color:${okR?'var(--cyan)':'var(--red)'}">${rk===null?"—":okR?"够了":"不够"}</td></tr>`;
  }).join("");
  return `<div class="card"><h2>俱乐部门槛<em>你的综合 <b>${me.toFixed(0)}</b>${rk!==null&&typeof rankFull==="function"?` · ${rankFull(rk)}`:""}</em></h2>
    <div class="tw"><table><thead><tr><th>档次</th><th class="n">实力期望</th><th class="n">段位底线</th><th class="n">实力</th><th class="n">段位</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="note">综合是俱乐部口径：操作 .34 · 运营 .24 · 指挥 .20 · 心态 .14 · 体质 .08。
      实力期望决定试训评级（够了是 A/B，差 10 以上基本 C/D）；段位底线是发邀请的准入，
      段位不够可以用比赛履历（城市争霸赛 / 主播杯四强）敲门。签约后段位只是名片，看的是比赛。</p></div>`;
}
/* 城市赛/主播杯打完之后叫一次：打得好就有人来问。
   关键点是**不用夺冠**——走得远，数据被记下来，就够了。 */
function checkTryoutInvite(kind, reached, champion){
  const C = (typeof CUPS !== "undefined") ? CUPS[kind] : null;
  if(!C || !S.pre) return;
  const rounds = C.rounds;
  const depth = reached / rounds;
  // 被看到的概率随「打过多少场」累积。
  // 首轮就出局也不是零，只是很低；打得多、走得深、拿了冠军，概率才上来。
  const seen = Math.min(S.pre.scoutSeen || 0, 10);
  const p = clamp(0.10 + depth*0.50 + (champion?0.30:0) + seen*0.045, 0.05, 0.96);
  if(rnd() >= p) return;

  // 主播杯是邀请制、全圈看着打——夺冠的邀请直接是豪门档
  //（能不能签下来另说：豪门期望 79，评级说话）
  let tier = champion ? (kind==="stream" ? "top" : "mid") : depth >= 0.75 ? "low" : "acad";
  if(kind === "stream" && tier !== "top") tier = tier === "acad" ? "low" : "mid";
  const why = `${C.name}${champion ? "夺冠" : `走到第 ${reached+1} 轮`}`;
  // 兑现时机：整届打完之后。这会儿可能还有别的赛事在跑，那就先排队。
  queueInvite(fitTier(tier), why, pickForeignScout(champion));
}
/* 外赛区一线也翻中国的草根赛场（玩家定的边界：外赛区次级联赛不跨国发邀请，
   但一线队的教练组真的会来看争霸赛/主播杯）。越缺人的赛区来得越勤——
   LCK 不缺天才，VCS/PCS/LJL 缺的就是便宜能打的年轻人。 */
function pickForeignScout(champion){
  if(rnd() >= (champion ? 0.20 : 0.10)) return null;
  const W={VCS:5,PCS:4,LJL:3,LCO:3,CBLOL:2,LLA:2,TCL:2,LEC:1.2,LCS:1.2,LCK:0.6};
  const pool=Object.keys(W).filter(k=>S.world&&S.world[k]&&S.world[k].length);
  if(!pool.length) return null;
  let sum=0; pool.forEach(k=>sum+=W[k]);
  let x=rnd()*sum;
  for(const k of pool){ x-=W[k]; if(x<=0) return k; }
  return pool[pool.length-1];
}
/* 发不出去就排队，等条件满足（赛程打完 / 冷却过了）再发。
   之前是直接丢弃，等于「打完城市赛那次机会白攒了」。 */
function queueInvite(tier, reason, lg){
  const P = S.pre; if(!P) return;
  if(canInvite(tier)){ addInvite(tier, reason, lg); return; }
  P.inviteQ = P.inviteQ || [];
  if(P.inviteQ.length < 3) P.inviteQ.push({tier, reason, lg});
}
function flushInviteQ(){
  const P = S.pre; if(!P || !P.inviteQ || !P.inviteQ.length) return;
  if(!canInvite(P.inviteQ[0].tier)) return;
  const q = P.inviteQ.shift();
  // 排队期间你的水平可能变了，档次按现在重新判一次
  addInvite(fitTier(q.tier), q.reason, q.lg);
}
/* 段位或人气到了也会有人来问——不是只有比赛这一条路 */
function checkRankInvite(){
  const P = S.pre; if(!P) return;
  if(typeof flushInviteQ === "function") flushInviteQ();   // 排队的先发
  P.rankInvited = P.rankInvited || {};
  // 每个大段位各算一次机会——上分这条路不该只在最后才兑现
  // 门槛重锚后从宗师起步：宗师→青训、王者→弱队、国服前100→中游、国服前10→豪门
  for(const [i, tier] of [[4,"acad"],[5,"low"],[6,"mid"],[7,"top"]]){
    if(RANKS[i] && P.rank >= RANKS[i].at && !P.rankInvited[i]){
      const t = fitTier(tier);
      if(!canInvite(t)) continue;
      P.rankInvited[i] = 1;
      addInvite(t, `排位打到${RANKS[i].n}`);
      return;
    }
  }
  if(typeof checkFanInvite === "function") checkFanInvite();
}
/* 「有没有人找你」和「能不能通过」是两件事。

   名气、成绩、段位决定谁来找你——一个百万粉丝的大主播，
   俱乐部当然愿意见一面，哪怕他水平一般。能不能签下来，
   是试训那四天的事，不该在发邀请这一步就替他判死刑。

   原来 fitTier 会因为水平不够把档次一路压到青训队，于是
   「大主播被豪门叫去试训、然后没通过」这个故事根本发生不了。
   现在只在差得极远时才降档（比该档期望低 22 以上），
   其余交给试训自己去筛。 */
const TIER_ORDER = ["acad", "low", "mid", "top"];
function fitTier(tier){
  const me = tryoutSkill();
  let i = TIER_ORDER.indexOf(tier);
  // 往上：明显够得着更高一档，更好的队会来抢
  while(i < TIER_ORDER.length-1 && me >= CLUB_TIERS[TIER_ORDER[i+1]].expect + 6) i++;
  // 往下：只有差到离谱才降档；「够不着但被叫去试试」是允许的
  while(i > 0 && me < CLUB_TIERS[TIER_ORDER[i]].expect - 22) i--;
  // 再被天花板封顶：曝光是硬的（没人看见过你，谁也不会来）；
  // 段位和履历取更宽的那个——天梯不够但比赛打出来了，照样有人看。
  const merit = Math.max(TIER_ORDER.indexOf(rankCap()),
                         TIER_ORDER.indexOf(resumeCap()));
  const cap = Math.min(TIER_ORDER.indexOf(exposureCap()), merit);
  if(i > cap) i = Math.max(cap, 0);
  return TIER_ORDER[Math.max(i,0)];
}
/* 曝光度：决定「最高能被哪一档俱乐部看到」。

   段位说明你值不值得看，曝光说明谁看得到你——这是两件事。
   一线队不会因为天梯排名去签一个没有任何比赛数据、没有任何曝光的人，
   那是青训教练干的活。原来排位打到王者就直接触发豪门邀请，
   于是「没直播、没打争霸赛，IG 来找我试训」这种事就会发生。

   能被看见的途径：打过的比赛（有数据）、杯赛走得多深、名气。 */
function exposureScore(){
  const P = S.pre; if(!P) return 0;
  return Math.min(S.fans, 420) * 0.50          // 名气
       + (P.cityCup || 0) * 18                 // 城市赛走到第几轮
       + (P.streamCup || 0) * 24               // 主播杯（邀请制，更受关注）
       + Math.min(P.scoutSeen || 0, 12) * 4;   // 打过多少场正式比赛
}
function exposureCap(){
  const v = exposureScore();
  if(v >= 190) return "top";
  if(v >= 110) return "mid";
  if(v >= 45)  return "low";
  return "acad";
}

/* 履历通道：比赛打出来的资格，段位不够也作数。
   走到四强 → 青训教练会看；单项夺冠 → 中游来问；双料冠军 → 豪门也翻你的录像。
   （原阈值写的 6/5，而 cityCup/streamCup 上限只有 4/3——履历通道的
    中游以上在数学上永远够不着，玩家点的「入口太极端」一半就极端在这。） */
function resumeCap(){
  const P = S.pre; if(!P) return "none";
  const cc=(P.cityCup||0), sc=(P.streamCup||0);
  if(cc >= 4 && sc >= 3) return "top";      // 双料冠军：圈子没法装看不见
  if(cc >= 4 || sc >= 3) return "mid";
  if(cc >= 3 || sc >= 2) return "acad";
  return "none";
}
/* 但门是有槛的：天梯不到宗师、比赛里也没打出名堂，没有俱乐部会浪费四天看你。
   这是「有没有资格被看」的底线，和「能不能通过」无关。 */
function inviteFloorOk(){
  const P = S.pre; if(!P) return false;
  const need = (typeof RANKS !== "undefined" && RANKS[4]) ? RANKS[4].at : 60;   // 宗师
  return P.rank >= need || resumeCap() !== "none";
}
/* 邀请节流。
   实测过：整局平均只有 0.98 次试训机会，59/60 的局正好一次——
   意味着试训一失手，这一年就白费了。而试训本身是带运气的，
   「一次定生死」不是难度，是惩罚。
   现在放开触发点、加两周冷却，目标是整局 2–4 次机会：
   失手一次还能再来，但也不至于多到没有分量。 */
/* 什么时候会有人来找你——看的是你，不是日历。

   原来这里是一张写死的周表（青训第 9 周、豪门第 15 周）。那等于告诉玩家
   「几月几号之前你再强也没人要」，而现实里恰恰相反：转会窗口是给一线队
   队员用的，一个还没打上职业的人，任何时候都可能被俱乐部私信。

   所以周表整个删掉，换成两把尺子——玩家自己的两项，和队伍的档次一一对应：
     · 段位：你值不值得看。青训教练在天梯上就能翻到你，豪门要国服前列。
     · 曝光：谁看得到你（exposureScore：人气 + 杯赛走多深 + 打过多少场）。
   两把尺子各自算出「最高能被哪一档看到」，取更严的那个。
   于是「弱队早、强队晚」自然发生，而不是靠日期硬卡。 */
/* 2026-08-31 重锚：一般宗师才摸到职业门槛（二队），一线至少王者，
   豪门要国服前列——玩家原话「已经无法用段位来衡量实力了，都是用比赛衡量的」。
   段位是底线，比赛履历是尺子：段位不够可走 resumeCap 的履历通道。 */
const TIER_RANK = { acad:60, low:74, mid:86, top:95 };   // 宗师 / 王者 / 国服前100 / 国服前10
function rankCap(){
  const r = (S.pre && S.pre.rank) || 0;
  let t = TIER_ORDER[0];
  TIER_ORDER.forEach(k => { if(r >= TIER_RANK[k]) t = k; });
  return t;
}
function canInvite(tierWanted){
  const P = S.pre; if(!P) return false;
  if(!inviteFloorOk()) return false;          // 宗师不到、比赛也没打出名堂，没人会来
  if(P.invite && P.invite.pending) return false;        // 手上还有没处理的
  if(P.inviteCd && P.week < P.inviteCd) return false;   // 冷却中
  // 正在打的比赛优先。玩家在城市争霸赛/主播杯的赛程里时不发邀请——
  // 一边打着比赛一边被叫去试训，是让人两头都做不好的假选择。
  // 邀请不会因此丢失：发不出去的会进 inviteQ，打完再补发。
  if(typeof activeCups === "function" && activeCups().length) return false;
  return true;
}
/* 人气到了也有人来问——直播这条路本来就是设计里的一条路 */
function checkFanInvite(){
  const P = S.pre; if(!P) return;
  P.fanInvited = P.fanInvited || {};
  for(const [at, tier] of [[55,"acad"],[110,"low"],[190,"mid"]]){
    if(S.fans >= at && !P.fanInvited[at]){
      const t = fitTier(tier);
      if(!canInvite(t)) return;
      P.fanInvited[at] = 1;
      addInvite(t, `直播间的人气涨到了${fanTier()}`);
      return;
    }
  }
}
function addInvite(tier, reason, lg){
  const P = S.pre; if(!P) return;
  if(!canInvite(tier)) return;
  // 外赛区没有跨国的次级邀请：来的必是一线队，档次至少从「弱队」起
  if(lg && lg !== "LPL" && tier === "acad") tier = "low";
  const T = CLUB_TIERS[tier];
  const team = pickClub(tier, lg || undefined);
  if(!team) return;
  P.invite = { tier, team, league: lg || null, reason, pending:true, week:P.week, expect:T.expect };
  P.inviteCd = P.week + 2;
  P.inviteN = (P.inviteN || 0) + 1;
  preLog(`<b>${team}</b>${lg&&lg!=="LPL"?`（${lg} 赛区）`:""} 看了你的比赛录像——${reason}。<b>他们邀请你去队里试训。</b>${
    lg&&lg!=="LPL"?`<br><span style="color:var(--ink-3)">跨国邀请：签了就是出海打职业。</span>`:""}`, "big");
  if(typeof render === "function") render();
}
/* 这家队在联赛里到底排第几。
   光写「弱队」没用——玩家看到 IG 想到的是一线豪门，
   但 2022 的 IG 战力排 15/17，确实是弱队。得把真实位置摆出来。 */
function clubStanding(name){
  try{
    const lg = S.world && S.world.LPL; if(!lg) return null;
    // 二队队名是 EDG.Y 这种，还原母队要查 LDL 条目上的 parent，
    // 不能再靠剥「青训队」后缀——那个后缀已经没有了
    const ld = (S.world && S.world.LDL || []).find(t=>t.name===name);
    const bare = ld ? ld.parent : String(name);
    const rk = lg.map(t=>({n:t.name, p:power(t)})).sort((a,b)=>b.p-a.p);
    const i = rk.findIndex(t=>t.n===bare);
    return i<0 ? null : { pos:i+1, of:rk.length, power:rk[i].p };
  }catch(e){ return null; }
}

/* 按档次挑一家真实存在的俱乐部 */
function pickClub(tier, league){
  try{
    const key = league || "LPL";
    const lg = (S.world && S.world[key]) ? S.world[key] : null;
    if(!lg || !lg.length) return null;
    const rk = lg.map(t=>({n:t.name, p:power(t)})).sort((a,b)=>b.p-a.p);
    // 分段按联赛规模缩放。原来是写死的 [0,3]/[4,10]/[11,n-1]，那是照 LPL 的 17 队画的；
    // 放到只有 4 队的小赛区上，三个档位会全部塌到最后一名那支队。
    const n = rk.length;
    const fr = { top:[0,0.25], mid:[0.25,0.65], low:[0.65,1], acad:[0.65,1] }[tier] || [0.25,0.65];
    const lo = clamp(Math.floor(fr[0]*n), 0, n-1);
    const hi = clamp(Math.ceil(fr[1]*n)-1, lo, n-1);
    const pick = rk[lo + Math.floor(rnd()*(hi-lo+1))];
    // 青训档次给的是俱乐部的二队（LDL），队名走 EDG.Y 这套惯例
    if(tier !== "acad") return pick.n;
    const ld=(S.world&&S.world.LDL||[]).find(t=>t.parent===pick.n);
    return ld ? ld.name : (typeof teamCode==="function"?teamCode(pick.n)+".Y":pick.n);
  }catch(e){ return null; }
}
/* 邀请卡：接受就进试训，拒绝就继续练。
   做成遮罩弹窗——原来是排在页面流里的卡片，滚下去就错过了。 */
function inviteCard(){
  const P = S.pre, iv = P && P.invite;
  if(!iv || !iv.pending) return "";
  /* 比赛结果要先看完，邀请才能弹。
     cupPayout() 是在杯赛结束的当下就发邀请的，而那一刻比分卡还挂在页面上——
     邀请是遮罩，直接盖住结果，玩家不知道自己到底进没进下一轮。
     而这恰恰是他做决定需要的信息：进了就该先打完决赛，没进才该去试训。
     邀请不会因此丢失：pending 一直留在 S.pre.invite 上，只有玩家表态才清掉，
     所以这里只是把它排到结果后面，不是取消。 */
  if(S.cupMatch || S.cupResult || S.rankUp || S.rndEv || S.rndResult || S.signup) return "";
  const T = CLUB_TIERS[iv.tier];
  const me = tryoutSkill(), gap = me - iv.expect;
  return `<div class="rankup"><div class="ru-inner" style="max-width:560px;text-align:left;max-height:86vh;overflow-y:auto">
    <div class="ru-icon" style="text-align:center">${typeof gicon==="function"?gicon("scout",52):""}</div>
    <div class="ru-eyebrow" style="text-align:center">试训邀请 · ${T.n}${iv.league&&iv.league!=="LPL"?` · ${iv.league} 赛区`:""}</div>
    <div class="ru-tier" style="font-size:21px;text-align:center;margin-bottom:12px">${
      typeof teamLogo==="function"?teamLogo(iv.team,22):""} <b>${iv.team}</b>${(()=>{
      if(iv.league&&iv.league!=="LPL"){
        try{
          const rk=(S.world[iv.league]||[]).map(t=>({n:t.name,p:power(t)})).sort((a,b)=>b.p-a.p);
          const i=rk.findIndex(t=>t.n===iv.team);
          return i>=0?`<span class="tag">${iv.league} 第 ${i+1}/${rk.length} · 战力 ${rk[i].p.toFixed(1)}</span>`:"";
        }catch(e){ return ""; }
      }
      const st=clubStanding(iv.team);
      return st?`<span class="tag">LPL 第 ${st.pos}/${st.of} · 战力 ${st.power.toFixed(1)}</span>`:"";
    })()}</div>
    <p class="note" style="margin:0 0 10px">他们来找你，是因为${iv.reason}。
      <b>但找你和要你是两回事</b>——能不能签下来，看接下来这四天。<br>
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
    <div class="row" style="justify-content:center">
      <button class="btn" id="ivgo">去试训 →</button>
      <button class="btn ghost" id="ivno">先不去，继续练</button>
    </div>
    <p class="note">拒绝不会关上门，但这家俱乐部今年不会再来第二次。</p></div></div>`;
}

/* ---------- 二、试训过程 ---------- */
/* 试训模板（2026-09-01 P2）：按咖位裁流程。
   新人走完整四天；职业转会免掉单排考核——你的比赛数据就是考核；
   明星（表现分 ≥15）根本不用试训，rollProOffers 里直接开价。 */
function startTryout(tier, team, expect){
  S.tryout = { tier, team, expect, day:0, score:0, lines:[], fat:0, done:false,
               days:[0,1,2,3] };
  render();
}
function tryoutDays(t){ return (t&&t.days)||[0,1,2,3]; }
function tryoutDay(){ const t=S.tryout; return TRYOUT_DAYS[tryoutDays(t)[t.day]]; }
/* 体质差的人，后面几天会明显掉状态——这是体质在这里的意义 */
function tryoutFatiguePenalty(){
  const t = S.tryout;
  const stamina = S.attrs.体质;
  return t.day * Math.max(0, (52 - stamina)) * 0.055;
}
function resolveTryoutDay(i){
  const t = S.tryout, D = TRYOUT_DAYS[tryoutDays(t)[t.day]], opt = D.a[i];
  const v = S.attrs[opt.dim] - tryoutFatiguePenalty();
  const p = clamp(0.22 + (v/100)*0.62, 0.08, 0.92);
  const ok = rnd() < p;
  // 成败对称。原来失败只扣 0.85 倍，四个环节累下来整体偏正，
  // 结果刚够门槛的人也有三成概率拿 A+——评级就没意义了。
  // 短流程试训（职业转会 3 天）按天数归一：每天的分量放大到总期望和四天一致，
  // 否则流程越短评级越低，「免考核」反而变成惩罚。
  const delta = (ok ? 1 : -1) * opt.risk * 4.2 * (4/tryoutDays(t).length);
  t.score += delta;
  t.lines.push(`<div><span class="hi">${D.n.split(" · ")[1]}</span> ${opt.t} — ${
    ok ? '<span class="w">教练点了头</span>' : '<span class="l">没打动他们</span>'
  }　<b style="color:${delta>0?'var(--cyan)':'var(--red)'}">${delta>0?"+":""}${delta.toFixed(1)}</b></div>`);
  t.day++;
  if(t.day >= tryoutDays(t).length) endTryout();
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
  return `<div class="card"><h2>${D.n}<em>${t.team} · 第 ${t.day+1}/${tryoutDays(t).length} 天${
      t.pro?" · 职业转会试训":""}</em></h2>
    ${t.pro&&t.day===0?`<p class="note" style="color:var(--cyan);margin:0 0 6px">打过职业的人不用再考单排——你的比赛数据顶掉了第一天。</p>`:""}
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
  acad:  { n:"青训合同", mul:0.30, k:"core"  }   // 进的是 LDL，在二队你就是主力
};
function makeDeal(){
  const t = S.tryout, r = t.result, T = CLUB_TIERS[t.tier];
  /* 二队/青训俱乐部签出来的只能是青训合同——注册进 LDL、先坐板凳是制度，
     和你试训评几都没关系。原来 A+ 会把合同档写成「核心首发」，
     经济页挂着核心首发、队伍页写着还没进名单（玩家线上抓的自相矛盾）。
     评级的价值走 q（工资在本队区间里的落点），不再借大俱乐部的档位系数。 */
  const rt = (t.tier === "acad") ? "acad" : r.tier;
  const D  = DEAL_TIERS[rt];
  const mul = (t.tier === "acad") ? 1.0 : D.mul;   // 青训自己的价目表不再打三折
  const lerp=(a,b,x)=>a+(b-a)*clamp(x,0,1);
  const q = clamp((r.d + 10) / 26, 0, 1);          // 评级在这家队里的相对位置
  S.deal = {
    team:t.team, clubTier:t.tier, dealTier:rt, grade:r.g, kind:D.k,
    salary: Math.round(lerp(T.pay[0], T.pay[1], q) * mul),
    sign:   Math.round(lerp(T.sign[0], T.sign[1], q) * mul),
    years:  T.years,
    buyout: Math.round(lerp(T.buyout[0], T.buyout[1], q) * mul),
    asks: 0, leverage: dealLeverage(r.g), dead:false, signed:false, log:[]
  };
  S.tryout = null;
  render();
}
/* 还价的底气：试训评级 + 人气 + 比赛履历，段位只占一点。
   「都是用比赛衡量的」——天梯分在谈判桌上不值钱，打过的比赛才值钱。 */
function dealLeverage(grade){
  const g = { "A+":26, "A":18, "B":10, "C":4 }[grade] || 0;
  const P = S.pre||{};
  const resume = (P.cityCup||0)*1.5 + (P.streamCup||0)*2 + Math.min(P.scoutSeen||0,12)*0.5;
  return clamp(g + Math.min(S.fans,300)*0.045 + (P.rank||0)*0.05 + resume, 5, 62);
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
  const st=clubStanding(d.team);
  return `<div class="card"><h2>合同谈判<em>${d.team} · ${T.n}${
    st?` · LPL 第 ${st.pos}/${st.of}`:""}</em></h2>
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
      ${d.dealTier==="acad"
        ?`<b>青训合同去的是 LDL 二队</b>——在二队打首发攒数据，压过一队对位才升上去。`
        :d.dealTier==="sub"
        ?`<b>替补合同意味着板凳</b>——训练赛压过首发才轮得到你上场。`
        :""}
      <b>不签也是一条路</b>——再练一年换一家更好的队未必更亏。但这家今年不会再来了。</p>
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
  // 青训合同签的是俱乐部，人注册在二队（LDL）名单上。
  // 队名走 EDG.Y 这套真实惯例，所以判断「是不是去二队」不能再看后缀，
  // 直接看合同档次，再去 LDL 名单里找这家俱乐部的二队。
  const isLDLName = (P.world.LDL||[]).some(t=>t.name===d.team);
  let toLDL = (d.dealTier === "acad") || isLDLName;
  let teamName = d.team;
  if(toLDL && !isLDLName){
    const ld=(P.world.LDL||[]).find(t=>t.parent===d.team);
    if(ld) teamName=ld.name;
    else{
      /* 这家俱乐部不在 LPL 青训体系（LCK/外赛区）：现实里他们会把看上的
         新人签成替补养在一队，而不是外派给别家的二队——
         「Gen.G 看上你、你却去了国内某青训队」是玩家点名的极端案例。 */
      d.dealTier = "sub";
      d.kind = DEAL_TIERS.sub.k;   // 合同类型跟着变：替补进队，不顶掉位置上那个人
      toLDL = false;
      preLog(`${d.team} 没有 LDL 编制——他们把你注册成<b>一队替补</b>，跟队训练，等一个上场的机会。`,"info");
    }
  }
  if(toLDL){
    const has=(P.world.LDL||[]).some(t=>t.name===teamName);
    if(!has && (P.world.LDL||[]).length){
      // 这家一队没有二队编制。现实里俱乐部会把你推荐去合作的二队。
      const alt=P.world.LDL[0].name;
      preLog(`${d.team} 没有自己的二队编制，把你推荐去了 <b>${alt}</b>——合同照签，人去那边报到。`,"info");
      teamName=alt;
    }
  }
  /* 队名到底属于哪个联赛——不能假设是 LPL。

     玩家报的 bug：签了 Gen.G（LCK），进游戏却在 LNG Esports 打 LPL。
     原因就是这里原来的两行：查队名只查 P.world.LPL，查不到就「退回一支中游队」
     （LPL 第 7 名正好是 LNG），而 league 又被写死成 "LPL"——
     于是每一份外赛区合同都被静默改写成了 LPL 第七名，还不吭声。
     现在按队名在整个世界里找联赛，找不到才兜底，而且兜底要说出来。 */
  let lg = toLDL ? "LDL" : (d.league || null);
  if(!lg || !((P.world[lg]||[]).some(t=>t.name===teamName))){
    lg = Object.keys(P.world).find(k=>(P.world[k]||[]).some(t=>t.name===teamName)) || null;
  }
  if(!lg){
    const rk=P.world.LPL.map(t=>({n:t.name,p:power(t)})).sort((a,b)=>b.p-a.p);
    const alt=rk[Math.min(6,rk.length-1)].n;
    preLog(`合同上的 <b>${teamName}</b> 在这个赛季的名单里找不到了，
      俱乐部把你转给了 <b>${alt}</b>。`,"info");
    teamName=alt; lg="LPL";
  }
  const D = DEAL_TIERS[d.dealTier];
  P.offers = [{ k:d.kind, team:teamName, t:D.n, d:"", note:"", league: lg }];
  addMoney("sign", d.sign);
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
  if(!t.result || !t.result.tier){
    if(t.pro){ pushEvent(`<b>${t.team}</b> 看完之后没有开价。`,"bad","转会"); S.tryout=null; render(); return; }
    dropDeal(); return;
  }
  if(t.pro){ const g=t.result.g, tier=t.tier, team=t.team, lg=t.league; S.tryout=null; makeProDeal(tier,team,g,lg); return; }
  makeDeal();
}

/* ================= 五、转会：别的队来挖你 =================

   签了约不等于世界就此定格。你在赛场上打得好，别的俱乐部当然会看见——
   而且看得够清楚的时候，人家不会再要你去试训四天，直接把合同摆上桌。

   两个入口，取决于他们对你有多确定：
     · 表现不错但还想亲眼看看 → 试训邀请（还是那四天）
     · 表现好到不需要确认     → 直接报价，跳过试训

   代价是合同里的违约金：买你的队要付给你现在的东家。违约金越高，
   来的队就越少、档次越低——这正是签约时压低违约金的意义所在。  */

/* 这个赛段你打成什么样。决定有没有人来、来的是谁、要不要先看试训。 */
function proPerf(){
  if(!S.career) return -99;
  const me = avg(DIMS.map(d=>S.attrs[d]));
  const base = (S.baseline && S.baseline[S.homeLeague||"LPL"]) || 65;
  // 统一标尺校准：世界 +15 压缩了「我−联赛」的差值（旧尺强玩家 +25，新尺 +5-8），
  // 系数不跟着放大，转会梯子就断了——实测机器人生涯转会从 5 次掉到 1.9 次，
  // 一辈子困在弱队拿头撞 88 分的明星队。3.0 是把梯子接回原高度。
  let v = (me - base) * 3.0;                       // 个人水平相对联赛
  const g = S.record ? (S.record.w + S.record.l) : 0;
  if(g >= 3) v += ((S.record.w / g) - 0.5) * 20;   // 这个赛段的战绩
  v += ((S.career.titles || []).length) * 4;
  v += (((S.career.msi || 0) + (S.career.worlds || 0))) * 9;
  if(typeof myForm === "function") v += (myForm() - 52) * 0.18;
  v += Math.min(S.fans || 0, 400) * 0.018;
  if(S.benchedSplits) v -= S.benchedSplits * 6;    // 一直坐板凳，没人看得到你
  // 训练赛数据会流出去：替补打赢首发的对位是圈内会传的事（rotation.js）
  if(!S.promoted && S.scrim) v += Math.min(S.scrim.wins||0, 6) * 1.5;
  return v;
}
/* 违约金越高，越少有队愿意动你 */
function buyoutDrag(){
  if(S.freeAgent) return 0;      // 自由身：没人需要为你付违约金
  const b = (S.contract && S.contract.buyout) || 0;
  return b / 260;          // 900 万违约金 ≈ 拉低 3.5 分表现分
}
/* ---------- 赛季中的俱乐部关注 ----------
   原来「有没有人来挖你」全年只有休赛期那一个瞬间掷一次骰子——
   赛季里打得再好也听不到任何风声，到了转会期要么有要么没有，
   玩家的实际体感就是「进了队之后再没人理过我」。
   现在拆成两段：赛段结算时先攒关注度并且明确告诉你，休赛期再兑现成报价。 */
function noteScoutInterest(){
  if(!S.career || !S.team) return;
  const perf = proPerf() - buyoutDrag();
  if(perf < 4) return;                                  // 打得不够好，确实没人看
  // 频率刻意压住：每个赛段都有人来看，这条播报就不值钱了
  if(rnd() >= clamp(0.10 + perf * 0.018, 0, 0.55)) return;
  S.scoutHeat = (S.scoutHeat || 0) + 1;
  const inLDL = (S.homeLeague||"LPL")==="LDL";
  const tier = perf >= 19 ? "top" : perf >= 10 ? "mid" : "low";
  // LDL 选手被看上，来的是一线队——这正是「用比赛衡量」的通道
  const t = pickClub(tier, inLDL ? "LPL" : (S.homeLeague || "LPL"));
  const who = (t && t !== S.team) ? `<b>${t}</b> 的` : "有几家俱乐部的";
  // 赛段中不能跳槽，但意向要记下来、摆进「转会」栏——注册窗一开就兑现
  if(t && t !== S.team){
    S.txIntents = (S.txIntents||[]).filter(x=>x.team!==t);
    S.txIntents.push({ team:t, tier, si:S.si, league: inLDL?"LPL":(S.homeLeague||"LPL") });
    if(S.txIntents.length>4) S.txIntents.shift();
    // 看台上那一幕会发酵：几周后可能上话题榜（事件链——之前定义了却忘了接线）
    if(typeof queueFollowUp==="function"&&rnd()<0.35) queueFollowUp("rumorSpread",3,{team:t});
  }
  pushEvent(`${who}教练组的人出现在你们这场的看台上。<br>
    <span style="color:var(--ink-3)">赛段中不能转会，但意向记进了「转会」栏——注册窗一开就能谈。</span>`, "good", "转会");
}

/* 注册窗开时兑现：有没有人来问。
   2026-08-31 起双注册窗（玩家拍板）：季中窗（春→夏之间）+ 年底休赛期窗，
   和现实 LPL 一致——LDL 打半年打得好，夏季赛就能穿一线队衣。
   wnd: "year"（年底，默认）或 "mid"（季中）。每个窗只摇一次。 */
function rollProOffers(wnd){
  wnd = wnd || "year";
  if(!S.career || S.proOffer || S.deal || S.tryout) return;
  /* 同一个窗只开一次。offNextWeek 在 MSI/世界赛结束的岔路上会
     反复把 step 设回 "offseason"，不挡住的话一年能摇出十几次问询。 */
  const wk = S.si + "-" + wnd;
  if(S.offerWnd === wk) return;
  S.offerWnd = wk;
  if(wnd === "year") S.offerYear = S.si;   // 老存档兼容
  const inLDL = (S.homeLeague||"LPL")==="LDL";
  const perf = proPerf() - buyoutDrag();
  // 赛季里攒下的关注度直接折成概率：被盯了一个赛段，注册窗不该毫无动静
  const heat = Math.min(S.scoutHeat || 0, 6);
  const intents = (S.txIntents||[]).filter(x=>x.si>=S.si-1);
  let p = clamp(0.10 + perf * 0.030 + heat * 0.075 + Math.min(intents.length,3)*0.12, 0.02, 0.92);
  // 保底：打得确实好，却连着两个窗没有任何人来问，说不过去
  const dry = S.offerDry || 0;
  if(perf >= 13 && dry >= 2) p = Math.max(p, 0.92);
  /* 冠军保送（玩家实测：世界冠军滚进了封顶概率外那 12% 的空窗）——
     当年拿了世界赛/MSI 冠军的人「没人来问」在现实里不存在，这不归骰子管；
     联赛冠军也几乎必有电话。 */
  const intlChampYear = ((S.career&&S.career.worldsYears)||[]).includes(S.si)
                     || ((S.career&&S.career.msiYears)||[]).includes(S.si);
  const lgChampYear = ((S.career&&S.career.lgYears)||[]).includes(S.si);
  if(intlChampYear) p = 1;
  else if(lgChampYear) p = Math.max(p, 0.96);
  S.scoutHeat = 0;
  const wname = wnd==="mid" ? "季中注册窗" : "年底注册窗";
  /* 注册窗是意向的到期日：要么兑现成正式问询，要么当场作废——
     不许静默留着（玩家实测：WE 的意向挂了一整年，谁也没来，谁也没说一声）。 */
  const settle = txt => {
    const names = intents.map(x=>x.team).join("、");
    S.txIntents = [];
    S.txWndNote = { w:wname, si:S.si, txt };
    if(intents.length)
      pushEvent(`${wname}关上了：看台上那几家（<b>${names}</b>）终究没有递表。<b>意向作废。</b><br>
        <span style="color:var(--ink-3)">${txt}</span>`,"info","转会");
  };
  if(rnd() >= p){
    S.offerDry = dry + 1;
    settle(`教练组的兴趣没能说服管理层。继续打，数据是唯一会替你说话的东西。`);
    return;
  }
  S.offerDry = 0;
  let tier = perf >= 19 ? "top" : perf >= 10 ? "mid" : "low";
  if(intlChampYear) tier = "top";       // 抬着奖杯进转会期，来的只会是豪门
  // 外赛区也在同步运转，也会来挖人。
  const abroad = pickForeign(perf);
  let league = abroad || "LPL";
  // LDL 选手的出路是一线：数据够（表现分 ≥10）一线来谈；不够就继续攒
  if(inLDL && !abroad){
    if(perf < 10 && !S.freeAgent){
      S.offerDry = dry + 1;
      settle(`二队的数据还没到一线的门槛（表现分 ${Math.round(perf)}，要 10）。`);
      return;
    }
    tier = perf >= 16 ? "mid" : "low";
    league = "LPL";
  }
  // 赛段里攒的意向优先兑现——看台上那家真的来了
  let team = null;
  const iv = intents.length ? intents[Math.floor(rnd()*intents.length)] : null;
  if(iv && !abroad && iv.team !== S.team){ team = iv.team; tier = iv.tier; league = iv.league||league; }
  if(!team) team = pickClub(tier, league);
  S.txIntents = [];
  if(!team || team === S.team){ S.txWndNote={w:wname,si:S.si,txt:"这个窗没有合适的下家。"}; return; }
  S.txWndNote = { w:wname, si:S.si, txt:`<b>${team}</b> 递了正式问询。` };
  // 看得够清楚就不用再试训了
  const direct = perf >= 15;
  S.proOffer = { team, tier, league, perf: Math.round(perf), direct,
                 buyout: S.freeAgent ? 0 : ((S.contract && S.contract.buyout) || 0) };
  pushEvent(`<b>${team}</b> 的人来问了你的情况。${
    direct ? "他们不打算再看试训，直接想谈合同。" : "他们想先让你去队里试训几天。"}${
    wnd==="mid" ? "<br><span style=\"color:var(--ink-3)\">季中注册窗：现在谈成，夏季赛就换队衣。</span>" : ""}`,
    "big", "转会");
}
/* 会不会是外赛区来的。
   语言课在这里第一次真的有用：会当地语言，对方才敢认真谈。
   原来 langBonus() 只在「已经身处 LCK」时给 +2.6，
   而去外赛区的唯一入口是年末报价里 score>=92 那条——
   于是韩语课基本是买不回本的。 */
/* 小赛区不是背景板，是低谷时的退路。
   现实里打不上 LPL 首发的选手大量流向 PCS / VCS / LJL —— 那边给的是首发位。
   原来外赛区只有「往上」一条路（打得好 → LCK/LEC/LCS），
   于是七个小赛区在整局里从不与玩家发生任何关系。现在有两个方向：
     往上：已经证明过自己的人，豪门赛区来追
     往外：在国内坐板凳、或者一直卡在二队的人，小赛区愿意给首发
   代价写在别处：外赛区的粉丝天花板打八折（国内热度接不住），
   语言不通会影响默契。 */
const MINOR_LEAGUES=["PCS","VCS","LJL","LLA","CBLOL","LCO","TCL"];
/* 是不是真的卡住了——这是「退路」该不该出现的判据 */
function inRut(perf){
  return (S.benchedSplits||0)>=1 || (S.homeLeague||"LPL")==="LDL" || perf<3;
}
function pickForeign(perf){
  const here=S.homeLeague||"LPL";
  if(here!=="LPL"&&here!=="LDL") return null;          // 已经在外面了
  const opts=[];
  const kr = (typeof hasCourse==="function") && hasCourse("kr");
  const en = (typeof hasCourse==="function") && hasCourse("en");
  if(perf < 12){
    // 往外：没证明过自己，豪门赛区不会来；但卡住了的话，小赛区会
    if(!inRut(perf)) return null;
    MINOR_LEAGUES.forEach(lg=>{ if(S.world[lg]&&S.world[lg].length) opts.push({lg,w:1}); });
    if(!opts.length) return null;
    if(rnd() >= 0.26) return null;
    const tot0=opts.reduce((a,o)=>a+o.w,0);
    let r0=rnd()*tot0;
    for(const o of opts){ if((r0-=o.w)<=0) return o.lg; }
    return null;
  }
  if(S.world.LCK) opts.push({lg:"LCK", w: kr ? 1.8 : 1.0});
  if(S.world.LEC) opts.push({lg:"LEC", w: en ? 1.5 : 0.9});
  if(S.world.LCS) opts.push({lg:"LCS", w: en ? 1.3 : 0.8});
  // 语言不该挡住别人来找你：现实里不会韩语照样有人签，
  // 差别在进队之后能不能融进去。所以这里只按表现算概率，
  // 语言的作用挪到了默契上（见 squadWeights 里的 langSyn）。
  const base = 0.30 + (perf-12)*0.012;
  if(rnd() >= clamp(base,0.05,0.6)) return null;
  const tot=opts.reduce((a,o)=>a+o.w,0);
  if(!tot) return null;
  let r=rnd()*tot;
  for(const o of opts){ if((r-=o.w)<=0) return o.lg; }
  return null;
}
function proOfferCard(){
  const o = S.proOffer; if(!o) return "";
  const T = CLUB_TIERS[o.tier], st = clubStanding(o.team);
  const cur = clubStanding(S.team);
  return `<div class="rankup"><div class="ru-inner" style="max-width:560px;text-align:left;max-height:86vh;overflow-y:auto">
    <div class="ru-icon" style="text-align:center">${typeof gicon==="function"?gicon("transfer",52):""}</div>
    <div class="ru-eyebrow" style="text-align:center">${o.asked?"有人接了你的牌":"转会问询"} · ${T.n}</div>
    <div class="ru-tier" style="font-size:21px;text-align:center;margin-bottom:12px">${
      typeof teamLogo==="function"?teamLogo(o.team,22):""} <b>${o.team}</b>${
      (o.league&&o.league!=="LPL")?`<span class="tag g">${o.league}</span>`
      :(st?`<span class="tag">LPL 第 ${st.pos}/${st.of}</span>`:"")}</div>
    <p class="note" style="margin:0 0 10px">
      你现在在 <b>${S.team}</b>${cur?`（第 ${cur.pos}/${cur.of}）`:""}。
      ${o.direct
        ? "他们看过你这个赛段的比赛，<b>不需要试训</b>，直接想谈合同。"
        : "他们想先让你去队里试训四天再决定。"}
      ${o.buyout?`<br>要带走你，得先付 <b>${o.buyout} 万</b>违约金——这笔钱归你现在的俱乐部。`:""}
      ${(o.league&&o.league!=="LPL")?`<br><b style="color:var(--gold)">这是 ${o.league}。</b>${
        (o.league==="LCK"&&typeof hasCourse==="function"&&hasCourse("kr"))?"你会韩语，沟通不是问题。"
        :(o.league!=="LCK"&&typeof hasCourse==="function"&&hasCourse("en"))?"你会英语，沟通不是问题。"
        :"语言不通。去了也能打，但更衣室里你插不上话——默契会一直上不去，除非补上语言课。"}`:""}</p>
    <div class="row" style="justify-content:center">
      <button class="btn" id="pofgo">${o.direct?"去谈合同 →":"去试训 →"}</button>
      <button class="btn ghost" id="pofno">留在 ${S.team}</button>
    </div>
    <p class="note">拒绝没有惩罚，但这家今年不会再来。</p></div></div>`;
}
/* 接受问询：要么进试训，要么直接谈 */
function takeProOffer(){
  const o = S.proOffer; if(!o) return;
  S.proOffer = null;
  if(o.direct){ makeProDeal(o.tier, o.team, "A", o.league); return; }
  // 职业转会试训是简化流程：免单排考核，三个环节
  S.tryout = { tier:o.tier, team:o.team, expect:CLUB_TIERS[o.tier].expect,
               day:0, score:0, lines:[], fat:0, done:false, pro:true, league:o.league,
               days:[1,2,3] };
  render();
}
function dropProOffer(){
  const o = S.proOffer; if(!o) return;
  pushEvent(`婉拒了 <b>${o.team}</b>。你还想在 <b>${S.team}</b> 把事情做完。`, "info", "转会");
  S.proOffer = null; render();
}

/* ---------- 六、主动挂牌：转会申请由你发起 ----------
   原来只有被动等人来挖。现在休赛期可以自己放消息出去——
   有没有人接，看你的表现、威望和合同里的违约金。
   代价是明码标价的：经理不高兴，没人接的话更衣室还会知道你想走。 */
/* 注册窗开着吗（季中间歇 / 年底休赛期）——挂牌、买断、当场谈约都看它 */
function txWindowOpen(){
  return !!(S.off && (S.off.next==="year" || S.off.next==="summer"));
}
function txWindowName(){
  return S.off && S.off.next==="summer" ? "季中注册窗" : "年底注册窗";
}
function canAskTransfer(){
  if(!S.career||!S.team) return {ok:false,why:"还没签约"};
  if(!txWindowOpen()) return {ok:false,why:"注册窗没开——季中间歇和年底休赛期才能挂牌，赛段中提转会俱乐部直接按违约处理"};
  if(S.askedTransfer) return {ok:false,why:"这个注册窗已经挂过一次牌了"};
  if(S.proOffer||S.deal||S.tryout) return {ok:false,why:"手上还有没谈完的事"};
  return {ok:true};
}
/* ---------- 自行买断合同 ----------
   玩家原话：「现在这个违约金是不是根本没有用到的地方，我根本没有自己解约跳槽的选项」。

   违约金原来只在三个地方出现：影响别队来挖你的概率（buyoutDrag）、
   买你的队要付这笔钱（signTransfer）、签约时可以谈低。
   全是「别人怎么对你」——玩家自己一次也用不上它。
   现在补上第三条路：<b>自己掏这笔钱把合同买断</b>，立刻成为自由身。
   代价明码标价：钱、经理和教练的信任、更衣室的看法。
   这也让签约时「压低违约金」那个选项第一次有了自己的意义。 */
function canBuyout(){
  if(!S.career||!S.team) return {ok:false,why:"还没签约"};
  if(!txWindowOpen()) return {ok:false,why:"注册窗没开——季中间歇和年底休赛期才能买断，赛段中走人是违约"};
  if(S.proOffer||S.deal||S.tryout) return {ok:false,why:"手上还有没谈完的事"};
  const fee=(S.contract&&S.contract.buyout)||0;
  if(!fee) return {ok:false,why:"这份合同没有违约金条款"};
  if(S.money<fee) return {ok:false,why:`要 ${fee} 万，你现在只有 ${Math.round(S.money)} 万`};
  return {ok:true,fee};
}
function doBuyout(){
  const c=canBuyout(); if(!c.ok||S.ap<=0) return;
  S.ap--;
  addMoney("other",-c.fee);
  const old=S.team;
  if(typeof addStaff==="function"){ addStaff("mgr",-18); addStaff("coach",-10); }
  if(typeof addTrustAll==="function") addTrustAll(-12);
  S.freeAgent=true;                       // 自由身：这个休赛期的报价会宽一档
  S.askedTransfer=true;
  pushEvent(`你自己掏了 <b>${c.fee} 万</b>，把和 <b>${old}</b> 的合同买断了。<br>
    合同作废，你现在是<b>自由身</b>——不用再等别人来挖，也没人再替你付这笔钱。<br>
    <span style="color:var(--red)">经理和教练都记着这一笔，更衣室也知道了。</span>`,"big","转会");
  if(typeof txNote==="function") txNote(`自掏 ${c.fee} 万买断与 ${old} 的合同，成为自由身`);
  // 自由身不用别人付违约金，愿意谈的队会多一档
  if(typeof rollProOffers==="function"){ S.offerYear=undefined; rollProOffers(); }
  if(!S.proOffer) pushEvent(`消息放出去了，但这个休赛期暂时没有队来谈。
    <span style="color:var(--ink-3)">自由身的好处是没人拦着你，坏处是也没人替你着急。</span>`,"info","转会");
  render();
}

/* 有没有人接牌的把握，也摆给玩家看。
   主动求走时违约金的拖累加倍——买你的队要掏钱，你上赶着，人家更要掂量 */
function askTransferOdds(){
  const perf=proPerf()-buyoutDrag()*2;
  const cl=(typeof cloutOf==="function")?cloutOf():40;
  return clamp(0.30+perf*0.030+(cl-40)/220,0.06,0.85);
}
function askTransfer(){
  if(!canAskTransfer().ok||S.ap<=0) return;
  S.ap--; S.askedTransfer=true;
  if(typeof addStaff==="function") addStaff("mgr",-6);      // 你想走，管理层记下了
  const perf=proPerf()-buyoutDrag()*2;
  const p=askTransferOdds();
  pushEvent(`你让经纪人放出消息：<b>${meName()} 对转会持开放态度</b>。经理的脸色不太好看。`,"info","转会");
  if(rnd()>=p){
    pushEvent(`挂牌两周，问价的电话一个都没来。${
      perf<0?"你现在的表现，市场不买账。"
      :((S.contract&&S.contract.buyout)||0)>500?"违约金摆在那，想动你的队都得掂量。"
      :"市面上暂时没有缺你这个位置的队。"}<br>
      <span style="color:var(--red)">消息传开了——更衣室知道你想走。</span>`,"bad","转会");
    if(typeof addTrustAll==="function") addTrustAll(-5);
    render(); return;
  }
  const tier = perf>=19?"top":perf>=8?"mid":"low";
  const abroad=pickForeign(perf);
  const league=abroad||"LPL";
  let team=pickClub(tier,league);
  if(!team||team===S.team) team=pickClub(tier==="low"?"mid":"low","LPL");
  if(!team||team===S.team){
    pushEvent(`有队伍来问了两句，但位置对不上，没谈成。`,"info","转会");
    render(); return;
  }
  const direct = perf>=13;      // 主动挂牌的人，买家省去试探，更愿意直接谈
  S.proOffer={team,tier,league,perf:Math.round(perf),direct,
              buyout:(S.contract&&S.contract.buyout)||0,asked:true};
  pushEvent(`<b>${team}</b> 接了你的牌${direct?"，直接想谈合同":"，想先让你去试训"}。`,"big","转会");
  render();
}
/* 转会的合同：底子比职业前那份好得多，因为你已经证明过自己 */
/* 买方的转会预算：工资帽 × 评级系数。违约金要从这里出——
   预算之内正常谈；超一点，从你的条件里扣；超太多，这单直接黄。 */
function transferBudget(tier, grade){
  const T = CLUB_TIERS[tier]||CLUB_TIERS.low;
  // pay 是每赛段的数，预算按年薪算（×2），再乘评级系数——
  // 现实里转会费大致是年薪的 1–2 倍量级
  const mul = { "A+":2.2, "A":1.6, "B":1.1, "C":0.7 }[grade] || 0.7;
  return Math.round(T.pay[1] * 2 * mul);
}
function makeProDeal(tier, team, grade, league){
  const T = CLUB_TIERS[tier], lerp = (a,b,x)=>a+(b-a)*clamp(x,0,1);
  const q = clamp((proPerf() + 6) / 30, 0.15, 1);
  // 违约金进谈判桌（2026-08-31 玩家拍板）：
  // 定太高的话，试训评级再好，对面也可能付不起这笔转会费。
  const fee = S.freeAgent ? 0 : ((S.contract && S.contract.buyout) || 0);
  const budget = transferBudget(tier, grade);
  if(fee > budget * 1.5){
    pushEvent(`<b>${team}</b> 谈到最后一步还是收手了：<b>${fee} 万违约金他们付不起</b>
      （按你的评级，他们最多准备了 ${budget} 万转会预算）。<br>
      <span style="color:var(--ink-3)">违约金是把双刃剑——想走的话，续约时把它谈低，或者自己买断。</span>`,
      "bad", "转会");
    if(typeof consumeOffer==="function"&&S.pre) consumeOffer(team);
    render(); return;
  }
  let salary = Math.round(lerp(T.pay[0], T.pay[1], q));
  let sign   = Math.round(lerp(T.sign[0], T.sign[1], q));
  let feeCutNote = "";
  if(fee > budget){
    // 超预算不到五成：帮你付，但从你的条件里扣 20–40%
    const cut = clamp(0.2 + 0.4 * (fee - budget) / (budget * 0.5), 0.2, 0.4);
    salary = Math.round(salary * (1 - cut));
    sign   = Math.round(sign * (1 - cut));
    feeCutNote = `<div><span class="hi">违约金</span> — <span class="l">${fee} 万超出他们的预算（${budget} 万），条件被压了 ${(cut*100).toFixed(0)}%——他们在替你还债</span></div>`;
  }
  S.deal = {
    team, clubTier:tier, dealTier:(grade==="A+"?"first":grade==="A"?"start":"sub"),
    grade, kind:(grade==="A+"||grade==="A")?"start":"sub", transfer:true, league:league||"LPL",
    salary, sign,
    years:  T.years,
    buyout: Math.round(lerp(T.buyout[0], T.buyout[1], q)),
    asks:0, dead:false, signed:false, log:feeCutNote?[feeCutNote]:[],
    // 已经打出成绩的人，谈判底气不该再看职业前那点排位分
    leverage: clamp(14 + proPerf()*0.9 + Math.min(S.fans,400)*0.03, 8, 70)
  };
  render();
}
/* 真的换队 */
function signTransfer(){
  const d = S.deal; if(!d || d.dead || d.signed) return;
  d.signed = true;
  const old = S.team, oldLg = S.homeLeague||"LPL", fee = (S.contract && S.contract.buyout) || 0;
  S.team = d.team;
  if(d.league) S.homeLeague = d.league;      // 跨赛区转会，联赛也要跟着换
  S.offerKind = d.kind;
  S.understudy = null; S.promoted = true;
  const t = (S.world[S.homeLeague||"LPL"]||[]).find(x=>x.name===S.team);
  if(t) t.players = t.players.map(q => q.pos===S.pos
    ? {id:S.name||"你", cn:"", pos:S.pos, age:S.age, r:S.attrs, me:true} : q);
  if(typeof markTeamJoin==="function") markTeamJoin();   // 换了队，在队时长归零
  S.trust = {}; if(typeof initTrust==="function") initTrust();
  if(typeof syncTrust==="function") syncTrust();
  addMoney("sign", d.sign);
  S.contract = { years:d.years, left:d.years, salary:d.salary, sign:d.sign,
                 buyout:d.buyout, team:d.team, tier:d.dealTier, grade:d.grade,
                 clubTier:d.clubTier };
  S.rosterSig = myRoster().map(x=>x.id).sort().join("|");
  if(typeof disruptSynergy==="function") disruptSynergy(1, `<b>${meName()}</b> 转会加盟`);
  pushEvent(`<b>${meName()}</b> 从 <b>${old}</b> 转会到 <b>${d.team}</b>${
    (d.league&&d.league!==oldLg)?`，去了 <b>${d.league}</b>`:""}。${
    fee?`对方付了 <b>${fee} 万</b>违约金。`:""}年薪 ${d.salary} 万，${d.years} 个赛段。`,
    "big", "转会");
  if(typeof checkAch==="function") checkAch("transfer", {to:d.team});
  // 转会也是签约——「远走他乡」这类 on:"sign" 的成就原来只在首签触发，
  // 真转会出国反而拿不到（修误发 LDL 的同时抓出来的反向漏洞）
  if(typeof checkAch==="function") checkAch("sign");
  if(typeof txNote==="function") txNote(`${old} → <b>${d.team}</b>${(d.league&&d.league!==oldLg)?`（${d.league}）`:""}，年薪 ${d.salary} 万${fee?`，转会费 ${fee} 万`:""}`);
  S.deal = null; render();
}

/* ---------- 从青训升上一队 ----------
   在 LDL 打出来了，母队自然会把你调上去。
   判定看两样：你比一队同位置那个人强多少，以及你在二队的战绩。
   没有这条路，签了青训合同的人就永远困在二队了。 */
function parentClub(){
  const t = (S.world.LDL || []).find(x => x.name === S.team);
  return t ? t.parent : null;
}
function checkPromote(){
  if((S.homeLeague || "LPL") !== "LDL") return false;
  if(S.promoteDeal) return true;                        // 已有调令在桌上，等玩家表态
  const pname = parentClub(); if(!pname) return false;
  const pt = (S.world.LPL || []).find(t => t.name === pname); if(!pt) return false;
  const inc = pt.players.find(q => q.pos === S.pos); if(!inc) return false;
  const me = avg(DIMS.map(d => S.attrs[d]));
  const him = avg(DIMS.map(d => inc.r[d]));
  const g = S.record ? (S.record.w + S.record.l) : 0;
  const wr = g >= 3 ? (S.record.w / g) : 0.5;
  // 比一队那个人强，或者接近但二队战绩极好
  const ok = (me >= him + 1) || (me >= him - 3 && wr >= 0.75);
  if(!ok) return false;

  /* 2026-09-01 玩家点的机制修正：升队不再无声地工资 ×2.4——
     上调要重签合同。俱乐部先给一份「一队标准」的调薪提案（就是原来那套数），
     你可以接受、拿数据争取更高、或者留在二队再打一个窗口。 */
  const st = clubStanding(pname);
  const clubTier = st ? (st.pos <= 4 ? "top" : st.pos <= 10 ? "mid" : "low") : "mid";
  S.promoteDeal = {
    team: pname, from: S.team, incumbent: inc.id, clubTier,
    gap: q1(me - him), wr: g >= 3 ? Math.round(wr * 100) : null,
    salary: Math.round((S.contract && S.contract.salary || 8) * 2.4),
    buyout: Math.round((S.contract && S.contract.buyout || 60) * 3),
    asked: false
  };
  pushEvent(`<b>${pname}</b> 的调令到了：一队想把你从 <b>${S.team}</b> 调上去，
    随调令来的还有一份<b>重签的合同</b>——数字看完再签字。`, "big", "升队");
  return true;
}
/* 争取更高薪的把握：压过对位多少 + LDL 战绩 + 比赛档案里的评分 */
function promoteRaiseOdds(){
  const d = S.promoteDeal; if(!d) return 0;
  const arc = (S.archive||[]).filter(x => x.si === S.si);
  const avgR = arc.length ? arc.reduce((a,x)=>a+x.rating,0)/arc.length : 1;
  return clamp(0.35 + d.gap*0.06 + ((d.wr||50)-50)*0.006 + (avgR-1)*0.5, 0.10, 0.85);
}
function askPromoteRaise(){
  const d = S.promoteDeal; if(!d || d.asked) return;
  d.asked = true;
  const p = promoteRaiseOdds();
  if(rnd() < p){
    const T = CLUB_TIERS[d.clubTier] || CLUB_TIERS.mid;
    d.salary = Math.max(Math.round(d.salary*1.35), Math.round(T.pay[0]*0.8));
    pushEvent(`经纪人把你的 LDL 数据拍在了桌上——俱乐部认了：<b>年薪提到 ${d.salary} 万/赛段</b>。`,"good","升队");
  }else{
    if(typeof addStaff==="function") addStaff("mgr",-4);
    pushEvent(`你要了更高的数，管理层没接：「一队还没打过一场，先证明再谈」。<b>原提案不变</b>，经理记了一笔。`,"info","升队");
  }
  render();
}
function acceptPromote(){
  const d = S.promoteDeal; if(!d) return;
  S.promoteDeal = null;
  const pt = (S.world.LPL || []).find(t => t.name === d.team);
  if(!pt){ pushEvent(`调令出了变故：${d.team} 的名单动了，这个窗口先作罢。`,"bad","升队"); render(); return; }
  const old = S.team;
  S.team = d.team; S.homeLeague = "LPL";
  S.offerKind = "start"; S.understudy = null; S.promoted = true;
  pt.players = pt.players.map(q => q.pos === S.pos
    ? {id:S.name||"你", cn:"", pos:S.pos, age:S.age, r:S.attrs, me:true} : q);
  if(typeof markTeamJoin==="function") markTeamJoin();   // 换了队，在队时长归零
  S.trust = {}; if(typeof initTrust === "function") initTrust();
  if(typeof syncTrust === "function") syncTrust();
  if(S.contract){
    S.contract.salary = d.salary;
    S.contract.buyout = d.buyout;
    S.contract.tier = "sub";
    S.contract.team = d.team;
    S.contract.clubTier = d.clubTier;
  }
  S.rosterSig = myRoster().map(x => x.id).sort().join("|");
  pushEvent(`<b>${d.team}</b> 把你从 <b>${old}</b> 调上了一队，新合同：年薪 <b>${d.salary} 万/赛段</b> · 违约金 ${d.buyout} 万。
    ${d.incumbent} 让出了首发位——你在 LDL 打的那些比赛，有人一直在看。`, "big", "升队");
  if(typeof txNote==="function") txNote(`${old} → <b>${d.team}</b>（升上一队 · 年薪 ${d.salary} 万/赛段）`);
  if(typeof checkAch === "function") checkAch("promote");
  render();
}
function declinePromote(){
  const d = S.promoteDeal; if(!d) return;
  S.promoteDeal = null;
  if(typeof addStaff==="function") addStaff("mgr",-3);
  pushEvent(`你按下了调令：<b>这个窗口先留在 ${S.team}</b>，把首发位和数据攥在手里。<br>
    <span style="color:var(--ink-3)">下个窗口达标的话，调令还会再来——但一队的位置不会永远空着。</span>`,"info","升队");
  render();
}
function promoteDealCard(){
  const d = S.promoteDeal; if(!d) return "";
  const p = promoteRaiseOdds();
  const arc = (S.archive||[]).filter(x=>x.si===S.si);
  const avgR = arc.length ? (arc.reduce((a,x)=>a+x.rating,0)/arc.length).toFixed(2) : "—";
  return `<div class="rankup"><div class="ru-inner" style="max-width:560px;text-align:left">
    <div class="ru-icon" style="text-align:center">${typeof gicon==="function"?gicon("transfer",52):""}</div>
    <div class="ru-eyebrow" style="text-align:center">升队调令 · 重签合同</div>
    <div class="ru-tier" style="font-size:21px;text-align:center;margin-bottom:12px">${
      typeof teamLogo==="function"?teamLogo(d.team,22):""} <b>${d.team}</b></div>
    <p class="note" style="margin:0 0 10px">一队${POSN[S.pos]} <b>${d.incumbent}</b> 让位。你的底气：
      综合压过对位 <b>${d.gap>0?"+":""}${d.gap}</b>${d.wr!==null?` · LDL 胜率 <b>${d.wr}%</b>`:""} · 本赛季场均评分 <b>${avgR}</b></p>
    <div class="grid g2" style="margin:10px 0">
      <div class="ver"><div class="k">新年薪</div><div class="v mono" style="font-size:20px;color:var(--gold-hi)">${d.salary}<small> 万/赛段</small></div></div>
      <div class="ver"><div class="k">新违约金</div><div class="v mono" style="font-size:20px">${d.buyout}<small> 万</small></div></div>
    </div>
    <div class="row" style="justify-content:center">
      <button class="btn" id="promoteok">签字上一队 →</button>
      ${d.asked?"":`<button class="btn ghost" id="promoteask">拿数据要更高（把握 ${(p*100).toFixed(0)}%）</button>`}
      <button class="btn ghost sm" id="promoteno">这窗口留在二队</button>
    </div>
    <p class="note" style="margin-top:8px">要价失败提案不变、经理不快；按下调令则下个窗口重新核查——
      <span style="color:var(--red)">一队的位置不会永远空着</span>。</p>
  </div></div>`;
}

/* ---------- 下放：一队替补去 LDL 打比赛 ----------
   现实里的通道：替补拿不到出场时间，俱乐部会把他注册到二队名单
   打 LDL 攒比赛——合同不变，人还是俱乐部的，打出来再调回来。
   没有这条，替补线就是死路：坐着，练，等，什么都发生不了。 */
function offerSendDown(){
  if((S.homeLeague||"LPL")!=="LPL") return false;
  if(S.promoted||!S.understudy||S.offerKind!=="sub") return false;
  const acad=(S.world.LDL||[]).find(t=>t.parent===S.team);
  if(!acad) return false;
  askConfirm("俱乐部想把你下放到二队",
    `一队首发还是 <b>${S.understudy.id}</b>，你在替补席上拿不到一场正赛。<br>
     经理的方案：注册到 <b>${acad.name}</b> 打 LDL——有比赛打、有数据看，
     打出来就调回一队。<b>合同不变。</b><br>
     <span class="note">留在一队也行：训练强度更高，但一场正赛都没有，热度会一直掉。</span>`,
    "去 LDL 打比赛", ()=>doSendDown(acad),
    {t:"留在一队等机会", fn:()=>{ pushEvent(`你拒绝了下放，选择留在 <b>${S.team}</b> 等机会。`,"info","青训"); render(); }},
    "senddown");
  return true;
}
function doSendDown(acad){
  const old=S.team;
  S.team=acad.name; S.homeLeague="LDL";
  S.offerKind="core"; S.promoted=true; S.understudy=null;
  const t=myTeam();
  t.players=t.players.map(q=>q.pos===S.pos
    ? {id:S.name||"你",cn:"",pos:S.pos,age:S.age,r:S.attrs,me:true} : q);
  if(typeof markTeamJoin==="function") markTeamJoin();   // 换了队，在队时长归零
  S.trust={}; if(typeof initTrust==="function") initTrust();
  if(typeof syncTrust==="function") syncTrust();
  if(typeof initRelations==="function") initRelations();
  S.rosterSig=myRoster().map(x=>x.id).sort().join("|");
  pushEvent(`你被注册到 <b>${acad.name}</b>（LDL）。从替补席到首发位——
    <b>比赛打起来，数据摆出来，一队的门才会再开。</b>`,"big","青训");
  if(typeof txNote==="function") txNote(`${old} → <b>${acad.name}</b>（下放 LDL 打比赛）`);
  render();
}

/* ---------- 升队通道卡：条件全部摆在明面上 ---------- */
function promoteCard(){
  if((S.homeLeague||"LPL")!=="LDL") return "";
  const pname=parentClub(); if(!pname) return "";
  const pt=(S.world.LPL||[]).find(t=>t.name===pname); if(!pt) return "";
  const inc=pt.players.find(q=>q.pos===S.pos);
  const me=avg(DIMS.map(d=>S.attrs[d])), him=inc?avg(DIMS.map(d=>inc.r[d])):0;
  const g=S.record?(S.record.w+S.record.l):0, wr=g>=3?(S.record.w/g):null;
  const ok1=me>=him+1;
  return `<div class="card"><h2>升队通道<em>母队 ${typeof teamLogo==="function"?teamLogo(pname,18):""} ${pname}</em></h2>
    <p class="note" style="margin:0 0 10px">合同签给的是俱乐部，你现在注册在二队名单。
      升队窗口：<b>季中间歇</b> 和 <b>休赛期</b>——到点自动核查，达标就调上去。<br>
      <span style="color:var(--ink-3)">评分口径：65＝LPL 平均（王者线），77+ 是国服前十的明星，88+ 天梯已经量不动。</span></p>
    <div class="attrs">
      <div class="at wide"><div class="lb">你</div>
        <div class="track"><div class="fill" style="width:${clamp(me,0,100)}%"></div></div>
        <div class="vn mono"><b>${me.toFixed(1)}</b></div></div>
      <div class="at wide"><div class="lb">一队${POSN[S.pos]}</div>
        <div class="track"><div class="fill" style="width:${clamp(him,0,100)}%;background:var(--bar-2)"></div></div>
        <div class="vn mono"><b>${him.toFixed(1)}</b>${inc?(typeof avatarOf==="function"?avatarOf(inc,20):"")+`<span class="pname">${inc.id.slice(0,9)}</span>`:"—"}</div></div>
    </div>
    <p class="note">升队条件（满足其一）：<br>
      ① 综合压过一队对位 1 分——${ok1?'<b style="color:var(--cyan)">已达成，等下个窗口</b>':`还差 <b>${(him+1-me).toFixed(1)}</b> 分`}<br>
      ② 差距 3 分以内 且 本赛段胜率 ≥75%——${
        me>=him-3?(wr===null?"数值达标，本赛段还没打满 3 场"
          :wr>=0.75?'<b style="color:var(--cyan)">已达成，等下个窗口</b>'
          :`数值达标，但胜率 ${(wr*100).toFixed(0)}% 还不够`)
        :"数值还差得多，先练"}</p></div>`;
}

/* ================= 七、「转会」独立成栏 =================
   2026-08-31 玩家拍板：试训邀请、报价、主动挂牌、主动接触、合同与违约金
   全部收进一个栏目。赛段中只收意向，注册窗（季中 + 年底）生效——
   「我不可能在一个次级队伍待满一年才能走」。 */

/* 生涯轨迹：每次换队记一笔 */
function txNote(text){
  S.txLog = (S.txLog||[]).concat([{ s: SEASONS[S.si]?SEASONS[S.si].tag:"", text }]);
  if(S.txLog.length>12) S.txLog.shift();
}

/* ---------- 主动接触：点名一支队自荐 ---------- */
function approachKey(){ return S.si + "-" + (S.split||0); }
function canApproach(){
  if(!S.career||!S.team) return {ok:false,why:"还没签约"};
  if(S.approachKey===approachKey()) return {ok:false,why:"这个赛段已经接触过一家了——太频繁经纪人也张不开口"};
  if(S.proOffer||S.deal||S.tryout) return {ok:false,why:"手上还有没谈完的事"};
  if((S.ap||0)<=0) return {ok:false,why:"要花 1 个行动点"};
  return {ok:true};
}
/* 可以去接触谁：LDL 选手向上够 LPL，一线选手够同联赛的其他队 */
/* 主动接触的联赛筛选（玩家点名：加入 LCK 也要能接触其他赛区）。
   原来只列本联赛，而且 clubStanding 只认 LPL——身在 LCK 时全员
   查无此队、被兜底成「中游 3%」（T1 都是中游，玩家截图抓的）。
   现在：任意主联赛可选，档位按该联赛内战力排位分（前 25% 豪门、
   65% 中游、其余弱队，与 pickClub 同一把尺）。 */
function approachLeagues(){
  const HL=(S.homeLeague||"LPL")==="LDL"?"LPL":(S.homeLeague||"LPL");
  const all=Object.keys(S.world||{}).filter(k=>k!=="LDL"&&(S.world[k]||[]).length);
  return [HL].concat(all.filter(k=>k!==HL));
}
function approachTargets(lgPick){
  const lgs=approachLeagues();
  let lg = lgPick || S.txLgPick || lgs[0];
  if(!lgs.includes(lg)) lg=lgs[0];
  const rows=(S.world[lg]||[]).map(t=>({t,p:power(t)})).sort((a,b)=>b.p-a.p);
  const n=rows.length;
  const out=[];
  rows.forEach((x,i)=>{
    if(x.t.name===S.team) return;
    const pos=i+1;
    const tier = pos<=Math.max(1,Math.round(n*0.25))?"top":pos<=Math.round(n*0.65)?"mid":"low";
    out.push({ team:x.t.name, tier, league:lg });
  });
  return out;
}
function approachOdds(tier){
  const perf = proPerf() - buyoutDrag()*2;
  const cl = (typeof cloutOf==="function") ? cloutOf() : 40;
  const prem = { top:0.22, mid:0.10, low:0.02 }[tier] || 0.1;
  return clamp(0.16 + perf*0.028 + (cl-40)/240 - prem, 0.03, 0.80);
}
function approachTeam(name){
  const c = canApproach(); if(!c.ok) return;
  const tg = approachTargets().find(t=>t.team===name); if(!tg) return;
  S.ap--; S.approachKey = approachKey();
  const p = approachOdds(tg.tier);
  const fee = S.freeAgent ? 0 : ((S.contract&&S.contract.buyout)||0);
  /* 结果必须弹出来（玩家原话：只在世界日志里写一行，根本不知道发生了什么）。
     复用际遇结果卡：它是遮罩，躲不开。 */
  if(rnd() >= p){
    const why = fee>500 && rnd()<0.5
      ? `你的违约金（${fee} 万）把他们劝退了`
      : rnd()<0.5 ? `他们这个位置刚续约，暂时不动` : `他们想先看看你接下来几场的比赛`;
    pushEvent(`经纪人去接触了 <b>${name}</b>——对方婉拒：${why}。<br>
      <span style="color:var(--ink-3)">自荐被拒不丢人，丢人的是数据。继续打。</span>`,"info","转会");
    S.rndResult = { choice:`主动接触 · ${name}`,
      txt:`对方<b>婉拒</b>了：${why}。<br><span style="color:var(--ink-3)">自荐被拒不丢人，丢人的是数据。继续打。</span>`,
      diff:[{n:"结果",v:"婉拒",good:false},{n:"行动点",v:"-1",good:false}] };
    render(); return;
  }
  if(typeof txWindowOpen==="function" && txWindowOpen()){
    // 窗口开着：当场进入正式问询流程
    S.proOffer = { team:tg.team, tier:tg.tier, league:tg.league,
                   perf:Math.round(proPerf()), direct:false, buyout:fee, asked:true };
    pushEvent(`经纪人去接触了 <b>${name}</b>——<b>他们愿意谈</b>。注册窗开着，现在就能走流程。`,"big","转会");
    S.rndResult = { choice:`主动接触 · ${name}`,
      txt:`<b>他们愿意谈。</b>注册窗开着，正式问询已经摆上桌——接下来走试训/谈约流程。`,
      diff:[{n:"结果",v:"愿意谈",good:true},{n:"正式问询",v:name,good:true}] };
  } else {
    S.txIntents = (S.txIntents||[]).filter(x=>x.team!==tg.team);
    S.txIntents.push({ team:tg.team, tier:tg.tier, si:S.si, league:tg.league, asked:true });
    pushEvent(`经纪人去接触了 <b>${name}</b>——<b>他们有兴趣</b>，但赛段中不能转会。<br>
      意向记进了「转会」栏，注册窗一开就谈。`,"big","转会");
    S.rndResult = { choice:`主动接触 · ${name}`,
      txt:`<b>他们有兴趣。</b>赛段中不能转会——意向已记进「转会」栏，
        下个注册窗（季中间歇 / 年底休赛期）当场见分晓：要么递表，要么作废。`,
      diff:[{n:"结果",v:"有兴趣",good:true},{n:"意向",v:"已入册",good:true}] };
  }
  render();
}

/* ---------- 「转会」页 ---------- */
function transferPage(){
  if(!S.career||!S.team) return `<div class="card"><h2>转会</h2>
    <p class="note">还没上岸。先签下第一份职业合同，这一页才有内容。</p></div>`;
  const c = S.contract||{};
  const fee = c.buyout||0;
  const drag = buyoutDrag();
  const wnd = txWindowOpen();
  const perf = proPerf();
  const intents = (S.txIntents||[]).filter(x=>x.si>=S.si-1);
  const ca = canApproach();
  const targets = approachTargets();
  /* 我的合同 */
  const contract = `<div class="card"><h2>我的合同<em>${S.team}</em></h2>
    <div class="grid g2" style="margin:10px 0">
      <div class="ver"><div class="k">年薪</div><div class="v mono" style="font-size:20px;color:var(--gold-hi)">${c.salary!==undefined?c.salary:"—"}<small> 万/赛段</small></div></div>
      <div class="ver"><div class="k">剩余</div><div class="v mono" style="font-size:20px">${c.left!==undefined?c.left:"—"}<small> 赛段</small></div></div>
      <div class="ver"><div class="k">违约金</div><div class="v mono" style="font-size:20px">${fee}<small> 万</small></div></div>
      <div class="ver"><div class="k">本赛段表现分</div><div class="v mono" style="font-size:20px">${perf.toFixed(0)}</div></div>
    </div>
    <p class="note">${fee?`违约金 <b>${fee} 万</b>：买你的队要付这笔钱。它现在拉低你的市场吸引力约
      <b style="color:${drag>4?'var(--red)':'var(--ink-2)'}">${drag.toFixed(1)} 分</b>（主动求走时加倍）。
      太高的话，评级再好对面也可能付不起——续约时可以谈低，或者自己买断。`
      :`这份合同没有违约金条款——想走的时候没人拦得住你。`}</p></div>`;
  const tiers = tierCard();
  /* 收到的意向 */
  const intentRows = intents.length ? intents.map(x=>`<tr>
      <td>${typeof teamLogo==="function"?teamLogo(x.team,18):""}${x.team}${x.asked?'<span class="tag">你去接触的</span>':""}</td>
      <td>${CLUB_TIERS[x.tier]?CLUB_TIERS[x.tier].n:x.tier}${x.league&&x.league!=="LPL"?` · ${x.league}`:""}</td>
      <td class="n">${SEASONS[x.si]?SEASONS[x.si].tag:""}</td></tr>`).join("") : "";
  const intentCard = `<div class="card"><h2>转会意向<em>${wnd?txWindowName()+" · 开着":"注册窗未开"}</em></h2>
    ${intents.length?`<div class="tw"><table>
      <thead><tr><th>战队</th><th>档次</th><th>记录于</th></tr></thead>
      <tbody>${intentRows}</tbody></table></div>
      <p class="note">${wnd?"窗口开着——这些意向会在近期兑现成正式问询。"
        :"赛段中不能转会。这些队在等注册窗（季中间歇 / 年底休赛期）——<b>窗一开当场见分晓</b>：要么递表，要么作废，不会一直挂着。"}</p>`
      :`<p class="note">目前没有在桌上的意向。${perf>=10?"你的表现有人在看，赛段里就会有俱乐部来问。":"先把表现分打上去——没有数据，谁也不会来。"}</p>`}
    ${S.txWndNote?`<p class="note" style="color:var(--ink-3)">上个${S.txWndNote.w}（${SEASONS[S.txWndNote.si]?SEASONS[S.txWndNote.si].tag:""}）：${S.txWndNote.txt}</p>`:""}
    ${S.proOffer?`<p class="note" style="color:var(--gold)">有一份正式问询等你处理（见弹窗/本周页）。</p>`:""}</div>`;
  /* 主动行动 */
  const askC = canAskTransfer(), p = askTransferOdds();
  const buyC = (typeof canBuyout==="function") ? canBuyout() : {ok:false,why:""};
  const actions = `<div class="card"><h2>主动行动</h2>
    <div class="grid g2">
      <button class="act" id="askTransfer" ${(!askC.ok||S.ap<=0)?'disabled style="opacity:.4"':''}>
        <div class="t">主动挂牌</div>
        <div class="d">${askC.ok
          ?`让经纪人放消息说你想走。有人接的把握 <b style="color:${p>=0.5?'var(--cyan)':p>=0.25?'var(--gold)':'var(--red)'}">${(p*100).toFixed(0)}%</b><br>
            <span style="color:var(--red)">经理会不高兴；没人接的话，更衣室也会知道你想走</span>`
          :`🔒 ${askC.why}`}</div></button>
      <button class="act" id="doBuyout" ${(!buyC.ok||S.ap<=0)?'disabled style="opacity:.4"':''}>
        <div class="t">买断合同</div>
        <div class="d">${buyC.ok
          ?`自己掏 <b style="color:var(--gold)">${fee} 万</b>解约，立刻成为自由身。<br>
            <span style="color:var(--red)">经理 −18、教练 −10，全队信任 −12</span>`
          :`🔒 ${buyC.why}`}</div></button>
    </div>
    <h3 style="font-size:13px;color:var(--ink-3);margin:16px 0 8px">主动接触<span style="font-weight:400">每赛段 1 次 · 花 1 个行动点${ca.ok?"":` · 🔒 ${ca.why}`}</span></h3>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin:0 0 10px">${approachLeagues().map(l=>{
      const on=l===(S.txLgPick||approachLeagues()[0]);
      return `<button class="btn ghost sm" data-txlg="${l}" ${on?'style="border-color:var(--gold);color:var(--gold)"':''}>${l}</button>`;
    }).join("")}</div>
    <div class="grid g5">${targets.map(t=>{
      const po = approachOdds(t.tier);
      return `<button class="act" data-approach="${t.team}" ${!ca.ok?'disabled style="opacity:.4"':''}
        title="把握 ${(po*100).toFixed(0)}%">
        <div class="t">${typeof teamLogo==="function"?teamLogo(t.team,16):""}${t.team}</div>
        <div class="d">${CLUB_TIERS[t.tier]?CLUB_TIERS[t.tier].n:""} · 期望 ${CLUB_TIERS[t.tier]?CLUB_TIERS[t.tier].expect:"—"} · ${(po*100).toFixed(0)}%</div></button>`;
    }).join("")}</div>
    <p class="note">你的综合 <b>${tryoutSkill().toFixed(0)}</b>、本赛段表现分 <b>${perf.toFixed(0)}</b>。全赛区都能接触——点上面的赛区标签切换名单，档位按该联赛内的真实排位分。
      被拒绝会给理由（位置刚续约 / 违约金劝退 / 还想再看看）。成功 = 对方有兴趣：
      窗口开着就当场谈，赛段中先记意向；跨赛区谈成就是出海。</p></div>`;
  /* 轨迹 */
  const log = (S.txLog&&S.txLog.length)?`<div class="card"><h2>生涯轨迹</h2>
    <div class="log">${S.txLog.slice().reverse().map(x=>`<div><span class="hi">${x.s}</span> ${x.text}</div>`).join("")}</div></div>`:"";
  const rules = `<p class="note" style="margin:4px 2px 0">规则：赛段中可以收意向、可以被接触，但<b>转会只在注册窗生效</b>——
    季中间歇（春→夏）和年底休赛期。LDL 注册的选手走升队通道随时可被母队调上一队。</p>`;
  const scout = (typeof scoutCard==="function")?scoutCard():"";
  return contract + tiers + scout + intentCard + actions + log + rules;
}

/* ---------- 职业前的「转会」页（2026-09-02 玩家点名）----------
   还没上岸这一页也在：看得到谁能看到你（关注度阶梯），
   也能毛遂自荐——把简历投给俱乐部。成功率很低，但门是开的。 */
function selfRecOdds(tier){
  const base={acad:0.15,low:0.08,mid:0.035,top:0.012}[tier]||0.05;
  const T=CLUB_TIERS[tier], me=tryoutSkill();
  let p=base + Math.min(exposureScore(),240)*0.0009 + clamp((me-T.expect)*0.012,-0.05,0.10);
  if(!inviteFloorOk()) p*=0.35;   // 宗师不到、履历空白：简历大多石沉大海
  return clamp(p,0.01,0.45);
}
function canSelfRec(){
  const P=S.pre; if(!P) return {ok:false,why:"已经是职业选手了"};
  if(P.invite&&P.invite.pending) return {ok:false,why:"手上已有一份试训邀请，先处理它"};
  if(typeof activeCups==="function"&&activeCups().length) return {ok:false,why:"正在打杯赛——打完这届再投"};
  if(P.selfRecCd&&P.week<P.selfRecCd) return {ok:false,why:`刚投过一轮，第 ${P.selfRecCd} 周起可再投`};
  if((P.ap||0)<=0) return {ok:false,why:"本周行动点用完了"};
  return {ok:true};
}
function selfRecommend(tier){
  const c=canSelfRec(); if(!c.ok) return;
  const P=S.pre, T=CLUB_TIERS[tier];
  P.ap--; P.selfRecCd=P.week+2;
  const p=selfRecOdds(tier);
  if(rnd()<p){
    const team=pickClub(tier);
    if(team){
      P.invite={tier,team,league:null,reason:"毛遂自荐",pending:true,week:P.week,expect:T.expect};
      P.inviteN=(P.inviteN||0)+1;
      preLog(`你把集锦和战绩打包发给了几家${T.n}俱乐部——<b>${team}</b> 回了消息：<b>来试训吧。</b>`,"big");
      S.rndResult={choice:`毛遂自荐 · ${T.n}`,
        txt:`<b>${team}</b> 回复了：愿意给你一次试训机会。<br>
          <span style="color:var(--ink-3)">机会只有一次——试训场上见真章。</span>`,
        diff:[{n:"结果",v:"获得试训",good:true},{n:"行动点",v:"-1",good:false}]};
    }
  }else{
    const why=!inviteFloorOk()?"段位不到宗师、比赛履历也还空白——没人打开你的附件"
      :exposureScore()<45?"圈内关注度太低，简历排在几百份后面"
      :"这几家最近不缺人。数据再涨涨，或者等俱乐部自己找上门";
    preLog(`你把简历投给了几家${T.n}俱乐部——没有回音。${why}。`,"info");
    S.rndResult={choice:`毛遂自荐 · ${T.n}`,
      txt:`没有回音。${why}。<br><span style="color:var(--ink-3)">两周后可以再投一轮。</span>`,
      diff:[{n:"结果",v:"石沉大海",good:false},{n:"行动点",v:"-1",good:false}]};
    if(rnd()<0.3) P.scoutSeen=(P.scoutSeen||0)+1;   // 投出去的简历不是全无痕迹
  }
  if(typeof render==="function") render();
}
function preTransferPage(){
  const P=S.pre; if(!P) return "";
  const expo=exposureScore();
  const ladder=[[45,"青训教练看得到你"],[110,"中游俱乐部看得到你"],[190,"豪门看得到你"]];
  const expCard=`<div class="card"><h2>圈内关注度<em>${Math.round(expo)}</em></h2>
    <div class="tw"><table><tbody>${ladder.map(([at,txt])=>`<tr>
      <td class="n">${at}</td><td>${txt}</td>
      <td class="n" style="color:${expo>=at?'var(--cyan)':'var(--ink-3)'}">${expo>=at?"✓ 已达到":"未达到"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note">关注度＝名气 + 杯赛走多深 + 打过多少场有人看的比赛。
      周报报不报你、哪一档俱乐部来找你，都看这个数；段位（${typeof rankFull==="function"?rankFull(P.rank):P.rank}）是另一把尺子——值不值得看。</p></div>`;
  const c=canSelfRec();
  const recCard=`<div class="card"><h2>毛遂自荐<em>每两周一轮 · 花 1 行动点</em></h2>
    ${c.ok?"":`<p class="note" style="color:var(--red)">🔒 ${c.why}</p>`}
    <div class="grid g2">${TIER_ORDER.slice().reverse().map(k=>{const T=CLUB_TIERS[k],p=selfRecOdds(k);
      return `<button class="act" data-selfrec="${k}" ${c.ok?"":'disabled style="opacity:.4"'}>
        <div class="t">${T.n}</div>
        <div class="d">期望 ${T.expect}（你 ${tryoutSkill().toFixed(0)}）· 段位 ${typeof rankName==="function"?rankName(TIER_RANK[k]):TIER_RANK[k]} · 回信率 <b style="color:${p>=0.2?'var(--cyan)':p>=0.08?'var(--gold)':'var(--red)'}">${(p*100).toFixed(0)}%</b></div></button>`;}).join("")}</div>
    <p class="note">没上岸也可以敲门：把排位战绩和杯赛集锦发过去。回信率看关注度、段位和你离这一档期望的差距——很低，但不是零。
      ${P.invite&&P.invite.pending?`<br><b style="color:var(--gold)">手上有一份 ${P.invite.team} 的试训邀请（回「本周」页处理）。</b>`:""}</p></div>`;
  const rules=`<p class="note" style="margin:4px 2px 0">外赛区规则：外赛区<b>一线队</b>的教练组会看城市争霸赛和主播杯——走得深可能收到跨国邀请（VCS/PCS 这些缺人的赛区来得最勤）；
    外赛区的<b>次级联赛不会跨国发邀请</b>。签约后这一页换成职业版：意向、挂牌、买断、主动接触。</p>`;
  return tierCard()+expCard+recCard+rules;
}
