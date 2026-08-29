/* ================= 国际赛：MSI 与 世界赛 =================
   赛制按真实历史:
   · MSI        — 四大赛区各 2 支，8 队双败淘汰（2024 起的赛制）
   · 世界赛 S12  — 入围赛 → 小组赛(16 队 4 组，双循环 BO1，每组前二) → 8 强 BO5
   · 世界赛 S13+ — 入围赛 → 瑞士轮(16 队，5 轮，3 胜晋级 / 3 败淘汰；
                    晋级局与淘汰局 BO3，其余 BO1) → 8 强 BO5
   入围赛：四大赛区第 4 名 + 小赛区冠军，8 队双败，取前 4 进正赛。            */

const MAJOR = (typeof DATA!=="undefined" && DATA.major) || ["LPL","LCK","LEC","LCS"];
const MINOR = (typeof DATA!=="undefined" && DATA.minor) || [];

function findTeam(name){
  if(!S||!S.world) return null;
  for(const lg of Object.keys(S.world)){
    const t=S.world[lg].find(x=>x.name===name);
    if(t) return t;
  }
  return null;
}
function leagueOf(name){
  if(!S||!S.world) return "LPL";
  for(const lg of Object.keys(S.world)) if(S.world[lg].some(x=>x.name===name)) return lg;
  return "LPL";
}
function rankOf(lg){
  const st=S.standings[lg];
  if(!st) return S.world[lg].map(t=>({n:t.name,w:0,l:0,p:0}));
  return Object.entries(st).map(([n,r])=>({n,...r,p:(r.w+r.l)?r.w/(r.w+r.l):0}))
    .sort((a,b)=>b.p-a.p||b.w-a.w);
}
function pw(name){ const t=findTeam(name); return t?power(t,0,SEASONS[S.si].fav):50; }
function winProb(a,b){ return 1/(1+Math.exp(-(pw(a)-pw(b))/SPREAD)); }
function simBo(a,b,need){ let x=0,y=0,p=winProb(a,b); while(x<need&&y<need){ rnd()<p?x++:y++; } return x>y?a:b; }

/* ---------- 赛区名额 ---------- */
/* 小赛区没有联赛积分榜，直接按战力取冠军 */
function minorChampion(lg){
  return S.world[lg].slice().sort((a,b)=>power(b.players)-power(a.players))[0].name;
}
/* 大赛区季后赛：前四打两轮，返回排名 [冠,亚,季,殿] */
function majorStandings(lg){
  const rk=rankOf(lg).map(x=>x.n);
  if(rk.length<4) return rk;
  const w1=simBo(rk[0],rk[3],3), w2=simBo(rk[1],rk[2],3);
  const champ=simBo(w1,w2,3);
  const runner=(champ===w1)?w2:w1;
  const rest=rk.filter(n=>n!==champ&&n!==runner);
  return [champ,runner,rest[0],rest[1]];
}

/* ---------- 组建世界赛 16 强 ---------- */
function buildWorldsField(playerResult,cfg){
  cfg=cfg||{playin:{teams:8,take:4}};
  const HL=S.homeLeague||"LPL";
  const seeds={};
  MAJOR.forEach(lg=>{ seeds[lg]=majorStandings(lg); });

  // 世界赛资格看季后赛走到哪，不是看常规赛排名。
  // 原来只要 S.playoffSeed<=4 就给名额——于是常规赛第 4、季后赛首轮
  // 被打出去的人照样去世界赛，而现实里那是拿不到积分的。
  //   夺冠      -> 一号种子
  //   输在决赛   -> 二号种子
  //   输在半决赛 -> 三号种子
  //   首轮出局   -> 只有常规赛前二才勉强拿到最后一个名额
  //   没进季后赛 -> 没有
  let mySlot=null;
  if(playerResult==="champion") mySlot=1;
  else if(playerResult===3) mySlot=2;
  else if(playerResult===2) mySlot=3;
  else if(playerResult===1 && S.playoffSeed && S.playoffSeed<=2) mySlot=4;
  const others=seeds[HL].filter(n=>n!==S.team);
  if(mySlot){
    seeds[HL]=others.slice(0,mySlot-1).concat([S.team]).concat(others.slice(mySlot-1)).slice(0,4);
  }else{
    seeds[HL]=others.slice(0,4);          // 没资格，本赛区名额全给别人
  }

  // 正赛 16 席 = 直进席 + 入围晋级席
  const takeN=cfg.playin.take, directN=16-takeN;
  const perMajor=Math.floor(directN/MAJOR.length);      // 每个大赛区直进几支
  const direct=[], playin=[];
  MAJOR.forEach(lg=>{
    direct.push(...seeds[lg].slice(0,perMajor));
    if(seeds[lg][perMajor]) playin.push(seeds[lg][perMajor]);
  });
  const minors=MINOR.filter(lg=>S.world[lg]&&S.world[lg].length)
    .map(lg=>minorChampion(lg)).sort((a,b)=>pw(b)-pw(a));
  // 直进席还差的，由最强的小赛区冠军补上
  while(direct.length<directN&&minors.length) direct.push(minors.shift());
  playin.push(...minors.slice(0,Math.max(0,cfg.playin.teams-playin.length)));
  return {direct:direct.slice(0,directN),playin:playin.slice(0,cfg.playin.teams),seeds};
}

/* ---------- 入围赛：8 队双败，取前 4 ---------- */
function simPlayIn(field){
  let win=field.slice(), lose=[], out=[];
  // 胜者组
  while(win.length>1){
    const nx=[];
    for(let i=0;i<win.length;i+=2){
      if(i+1>=win.length){ nx.push(win[i]); continue; }
      const w=simBo(win[i],win[i+1],2);
      nx.push(w); lose.push(w===win[i]?win[i+1]:win[i]);
    }
    win=nx;
  }
  // 败者组
  while(lose.length>1){
    const nx=[];
    for(let i=0;i<lose.length;i+=2){
      if(i+1>=lose.length){ nx.push(lose[i]); continue; }
      const w=simBo(lose[i],lose[i+1],2);
      nx.push(w); out.push(w===lose[i]?lose[i+1]:lose[i]);
    }
    lose=nx;
  }
  const rest=field.filter(n=>n!==win[0]&&n!==lose[0]&&!out.includes(n));
  return [win[0],lose[0]].concat(rest).filter(Boolean).slice(0,4);
}

/* ---------- 事件入口 ---------- */
function startIntl(type,playerResult){
  const HL=S.homeLeague||"LPL";
  const F=SEASONS[S.si];
  if(type==="msi"){
    const seeds={}; MAJOR.forEach(lg=>seeds[lg]=majorStandings(lg));
    if(playerResult==="champion") seeds[HL]=[S.team].concat(seeds[HL].filter(n=>n!==S.team));
    const field=MAJOR.flatMap(lg=>seeds[lg].slice(0,2));
    // 2022 的 MSI 是小组赛+淘汰，2023 起才是双败
    return openIntl("msi",field,F.msi.mode==="groups"?"groups":"knockout");
  }
  const cfg=F.worlds, {direct,playin}=buildWorldsField(playerResult,cfg);
  let qual;
  if(playin.includes(S.team)){
    // 你要打入围赛
    S.intl={type:"worlds",stage:"playin",field:playin,direct,record:[0,0],round:1,
            cfg,queue:playin.filter(n=>n!==S.team).sort((a,b)=>pw(a)-pw(b))};
    pushEvent(`<b>${S.team}</b> 只拿到入围赛资格，要从最底下打起。`,"bad","世界赛");
    S.step="match"; startMatch(cfg.playin.bo,S.intl.queue[0]); return true;
  }
  qual=simPlayIn(playin).slice(0,cfg.playin.take);
  const field=direct.concat(qual);
  if(qual.length) pushEvent(`入围赛结束（${cfg.playin.teams} 队争 ${cfg.playin.take} 个名额），<b>${qual.join("、")}</b> 晋级正赛。`,"info","世界赛");
  return openIntl("worlds",field,cfg.main);
}

function openIntl(type,field,stage){
  field=field.filter(Boolean);
  const name=type==="msi"?"MSI":"世界赛";
  if(!field.includes(S.team)){
    const champ=simWholeEvent(field,stage);
    pushEvent(`${name}落幕，<b>${champ}</b> 捧起奖杯。${
      leagueOf(champ)==="LCK"?"LCK 又一次站在了最高处。":"你在屏幕外看完了颁奖。"}`,
      leagueOf(champ)==="LCK"?"bad":"info",name);
    return false;
  }
  S.intl={type,stage,field,record:[0,0],round:1,
          knockRound:1, knockField:field.slice(), beaten:[], metOpp:[],
          double:(type==="msi"&&stage==="knockout"), wins:0, losses:0,
          swiss:{}};
  field.forEach(n=>S.intl.swiss[n]=[0,0]);
  if(typeof breakthrough==="function")
    breakthrough("运营",2.0,"见过国际赛场的强度，回头看联赛都慢了半拍。","intl"+S.si);
  pushEvent(`<b>${S.team}</b> 进入 ${name}${
    stage==="swiss"?" 瑞士轮":stage==="groups"?" 小组赛":""}。${
    type==="worlds"?"这是全年最后一次机会。":""}`,"big",name);
  S.step="match";
  startMatch(intlBoNeed(), nextIntlOpp());
  return true;
}

/* 本场几胜制：瑞士轮普通局 BO1，晋级/淘汰局 BO3；小组赛 BO1；淘汰赛 BO5 */
function intlBoNeed(){
  const I=S.intl;
  if(!I) return true;
  if(I.stage==="knockout") return 3;
  if(I.stage==="groups") return 1;
  if(I.stage==="playin") return (I.cfg&&I.cfg.playin.bo)||2;
  const [w,l]=I.record;
  return (w===2||l===2)?2:1;
}
function nextIntlOpp(){
  const I=S.intl;
  if(I.stage==="knockout"){
    const base=(I.knockField||I.field||[]);
    let pool=base.filter(n=>n!==S.team&&!(I.beaten||[]).includes(n));
    if(!pool.length) pool=base.filter(n=>n!==S.team);
    pool.sort((a,b)=>pw(a)-pw(b));
    const last=I.double?(I.wins>=(I.losses?3:2)):(I.knockRound>=3);
    return last?pool[pool.length-1]:pool[Math.min(I.knockRound-1,pool.length-1)];
  }
  if(I.stage==="playin") return I.queue[Math.min(I.round-1,I.queue.length-1)];
  // 瑞士轮/小组赛：配同战绩、不同赛区的对手
  const me=I.record.join("-");
  const same=I.field.filter(n=>n!==S.team&&I.swiss[n]&&I.swiss[n].join("-")===me
                &&leagueOf(n)!==leagueOf(S.team)&&!(I.metOpp||[]).includes(n));
  const any=I.field.filter(n=>n!==S.team&&!(I.metOpp||[]).includes(n));
  const pool=same.length?same:(any.length?any:I.field.filter(n=>n!==S.team));
  return pool[Math.floor(rnd()*pool.length)];
}

/* 你不在场时，把整个赛事跑完 */
function simWholeEvent(field,stage){
  let alive=field.slice();
  if(stage==="swiss"||stage==="groups"){
    // 抽象成按战力排序取前 8
    alive=alive.slice().sort((a,b)=>pw(b)-pw(a)).slice(0,8);
  }
  while(alive.length>1){
    const nx=[];
    for(let i=0;i<alive.length;i+=2){
      if(i+1>=alive.length){ nx.push(alive[i]); continue; }
      nx.push(simBo(alive[i],alive[i+1],3));
    }
    alive=nx;
  }
  return alive[0];
}

/* ---------- 每场之后 ---------- */
function intlAdvance(){
  const I=S.intl, won=S.match.sc[0]>S.match.sc[1];
  const name=I.type==="msi"?"MSI":"世界赛";
  I.metOpp=(I.metOpp||[]).concat([S.match.oppName]);

  /* --- 入围赛 --- */
  if(I.stage==="playin"){
    I.record[won?0:1]++;
    if(I.record[1]>=2){ finishIntl(`入围赛出局`,"playin"); return; }
    if(I.record[0]>=2){
      const take=(I.cfg&&I.cfg.playin.take)||4;
      const qual=[S.team].concat(simPlayIn(I.field.filter(n=>n!==S.team)).slice(0,take-1));
      S.cameFromPlayin=true;
      pushEvent(`<b>${S.team}</b> 从入围赛杀进正赛。`,"good",name);
      const field=I.direct.concat(qual);
      if(!openIntl("worlds",field,(I.cfg&&I.cfg.main)||"swiss")) finishIntl("正赛出局","main");
      return;
    }
    I.round++; enterPrep("intl", nextIntlOpp(), intlBoNeed(), `${name}第 ${I.round} 轮 · 赛前备战`); return;
  }

  /* --- 淘汰赛 --- */
  if(I.stage==="knockout"){
    I.beaten=(I.beaten||[]).concat([S.match.oppName]);
    if(I.double){
      /* MSI：8 队双败。输一场掉败者组，输两场淘汰；
         胜者组一路赢 3 场夺冠，走过败者组则需要 4 场。 */
      if(!won){
        I.losses++;
        if(I.losses>=2){ finishIntl(I.wins>=3?"败者组决赛":"败者组","knock"); return; }
        pushEvent(`MSI：<b>${S.team}</b> 输给 ${S.match.oppName}，掉入败者组。<b>再输一场就回家。</b>`,"bad","MSI");
        I.knockRound++; enterPrep("intl", nextIntlOpp(), 3, `${name}淘汰赛 · 赛前备战`); return;
      }
      I.wins++;
      if(I.wins>=(I.losses?4:3)){ crownChampion(); return; }
      I.knockRound++; enterPrep("intl", nextIntlOpp(), 3, `${name}淘汰赛 · 赛前备战`); return;
    }
    /* 世界赛：8 强单败 BO5，三轮 */
    if(!won){
      const stage=I.knockRound>=3?"决赛":I.knockRound===2?"半决赛":"八强";
      finishIntl(stage,I.knockRound>=3?"final":I.knockRound===2?"semi":"knock"); return;
    }
    if(I.knockRound>=3){ crownChampion(); return; }
    I.knockRound++; enterPrep("intl", nextIntlOpp(), 3, `${name}淘汰赛 · 赛前备战`); return;
  }

  /* --- 瑞士轮 / 小组赛 --- */
  I.record[won?0:1]++;
  I.swiss[S.team]=I.record.slice();
  simOtherSwiss();
  const [w,l]=I.record;
  const needW=I.stage==="groups"?3:3;
  if(l>=3){ finishIntl(I.stage==="swiss"?"瑞士轮出局":"小组赛出局","main"); return; }
  if(w>=needW){
    // 晋级八强
    const others=I.field.filter(n=>n!==S.team)
      .sort((a,b)=>pw(b)-pw(a)).slice(0,7);
    I.stage="knockout"; I.knockField=[S.team].concat(others);
    if(typeof checkAch==="function") checkAch("intlknock");
    I.knockRound=1; I.beaten=[];
    pushEvent(`<b>${S.team}</b> ${I.stage==="groups"?"小组出线":"瑞士轮 3 胜晋级"}，进入八强。`,"good",name);
    S.step="match"; startMatch(3,nextIntlOpp()); return;
  }
  I.round++; S.step="match"; startMatch(intlBoNeed(),nextIntlOpp());
}

/* 其余队伍的瑞士轮战绩推进 */
function simOtherSwiss(){
  const I=S.intl;
  I.field.forEach(n=>{
    if(n===S.team) return;
    const r=I.swiss[n]; if(!r||r[0]>=3||r[1]>=3) return;
    // 强队更容易赢
    const q=clamp((pw(n)-55)/22+0.5,0.15,0.85);
    r[rnd()<q?0:1]++;
  });
}

/* 生涯最深战绩：数字越大越深 */
const INTL_DEPTH={"main":1,"knock":2,"semi":3,"final":4,"champion":5};
function noteDepth(kind){
  const d=INTL_DEPTH[kind]||0;
  S.career.bestIntl=Math.max(S.career.bestIntl||0,d);
}
function crownChampion(){
  const I=S.intl, name=I.type==="msi"?"MSI":"世界赛";
  S.career.titles.push(`${SEASONS[S.si].tag} ${name}`);
  S.career[I.type]= (S.career[I.type]||0)+1;
  // 记年份，供「双冠王 / 卫冕 / 三冠」判定
  const yk=I.type==="msi"?"msiYears":"worldsYears";
  S.career[yk]=(S.career[yk]||[]).concat([S.si]);
  if(typeof breakthrough==="function"){
    breakthrough("心态",4.5,"你在世界最高的舞台上赢过一次。没有什么再能让你手抖。");
    breakthrough("指挥",3.0,"拿过冠军的人说话，队友会听。");
  }
  const beatLCK=leagueOf(S.match.oppName)==="LCK";
  pushEvent(`<b>${S.team} 夺得 ${SEASONS[S.si].tag} ${name} 冠军！</b>${
    beatLCK?`决赛击败 LCK 的 ${S.match.oppName}——<b>至暗时刻的墙，被你砸开了一道口子。</b>`:""}`,
    "big",name);
  S.intlResult=(S.intlResult||{}); S.intlResult[I.type]="champion";
  noteDepth("champion");
  S.intl=null; afterIntl();
}
function finishIntl(stageText,kind){
  const I=S.intl, name=I.type==="msi"?"MSI":"世界赛";
  pushEvent(`${name} ${stageText}：<b>${S.team}</b> 的赛季结束了。`,"bad",name);
  S.intlResult=(S.intlResult||{}); S.intlResult[I.type]=kind;
  noteDepth(kind);
  S.intl=null; afterIntl();
}
function afterIntl(){
  // MSI 打完回夏季赛，世界赛打完进休赛期
  if(S.afterIntlGo==="summer"){ S.afterIntlGo=null; startSeason(false,1); return; }
  S.afterIntlGo=null;
  S.step="offseason"; render();
}

/* 界面用：当前赛事阶段名 */
function intlStageName(){
  const I=S.intl; if(!I) return "";
  const n=I.type==="msi"?"MSI":"世界赛";
  if(I.stage==="playin") return n+" 入围赛";
  if(I.stage==="groups") return n+" 小组赛 "+I.record.join("-");
  if(I.stage==="swiss")  return n+" 瑞士轮 "+I.record.join("-");
  if(I.double) return n+" "+(I.losses?"败者组":"胜者组")+" 第"+(I.wins+I.losses+1)+"场";
  return n+" "+(I.knockRound>=3?"决赛":I.knockRound===2?"半决赛":"八强");
}
