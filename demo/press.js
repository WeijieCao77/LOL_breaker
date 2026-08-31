/* ================= 世界的回声 =================
   2026-08-31 竞品拆解（无畏人生模拟器）拍板移植的机制层，内容全部 LOL 背景：
   · 事件链——选择产生带倒计时的后续，到期兑现，不再选完就蒸发
   · 天梯撞车——排位里撞到真实职业选手，打排位变成抽卡
   · 宿敌记账——赢下带明星选手的队伍要被记住（成就在 achieve_more）
   · 电竞周报——每隔几周把真实发生的事编辑成一期报纸，证据驱动，不虚构
   · 球探观察卡——把「谁在看你、看了多少、多确信」画出来 */

/* ---------- 一、事件链 ----------
   评价过的竞品做法：后续事件带倒计时挂着、不会消失、到期自动兑现。
   我们的版本故意做成非阻塞：到期直接结算并进大事记（机器人和托管都不会被卡住），
   「悬而未决」列表挂在世界页，让玩家知道有事在路上。 */
const FOLLOWUPS={
  actorCase:{
    n:"演员举报复核",
    run(p){
      if(rnd()<0.62){
        const back=p&&p.rr?p.rr:2;
        if(S.pre&&typeof S.pre.rank==="number") S.pre.rank=clamp(S.pre.rank+back*0.5,0,100);
        pushEvent(`<b>演员案件复核通过</b>：那一局的对手被判定消极比赛，账号已封禁。
          平台返还了你的段位分。<span style="color:var(--ink-3)">举报是有用的——偶尔。</span>`,"good","排位");
      }else{
        pushEvent(`演员举报的复核结果出来了：<b>证据不足，维持原判</b>。
          <span style="color:var(--ink-3)">那把的分，就当喂了狗。</span>`,"info","排位");
      }
    }
  },
  rumorSpread:{
    n:"转会流言发酵",
    run(p){
      const t=p&&p.team?p.team:"几家俱乐部";
      S.heat=(S.heat||0)+14;
      pushEvent(`当初看台上那一幕被拍到了——<b>「${t} 有意 ${meName()}」上了话题榜</b>。
        热度涨了，经理的脸色没那么好看。`,"info","转会");
      if(typeof addStaff==="function") addStaff("mgr",-2);
    }
  },
  lockerEcho:{
    n:"更衣室的回声",
    run(p){
      const who=(p&&p.who)||"队友";
      if(p&&p.good){
        if(typeof addTrustAll==="function") addTrustAll(2);
        if(typeof trustOf==="function"&&typeof S.trust==="object"&&S.trust[who]!==undefined)
          S.trust[who]=q1(clamp(S.trust[who]+4,0,100));
        pushEvent(`<b>${who}</b> 记着那天更衣室里你的做法——训练赛里他开始主动配合你的节奏，
          这种事队里人都看在眼里。<span style="color:var(--cyan)">全队信任 +2，${who} +4</span>`,"good","更衣室");
      }else{
        if(typeof addTrustAll==="function") addTrustAll(-2);
        pushEvent(`那天你在更衣室的做法，<b>${who}</b> 私下跟别人提过——气氛有点变了。
          <span style="color:var(--red)">全队信任 −2</span>`,"bad","更衣室");
      }
    }
  },
  bigTalk:{
    n:"赛后狠话的回旋镖",
    run(p){
      const opp=p&&p.opp?p.opp:"对手";
      if((S.record&&S.record.l||0)>=2){
        S.heat=(S.heat||0)+10;
        pushEvent(`两周前你赛后放的狠话被翻出来了——你们最近战绩不好，
          <b>「${opp} 记得你说过的话」</b>成了弹幕热梗。压力给到你这边。`,"bad","舆论");
      }else{
        addFans(6);
        pushEvent(`你赛后那句狠话被剪进了赛区宣传片——<b>说到做到的人，说话就是有分量。</b>`,"good","舆论");
      }
    }
  }
};
function queueFollowUp(id,weeks,payload){
  if(!FOLLOWUPS[id]) return;
  S.pendingEv=(S.pendingEv||[]);
  S.pendingEv.push({id,due:(S.evClock||0)+Math.max(1,weeks),p:payload||null});
  if(S.pendingEv.length>8) S.pendingEv.shift();
}
/* 每个游戏周走一格。所有「下一周」入口都调它（nextWeek/offNextWeek/preNextWeek）。 */
function tickFollowUps(){
  S.evClock=(S.evClock||0)+1;
  if(!S.pendingEv||!S.pendingEv.length) return;
  const due=S.pendingEv.filter(x=>x.due<=S.evClock);
  S.pendingEv=S.pendingEv.filter(x=>x.due>S.evClock);
  due.forEach(x=>{ try{ FOLLOWUPS[x.id]&&FOLLOWUPS[x.id].run(x.p); }catch(e){} });
}
/* ---------- 滚动小版本（2026-09-01 P2） ----------
   大版本一年一换（SEASONS），但现实里赛季中每两三周就有热修。
   小补丁只动一个维度的权重（±，很轻），5–8 周一刀——
   「版本答案」不再是赛季初定终身。 */
function miniPatchTick(){
  if(!S.career) return;                       // 职业前不用被版本折腾
  S.patchClock=(S.patchClock||0)+1;
  if(S.patchClock<(S.patchNext||6)) return;
  S.patchClock=0; S.patchNext=5+Math.floor(rnd()*4);
  const d=DIMS[Math.floor(rnd()*DIMS.length)];
  const up=rnd()<0.5;
  S.miniPatch={dim:d, up, n:((S.miniPatch&&S.miniPatch.n)||0)+1};
  const themes={操作:"对线强度英雄",运营:"资源与节奏刷新",心态:"翻盘机制",指挥:"开团手段",体质:"场均时长"};
  pushEvent(`<b>版本热修 ${SEASONS[S.si].tag}.${S.miniPatch.n}</b>：${themes[d]||d}${up?"加强":"削弱"}，
    <b>${d}</b>的权重${up?"略升":"略降"}。<span style="color:var(--ink-3)">大版本没换，小刀也割肉——强项对上刀口的这几周好好利用。</span>`,
    "info","版本");
}
/* 小补丁对版本相性的修正：吃你该维度相对联赛的水平，方向看这刀朝哪。
   幅度刻意压轻（±0.35 封顶）：冠军概率是十几个胜率连乘出来的，
   单方面加在玩家头上的对称噪声也会净亏——首测 ±0.8 把 MSI 打掉了一截。 */
function miniPatchAdj(){
  const mp=S.miniPatch; if(!mp||!S.career) return 0;
  const rel=(S.attrs[mp.dim]-(typeof leagueDimAvg==="function"?leagueDimAvg(mp.dim):50))/12;
  return clamp(rel*(mp.up?0.25:-0.25),-0.35,0.35);
}

/* 周节拍器：所有「进入下一周」的入口都敲一次。
   事件链走表 → 周报编辑部攒稿 → 商业机会按门槛检查（bizWeek 在 shop.js）→ 版本热修。 */
function weeklyEcho(){
  try{ tickFollowUps(); }catch(e){}
  try{ pressTick(); }catch(e){}
  try{ if(typeof bizWeek==="function") bizWeek(); }catch(e){}
  try{ miniPatchTick(); }catch(e){}
  // 心态气压每周自然回落一点——时间也是解药，只是慢
  if(S.tilt) S.tilt=Math.max(0,q1(S.tilt-3));
}

/* ---------- 队内身份仪表（2026-09-01 P2） ----------
   首发竞争和教练/经理信任一直在系统里算，但从没画出来。
   竞争度：有对位竞争者时看你俩的差距；坐稳首发看你在队里的相对水平。 */
function roleCard(){
  if(!S.career||!S.team) return "";
  const me=avg(DIMS.map(d=>S.attrs[d]));
  const acad=(S.homeLeague||"LPL")==="LDL";
  let role, comp, compTxt;
  if(!S.promoted&&S.understudy){
    const him=avg(DIMS.map(d=>S.understudy.r[d]));
    role=acad?"青训生 · 还没进名单":"替补 · 在抢首发";
    comp=clamp(50+(me-(him-2))*8,2,98);
    compTxt=`对位 <b>${S.understudy.id}</b>（${him.toFixed(1)}），压过他才轮到你`;
  }else{
    const mates=myRoster().filter(p=>!p.me);
    const tavg=mates.length?avg(mates.map(p=>avg(DIMS.map(d=>p.r[d])))):me;
    role=acad?"二队首发 · 攒数据升队":(S.offerKind==="core"?"核心首发":"首发");
    comp=clamp(55+(me-tavg)*6,5,98);
    compTxt=comp>=70?"位置很稳，队伍围绕你打":comp>=45?"位置稳固，但别松懈":"你是队里最薄的一环——教练在看替补名单";
  }
  const ct=(typeof coachTrust==="function")?coachTrust():50;
  const mt=(typeof mgrTrust==="function")?mgrTrust():50;
  const bar=(label,v,color,txt)=>`<div class="at wide"><div class="lb">${label}</div>
    <div class="track"><div class="fill" style="width:${v}%;${color?`background:${color}`:""}"></div></div>
    <div class="vn mono"><b>${Math.round(v)}</b></div></div>
    ${txt?`<p class="note" style="margin:2px 0 8px">${txt}</p>`:""}`;
  return `<div class="card"><h2>队内身份<em>${role}</em></h2>
    <div class="attrs">
      ${bar("首发竞争",comp,comp<45?"var(--red)":null,compTxt)}
      ${bar("教练信任",ct,ct<35?"var(--red)":null,ct>=70?"教练在关键局也会把牌给你":ct<35?"排兵布阵时你的名字开始被犹豫":null)}
      ${bar("经理信任",mt,mt<35?"var(--red)":null,mt<35?"续约和转会的桌上，这个数字都在":null)}
    </div></div>`;
}

/* ---------- 生涯一览（2026-09-01 P2，玩家点名：用总结的口吻随时给评语） ----------
   结局系统本来只在五年打完时说话。现在随时可以问它一句：
   「如果今天挂靴，故事讲到哪了？」评语直接用 ending() 的判词——同一把尺子。 */
function careerCard(){
  if(!S.career) return "";
  let e=null; try{ e=(typeof ending==="function")?ending():null; }catch(err){}
  const st=S.stats||{n:0};
  const titles=(S.career.titles||[]);
  const left=SEASONS.length-1-S.si;
  return `<div class="card"><h2>生涯一览<em>如果今天挂靴</em></h2>
    ${e?`<h3 style="margin:4px 0 2px">「${e.n}」</h3>
    <p class="note" style="margin:0 0 10px">${e.d}</p>`:""}
    <div class="tw"><table><tbody>
      <tr><td>生涯战绩</td><td class="n">${S.career.w}−${S.career.l}${st.n?` · 场均评分 ${(st.r/st.n).toFixed(2)}`:""}</td></tr>
      <tr><td>冠军</td><td>${titles.length?titles.join("、"):"还没有"}</td></tr>
      <tr><td>转会轨迹</td><td>${(S.txLog&&S.txLog.length)?S.txLog.length+" 站":"一队待到底"}</td></tr>
      <tr><td>剩下的时间</td><td class="n">${left>0?left+" 个赛季":"这是最后一年"} · ${S.age} 岁</td></tr>
    </tbody></table></div>
    <p class="note" style="color:var(--ink-3)">评语和五年后的结局用同一把尺子——现在不满意，就去改写它。</p></div>`;
}
function followUpCard(){
  const q=(S.pendingEv||[]);
  if(!q.length) return "";
  return `<div class="card"><h2>悬而未决</h2>
    ${q.map(x=>`<p class="note" style="margin:4px 0">· <b>${FOLLOWUPS[x.id]?FOLLOWUPS[x.id].n:x.id}</b>
      —— ${Math.max(0,x.due-(S.evClock||0))} 周内见分晓</p>`).join("")}
    <p class="note" style="color:var(--ink-3)">这些是此前的选择留下的尾巴，不会消失，到期自动兑现。</p></div>`;
}

/* ---------- 二、天梯撞车 ----------
   排位路人局里撞到真实职业选手。打得好被记住，打崩了也是段子。 */
function starPool(){
  const out=[];
  ["LPL","LCK"].forEach(lg=>{
    (S.world&&S.world[lg]||[]).forEach(t=>{
      (t.players||[]).forEach(q=>{
        if(q.me||q.retired) return;
        const v=avg(DIMS.map(d=>q.r[d]));
        if(v>=72) out.push({id:q.id,team:t.name,lg,v});   // 统一标尺：72+ 才算撞到「明星」
      });
    });
  });
  return out;
}
function ladderEncounter(){
  if(rnd()>=0.09) return;                       // 大多数排位夜什么都不会发生，这才像排位
  const pool=starPool(); if(!pool.length) return;
  const s=pool[Math.floor(rnd()*pool.length)];
  const mySkill=(typeof soloSkill==="function")?soloSkill():avg(DIMS.map(d=>S.attrs[d]));
  const p=clamp(0.5+(mySkill-s.v)/40,0.12,0.7);
  const won=rnd()<p;
  const pre=!S.career;
  if(won){
    if(pre&&S.pre){ S.pre.scoutSeen=(S.pre.scoutSeen||0)+2; }
    addFans(pre?6:9); S.heat=(S.heat||0)+8;
    const txt=`<b>天梯撞车</b>：这把路人局撞到了 <b>${s.team}</b> 的 <b>${s.id}</b>——而且你赢了对线。<br>
      <span style="color:var(--cyan)">对局记录被拿去剪了视频${pre?"，球探的收藏夹里多了你一个 ID":""}。</span>`;
    pushEvent(txt,"good","排位");
    if(pre&&typeof preLog==="function") preLog(txt,"good");   // 职业前的主日志也要看得见
  }else{
    addFans(2);
    const txt=`<b>天梯撞车</b>：撞到 <b>${s.team}</b> 的 <b>${s.id}</b>，被上了一课。<br>
      <span style="color:var(--ink-3)">回放你看了三遍。差距就是练习的方向。</span>`;
    pushEvent(txt,"info","排位");
    if(pre&&typeof preLog==="function") preLog(txt,"info");
  }
  // 偶发事件链：疑似演员的局 → 两周后复核
  if(!won&&rnd()<0.25){
    queueFollowUp("actorCase",2,{rr:2});
    pushEvent(`顺带一提：你这几把里有一局的队友操作可疑，你提交了<b>演员举报</b>——平台说复核要几天。`,"info","排位");
  }
}

/* ---------- 三、宿敌记账 ----------
   赢下名单里有明星选手的队，给每位明星记一笔。成就（击败 Faker×3 之类）读这本账。 */
const RIVAL_STARS=["Faker","Chovy","Ruler","Deft","ShowMaker","Keria","Zeus","Gumayusi","Oner",
  "Knight","JackeyLove","Bin","TheShy","Xiaohu","Viper","Zeka","Scout","GALA","Elk","Kanavi"];
function noteRivalBeat(oppPlayers,won){
  if(!won||!oppPlayers) return;
  S.beatStars=S.beatStars||{};
  oppPlayers.forEach(q=>{
    if(q&&RIVAL_STARS.includes(q.id)){
      S.beatStars[q.id]=(S.beatStars[q.id]||0)+1;
      if(S.beatStars[q.id]===1)
        pushEvent(`交手记录：第一次在正式比赛里赢下 <b>${q.id}</b> 所在的队。这本账开始记了。`,"info","宿敌");
    }
  });
}
function beatCount(name){ return (S.beatStars&&S.beatStars[name])||0; }

/* ---------- 四、电竞周报 ----------
   竞品的铁律照搬：只报道真实发生过的事，效果只在出刊时结算一次。
   周报读两样：大事记（带 tag 的事实流水）和比赛档案（真实数据）。 */
function pressTick(){
  S.pressClock=(S.pressClock||0)+1;
  const gap=S.career?3:4;                          // 职业前节奏慢，四周一期
  if(S.pressClock%gap!==0) return;
  pressIssue();
}
function pressIssue(){
  const ptr=S.pressPtr||0;
  const evs=(S.events||[]).slice(ptr);
  S.pressPtr=(S.events||[]).length;
  const heads=[];
  const byTag={};
  evs.forEach(e=>{ (byTag[e.tag]=byTag[e.tag]||[]).push(e); });
  const strip=t=>String(t||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();

  // 赛事战况：本期打了几场，战绩说话
  const played=(byTag["联赛"]||[]).length+(byTag["季后赛"]||[]).length;
  if(S.career&&S.record&&(S.record.w+S.record.l)>0){
    const g=S.record.w+S.record.l, wr=S.record.w/g;
    heads.push({c:"赛事战况",t:`《${S.team} 本赛段 ${S.record.w} 胜 ${S.record.l} 负，${
      wr>=0.65?"打进上半区的路已经清晰":wr>=0.45?"胜负手都攥在自己手里":"教练组开始复盘问题出在哪"}》`});
  }
  // 选手个人：比赛档案是证据
  const arc=(S.archive||[]).slice(-Math.min(6,(S.archive||[]).length));
  if(arc.length>=2){
    const avgR=arc.reduce((a,x)=>a+x.rating,0)/arc.length;
    if(avgR>=1.05){
      heads.push({c:"选手个人",t:`《近期场均评分 ${avgR.toFixed(2)}：${meName()} 的名字开始出现在数据榜单上》`,
        fx:()=>{ S.heat=(S.heat||0)+8; addFans(4); }});
    }else if(avgR<0.85){
      heads.push({c:"选手个人",t:`《数据网站没有为 ${meName()} 说话：近期场均评分 ${avgR.toFixed(2)}》`});
    }
  }
  // 转会风声：只有真的有球探/意向事件才报
  if((byTag["转会"]||[]).length){
    heads.push({c:"转会风声",t:`《消息人士：${meName()} 的名字出现在至少一份引援名单上》`,
      fx:()=>{ S.heat=(S.heat||0)+6; }});
  }
  // 舆论风波：连败才有得写
  if(S.career&&S.record&&S.record.l>=3&&S.record.l>S.record.w){
    heads.push({c:"舆论风波",t:`《${S.team} 的连败让评论区坐不住了》`});
  }
  // 排位/突破这类花边
  const btk=(byTag["突破"]||[]).length;
  if(btk) heads.push({c:"选手动态",t:`《训练房传来的消息：${meName()} 最近在某个环节上明显变强了》`});
  const rank=(byTag["排位"]||[]).find(e=>strip(e.text).indexOf("撞车")>=0);
  if(rank) heads.push({c:"趣味花边",t:`《路人局撞出职业味：一段天梯对局录像在小圈子里传开》`});
  // 版本官方：垫底保证每期至少两条
  if(heads.length<2) heads.push({c:"版本官方",t:`《版本「${SEASONS[S.si].ver}」当前的理解已趋于收敛，各队打法开始同质化》`});
  if(heads.length<2) return;                       // 实在无事发生，这期就不出了（期号不占用）

  S.pressN=(S.pressN||0)+1;
  const issue={n:S.pressN,label:(typeof nowLabel==="function")?nowLabel():SEASONS[S.si].tag,
    heads:heads.slice(0,4).map(h=>({c:h.c,t:h.t}))};
  heads.slice(0,4).forEach(h=>{ try{ h.fx&&h.fx(); }catch(e){} });
  S.pressIssues=(S.pressIssues||[]);
  S.pressIssues.unshift(issue);
  if(S.pressIssues.length>6) S.pressIssues.pop();
  pushEvent(`<b>《电竞周报》第 ${issue.n} 期出刊</b>：${issue.heads[0].t}<br>
    <span style="color:var(--ink-3)">完整版面在「世界」页。周报只写真实发生过的事。</span>`,"info","周报");
}
function pressCard(){
  const list=S.pressIssues||[];
  if(!list.length) return `<div class="card"><h2>电竞周报</h2>
    <p class="note">编辑部正在收集素材——只报道真实发生的事，第一期很快出刊。</p></div>`;
  const cur=list[0];
  return `<div class="card"><h2>电竞周报<em>第 ${cur.n} 期 · ${cur.label}</em></h2>
    ${cur.heads.map(h=>`<p style="margin:7px 0"><span class="tag">${h.c}</span>　${h.t}</p>`).join("")}
    ${list.length>1?`<p class="note" style="margin-top:10px;color:var(--ink-3)">往期：${
      list.slice(1).map(x=>`第${x.n}期`).join(" · ")}（${list.slice(1)[0].heads[0].t.slice(0,18)}…）</p>`:""}
    <p class="note" style="color:var(--ink-3)">周报只使用真实比赛与行动证据，报道效果在出刊时结算一次。</p></div>`;
}

/* ---------- 更新说明卡 ----------
   老存档第一次进新版本时弹一次，把新功能和入口指清楚。
   新开局不弹（东西本来就在眼前）。 */
/* 老档读档时弹最新一条更新（内容来自模板里的 CHANGELOG，只维护一处）。
   完整历史在右下角 📜 浮窗。 */
function patchNoteCard(){
  if(!S.patchNote) return "";
  const cur=(typeof CHANGELOG!=="undefined"&&CHANGELOG[0])?CHANGELOG[0]:null;
  if(!cur) return "";
  return `<div class="rankup"><div class="ru-inner" style="max-width:560px;text-align:left;max-height:86vh;overflow-y:auto">
    <div class="ru-eyebrow" style="text-align:center">本次更新 · ${cur.v}</div>
    <div class="ru-tier" style="font-size:20px;text-align:center;margin-bottom:10px">上线：${cur.at}</div>
    ${cur.items.map(x=>`<p class="note" style="margin:6px 0">· ${x}</p>`).join("")}
    <p class="note" style="color:var(--ink-3);margin-top:10px">往期更新在右下角 📜 里，随时能翻。</p>
    <div class="row" style="justify-content:center;margin-top:12px">
      <button class="btn" id="patchok">知道了，开打 →</button></div>
  </div></div>`;
}

/* ---------- 五、球探观察卡 ----------
   把「谁在看你、凭什么、多确信」画出来。数据全部来自已有系统：
   proPerf（表现分）、scoutHeat（赛段关注）、比赛档案（样本与评分）。 */
function scoutCard(){
  if(!S.career||!S.team) return "";
  const perf=proPerf()-buyoutDrag();
  const tier=perf>=19?["豪门在盯你","var(--gold)"]:perf>=10?["中游俱乐部在看","var(--cyan)"]
            :perf>=4?["次级球探记了你的名字","var(--ink-2)"]:["暂时没人看你","var(--ink-3)"];
  const heat=Math.min(S.scoutHeat||0,6);
  const arc=(S.archive||[]).filter(x=>x.si===S.si);
  const n=arc.length;
  const avgR=n?arc.reduce((a,x)=>a+x.rating,0)/n:0;
  const conf=Math.min(92,n*12);
  return `<div class="card"><h2>球探观察<em>${tier[0]}</em></h2>
    <div class="attrs">
      <div class="at wide"><div class="lb">赛段关注</div>
        <div class="track"><div class="fill" style="width:${heat/6*100}%"></div></div>
        <div class="vn mono"><b>${heat}</b>/6</div></div>
      <div class="at wide"><div class="lb">表现分</div>
        <div class="track"><div class="fill" style="width:${clamp(perf*2.5+25,0,100)}%;background:${tier[1]}"></div></div>
        <div class="vn mono"><b>${perf.toFixed(0)}</b></div></div>
    </div>
    <p class="note">本赛季正赛样本 <b>${n}</b> 个系列赛${n?`，场均评分 <b>${avgR.toFixed(2)}</b>（置信度 ${conf}%）`:"——还没有能拿去谈的数据"}。<br>
      <span style="color:var(--ink-3)">球探看的是样本：打得少，评分再高也只是「有潜力」；样本够了，数字才变成筹码。
      看台上被记下的关注会在注册窗兑现成问询。</span></p></div>`;
}
