/* ================= 成就系统 =================
   框架先搭起来，条目可以持续往里加。
   每条成就：id / 名字 / 描述 / 触发条件 / 奖励。
   奖励是即时正反馈——回体力、涨士气、发奖金，让「第一次」有分量。

   梗成就的写法约定：只写玩家自己做了什么，不给真人扣人设。
   圈内人看得懂，但不会变成对某个选手的负面描写。                    */

const ACH_REWARD_TXT={fat:"体力",money:"奖金",trust:"士气",fame:"名气"};

const ACHIEVEMENTS=[
  /* ---------- 里程碑 ---------- */
  {id:"signed", n:"上岸", d:"签下第一份职业合同。", tag:"里程碑",
   on:"sign", cond:()=>true, r:{fat:-25,fame:8}},
  {id:"debut", n:"首秀", d:"打上职业生涯的第一场正式比赛。", tag:"里程碑",
   on:"match", cond:()=>((S.career||{}).w||0)+((S.career||{}).l||0)<=3, r:{fat:-15,trust:4}},
  {id:"starter", n:"拿到首发", d:"从替补席上把首发位抢了过来。", tag:"里程碑",
   on:"promote", cond:()=>true, r:{fat:-30,fame:14,trust:8}},
  {id:"firstwin", n:"第一场胜利", d:"职业生涯的第一个胜场。", tag:"里程碑",
   on:"win", cond:()=>((S.career||{}).w||0)<=2, r:{fat:-18,trust:5}},
  {id:"playoff", n:"季后赛", d:"第一次打进季后赛。", tag:"里程碑",
   on:"playoff", cond:()=>true, r:{fat:-25,money:40}},
  {id:"lgtitle", n:"联赛冠军", d:"第一次捧起联赛奖杯。", tag:"里程碑",
   on:"lgtitle", cond:()=>true, r:{fat:-45,money:100,fame:40,trust:14}},   // 奖金制度上线后减半：冠军的钱走奖金表，这里只是首冠纪念
  {id:"intl", n:"走出国门", d:"第一次站上国际赛场。", tag:"里程碑",
   on:"intl", cond:()=>true, r:{fat:-30,fame:26}},
  {id:"msi", n:"MSI 冠军", d:"拿下季中冠军赛。", tag:"里程碑",
   on:"msi", cond:()=>true, r:{fat:-60,money:260,fame:110,trust:20}},
  {id:"worlds", n:"世界冠军", d:"你把那座奖杯举起来了。", tag:"里程碑",
   on:"worlds", cond:()=>true, r:{fat:-80,money:600,fame:260,trust:26}},

  /* ---------- 战绩 ---------- */
  {id:"reverse", n:"让二追三", d:"在 BO5 里先丢两局，然后连扳三局。", tag:"战绩",
   on:"match", cond:(c)=>c.bo5&&c.won&&c.lostFirstTwo, r:{fat:-35,fame:45,trust:12}},
  {id:"upset", n:"以下克上", d:"击败一支纸面实力明显更强的队伍。", tag:"战绩",
   on:"match", cond:(c)=>c.won&&c.gap<=-4, r:{fat:-20,fame:22}},
  {id:"sweep", n:"横扫", d:"一局不丢地拿下一个系列赛。", tag:"战绩",
   on:"match", cond:(c)=>c.won&&c.oppScore===0&&c.myScore>=2, r:{trust:8,fame:12}},
  {id:"revenge", n:"这笔账算平了", d:"击败一个把你淘汰过的对手。", tag:"战绩",
   on:"revenge", cond:()=>true, r:{fat:-25,fame:30,trust:10}},
  {id:"beatlck", n:"抗韩成功", d:"在国际赛场上击败一支 LCK 队伍。", tag:"战绩",
   on:"beatlck", cond:()=>true, r:{fat:-30,fame:60,trust:12}},

  /* ---------- 成长 ---------- */
  {id:"maxdim", n:"练到头了", d:"有一项属性达到了天赋允许的上限。", tag:"成长",
   on:"train", cond:()=>DIMS.some(d=>S.attrs[d]>=capOf(d)-0.01), r:{fame:10}},
  {id:"top10", n:"国服前十", d:"排位打进国服前十。", tag:"成长",
   on:"rank", cond:()=>S.pre&&S.pre.rank>=95, r:{fame:35,money:60}},
  {id:"fullgear", n:"装备到位", d:"五个槽位全部升到定制级。", tag:"成长",
   on:"gear", cond:()=>SLOTS.every(s=>(S.gear&&S.gear[s.k])===3), r:{fat:-20,fame:18}},
  {id:"polyglot", n:"语言不是问题", d:"韩语和英语都修完了。", tag:"成长",
   on:"course", cond:()=>hasCourse("kr")&&hasCourse("en"), r:{trust:12}},

  /* ---------- 圈内梗（只写你自己，不写真人） ---------- */
  {id:"jungle_gospel", secret:true, n:"我怎么去啊", tag:"梗",
   d:"打野位，队伍连败但你的参团率一点不低——复盘会上你说了那句所有打野都说过的话。",
   on:"match", cond:(c)=>S.pos==="jng"&&!c.won&&S.record.l>=2&&c.gap>=-2,
   flavor:"「下路一直叫我去，别人一直进我野区，我怎么去啊？」",
   r:{fat:-15,trust:-3,fame:20}},

  {id:"world_no1_top", secret:true, n:"世一上", tag:"梗",
   d:"上单位，队伍输了，但你对位没输——当晚你在微博上写下三个字。",
   on:"match", cond:(c)=>S.pos==="top"&&!c.won&&c.laneWon,
   flavor:"「世一上。」评论区吵了一整夜。",
   r:{fame:34,trust:-4}},

  {id:"faker_stare", secret:true, n:"被注视", tag:"梗",
   d:"在国际赛场上对位过那个所有中单都要面对的名字。",
   on:"match", cond:(c)=>S.pos==="mid"&&c.intl&&c.oppLeague==="LCK",
   flavor:"赛后握手的时候，你想起了十年前在电视上看他的那个下午。",
   r:{fat:-18,fame:26}},

  {id:"lpl_civil", n:"内战无强敌", tag:"梗",
   d:"国际赛场上把另一支 LPL 队伍送回了家。",
   on:"match", cond:(c)=>c.intl&&c.won&&c.oppLeague===(S.homeLeague||"LPL"),
   flavor:"弹幕齐刷刷：内战无强敌，外战无……算了不说了。",
   r:{fame:18,trust:-2}},

  {id:"gift_rain", secret:true, n:"榜一大哥", tag:"梗",
   d:"一场直播的礼物收入超过了你半个赛段的薪水。",
   on:"stream", cond:()=>streamIncome()>=salaryOf()*0.5,
   flavor:"榜一大哥在公屏上打了一行字：别打职业了，直播吧。",
   r:{money:60,fame:14}},

  {id:"zero_ten", secret:true, n:"零杀十死也能赢", tag:"梗",
   d:"个人数据难看到不忍直视，但这把还是赢了。",
   on:"match", cond:(c)=>c.won&&c.nodeFails>=2,
   flavor:"赛后采访你说：赢了就行。",
   r:{trust:6,fame:10}},

  {id:"never_give_up", n:"从不放弃", tag:"梗",
   d:"在一个赛段里打出过至少三次逆风翻盘。",
   on:"match", cond:(c)=>c.won&&(S.comebacks||0)>=3,
   flavor:"解说已经喊哑了。",
   r:{fat:-25,fame:28,trust:8}}
];

/* ---------- 引擎 ---------- */
function initAch(){ S.ach={}; S.achLog=[]; }
function hasAch(id){ return !!(S.ach&&S.ach[id]); }

function applyAchReward(r){
  if(!r) return [];
  const out=[];
  if(r.fat){ addFat(r.fat); out.push(`体力 +${-r.fat}`); }
  if(r.money){ if(typeof addMoney==="function") addMoney("ach",r.money); else S.money+=r.money;
    out.push(`奖金 ${r.money} 万`); }
  if(r.fame){ addFans(r.fame); out.push(`名气 +${r.fame}`); }
  if(r.trust&&typeof addTrustAll==="function"){ addTrustAll(r.trust); out.push(`士气 ${r.trust>0?"+":""}${r.trust}`); }
  return out;
}

/* ctx 给条件用：{won, bo5, myScore, oppScore, gap, intl, oppLeague, laneWon, nodeFails, lostFirstTwo} */
/* 扩充条目在 achieve_more.js，构建时拼进来 */
if(typeof ACH_MORE!=="undefined") ACHIEVEMENTS.push(...ACH_MORE);

let queueAchCheck=false;
function checkAch(on,ctx){
  if(!S.ach) initAch();
  ctx=ctx||{};
  ACHIEVEMENTS.forEach(a=>{
    if(a.on!==on||hasAch(a.id)) return;
    let ok=false;
    try{ ok=a.cond(ctx); }catch(e){ ok=false; }
    if(!ok) return;
    S.ach[a.id]=1;
    const gains=applyAchReward(a.r);
    S.achLog=(S.achLog||[]).concat([{id:a.id,n:a.n,s:SEASONS[S.si]?SEASONS[S.si].tag:""}]);
    if(on!=="ach") setTimeout?0:0;   // 占位，避免递归
    if(on!=="ach") queueAchCheck=true;
    pushEvent(`<b>成就解锁 · ${a.n}</b>　${a.d}${a.flavor?`<br><span style="color:var(--gold)">${a.flavor}</span>`:""}${
      gains.length?`<br><span style="color:var(--cyan)">${gains.join(" · ")}</span>`:""}`,"big","成就");
    // 光写进大事记不够——解锁的那一下要被看见。
    // 可能一次解锁好几个，所以排队一个个弹。
    S.achPop=(S.achPop||[]).concat([{n:a.n,d:a.d,flavor:a.flavor||"",tag:a.tag,gains}]);
  });
}

/* ---------- 界面 ---------- */
/* 解锁弹窗。多个同时达成就排队，点一下弹下一个。 */
function achPopCard(){
  const q=S.achPop; if(!q||!q.length) return "";
  const a=q[0];
  return `<div class="rankup"><div class="ru-inner" style="max-width:420px">
    <div class="ru-icon">${typeof gicon==="function"?gicon("ach",52):""}</div>
    <div class="ru-eyebrow">成就解锁${q.length>1?`　（还有 ${q.length-1} 个）`:""}</div>
    <div class="ru-tier" style="font-size:26px">${a.n}</div>
    <div class="ru-txt">${a.d}${a.flavor?`<br><span style="color:var(--gold)">${a.flavor}</span>`:""}</div>
    ${a.gains&&a.gains.length?`<div class="evres">${a.gains.map(g=>
      `<span class="er up">${g}</span>`).join("")}</div>`:""}
    <div class="row" style="justify-content:center">
      <button class="btn" id="achpopok">${q.length>1?"下一个 →":"知道了"}</button>
    </div></div></div>`;
}
function achCard(){
  const got=ACHIEVEMENTS.filter(a=>hasAch(a.id));
  const byTag={};
  ACHIEVEMENTS.forEach(a=>{ (byTag[a.tag]=byTag[a.tag]||[]).push(a); });
  return `<div class="card"><h2>成就<em>${got.length} / ${ACHIEVEMENTS.length}</em></h2>
    ${Object.keys(byTag).map(t=>`
      <h3 style="font-size:13px;color:var(--ink-3);margin:14px 0 8px">${t}</h3>
      <div class="achgrid">${byTag[t].map(a=>{
        const on=hasAch(a.id);
        // 没解锁的也要写清条件——全打问号，玩家根本不知道往哪使劲。
        // 只留 secret 那几条当彩蛋。
        const hide=!on&&a.secret;
        return `<div class="ach ${on?'on':''}" title="${hide?'彩蛋，自己撞上去':a.d}">
          <div class="an">${hide?"？？？":a.n}</div>
          <div class="ad">${hide?"藏起来的，自己撞上去":a.d}</div>
          ${on&&a.flavor?`<div class="af">${a.flavor}</div>`:""}
        </div>`}).join("")}</div>`).join("")}
    <p class="note">解锁成就会立刻给到回报——回体力、涨士气或者发奖金。<b>「第一次」值得被记住。</b><br>
      打问号的是彩蛋，剩下的条件都写在上面——想拿就照着去做。</p>
  </div>`;
}


/* 解锁之后再查一遍「解锁 N 项」这类成就 */
const _origCheckAch=checkAch;
checkAch=function(on,ctx){
  _origCheckAch(on,ctx);
  if(queueAchCheck){ queueAchCheck=false; _origCheckAch("ach",{}); }
};
