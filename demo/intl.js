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
/* 大赛区季后赛：前四打两轮，返回排名 [冠,亚,季,殿]。
   结果按「赛季+赛段+赛区」缓存：同一个季后赛只打一次。
   不缓存的话，每次调用都会重摇一遍——「没进季后赛」时播给玩家的冠军，
   和随后组世界赛名单用的冠军，可能是两支不同的队。 */
function majorStandings(lg){
  const rk=rankOf(lg).map(x=>x.n);
  if(rk.length<4) return rk;
  S.poCache=S.poCache||{};
  const key=S.si+"|"+(S.split||0)+"|"+lg;
  if(S.poCache[key]) return S.poCache[key].slice();
  const w1=simBo(rk[0],rk[3],3), w2=simBo(rk[1],rk[2],3);
  const champ=simBo(w1,w2,3);
  const runner=(champ===w1)?w2:w1;
  const rest=rk.filter(n=>n!==champ&&n!==runner);
  const res=[champ,runner,rest[0],rest[1]];
  S.poCache[key]=res.slice();
  return res;
}

/* 世界赛资格看季后赛走到哪，不是看常规赛排名。
   原来只要 S.playoffSeed<=4 就给名额——于是常规赛第 4、季后赛首轮
   被打出去的人照样去世界赛，而现实里那是拿不到积分的。
     夺冠      -> 一号种子
     输在决赛   -> 二号种子
     输在半决赛 -> 三号种子
     首轮出局   -> 只有常规赛前二才勉强拿到最后一个名额
     没进季后赛 -> 没有
   抽出来单独一个函数，是因为 endSeason 要在「出征前的集结周」开始前
   就知道你去不去得了——不能等 buildWorldsField 跑完才知道。 */
function worldsSlot(playerResult){
  if(playerResult==="champion") return 1;
  if(playerResult===3) return 2;
  if(playerResult===2) return 3;
  if(playerResult===1 && S.playoffSeed && S.playoffSeed<=2) return 4;
  return null;
}

/* ---------- 组建世界赛 16 强 ---------- */
function buildWorldsField(playerResult,cfg){
  cfg=cfg||{playin:{teams:8,take:4}};
  const HL=S.homeLeague||"LPL";
  const seeds={};
  MAJOR.forEach(lg=>{ seeds[lg]=majorStandings(lg); });

  // 世界赛资格看季后赛走到哪，不是看常规赛排名（见 worldsSlot）。
  let mySlot=worldsSlot(playerResult);
  // LDL 不在 MAJOR 里：青训选手围观世界赛时，本赛区名额全走 LPL 那份
  const others=(seeds[HL]||[]).filter(n=>n!==S.team);
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
    /* 玩家不一定在四大赛区。开放「小赛区当低谷退路」之后，
       PCS/VCS/LJL 的联赛冠军真的会走到这一步，而 seeds[HL] 那时候是
       undefined，下一行的 .filter 直接把整局打崩（实测 300 局命中 1 次）。
       majorStandings 本身对任何联赛都成立，补上就行。 */
    if(!seeds[HL]) seeds[HL]=majorStandings(HL)||[];
    if(playerResult==="champion") seeds[HL]=[S.team].concat(seeds[HL].filter(n=>n!==S.team));
    /* 名额：一个赛区派几支。
       原来写死 slice(0,2)——每个大赛区两支，于是 MSI 小组赛里会出现
       同赛区内战（玩家报的：LNG 在 MSI 小组赛遇到 ThunderTalk）。
       现实里：2022 MSI 是 11 队、每个赛区只有春季赛冠军一支；
       2023 起 LPL/LCK 才各拿两个名额。 */
    const twoSeed = (F.msi&&F.msi.mode)!=="groups";      // 2022 那套＝每赛区一支
    const field=[];
    MAJOR.forEach(lg=>{
      const n = twoSeed && (lg==="LPL"||lg==="LCK") ? 2 : 1;
      field.push(...(seeds[lg]||[]).slice(0,n));
    });
    // 小赛区冠军也有票——MSI 本来就是各赛区冠军的舞台。
    // 2022 的 11 队正好是「四大赛区各一 + 七个小赛区各一」。
    if(!twoSeed){
      (MINOR||[]).forEach(lg=>{
        if(!S.world[lg]||!S.world[lg].length) return;
        const r=majorStandings(lg);
        if(r&&r[0]&&field.indexOf(r[0])<0) field.push(r[0]);
      });
    }
    if(playerResult==="champion"&&field.indexOf(S.team)<0) field.push(S.team);
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
    pushEvent(intlDrawText("世界赛入围赛",playin),"info","世界赛");
    enterPrep("intl", S.intl.queue[0], cfg.playin.bo, "世界赛入围赛首战 · 赛前备战");
    return true;
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
    // 你没资格进正赛。但赛事不在这里一步跑完——
    // 名单先记下来，由 spectateIntl 把它铺在接下来几周里，冠军最后揭晓。
    S._spec={type,field:field.slice(),stage};
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
  // 抽签结果要摆出来——玩家原话：「应该要有文字版的日志告诉我
  // 抽签结果、小组分配之类的」。以前是一眼就进比赛，名单都没见过。
  pushEvent(intlDrawText(name+(stage==="swiss"?"瑞士轮":stage==="groups"?"小组赛":""),field),"info",name);
  const first=nextIntlOpp();
  pushEvent(`赛程出来了：${name}首个对手 <b>${first}</b>（${leagueOf(first)}）。`,"info",name);
  enterPrep("intl", first, intlBoNeed(), `${name}首战 · 赛前备战`);
  return true;
}
/* 抽签名单：按赛区列出来，你自己的队标粗 */
function intlDrawText(title,field){
  const byLg={};
  field.filter(Boolean).forEach(n=>{ const lg=leagueOf(n); (byLg[lg]=byLg[lg]||[]).push(n); });
  return `${title}抽签揭晓（${field.filter(Boolean).length} 队）：<br>`+
    Object.entries(byLg).map(([lg,ts])=>
      `${lg}　${ts.map(t=>t===S.team?`<b>${t}</b>`:t).join("、")}`).join("<br>");
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
/* 同一套模拟，但把每一轮的名单留下来，供分周播报 */
function simEventStaged(field,stage){
  let eight=field.slice().filter(Boolean);
  if(stage==="swiss"||stage==="groups"){
    eight=eight.slice().sort((a,b)=>pw(b)-pw(a)).slice(0,8);
  }
  const step=arr=>{
    const nx=[];
    for(let i=0;i<arr.length;i+=2){
      nx.push(i+1<arr.length?simBo(arr[i],arr[i+1],3):arr[i]);
    }
    return nx;
  };
  let four=step(eight);
  while(four.length>4) four=step(four);        // 名单不是 8 的时候多打几轮
  const two=step(four);
  return {eight,four,two,champ:step(two)[0]};
}
/* 冠军播报——围观和亲历淘汰共用一句 */
function intlChampEvent(name,champ){
  const lck=leagueOf(champ)==="LCK";
  return {text:`${name}落幕，<b>${champ}</b> 捧起奖杯。${
      lck?"LCK 又一次站在了最高处。":"你在屏幕外看完了颁奖。"}`,
    tone:lck?"bad":"info", tag:name};
}
/* ---------- 围观：没资格去的赛事，照打，分周揭晓 ----------
   MSI 铺在季中间歇（2 周）里，世界赛自成 3 周。
   这几周就是普通的间歇周：训练、直播、休息、战队行动都开着。 */
function spectateIntl(type){
  const spec=(S._spec&&S._spec.type===type)?S._spec:null;
  S._spec=null;
  const F=SEASONS[S.si];
  let field,stage;
  if(spec){ field=spec.field; stage=spec.stage; }
  else if(type==="msi"){
    const seeds={}; MAJOR.forEach(lg=>seeds[lg]=majorStandings(lg));
    field=MAJOR.flatMap(lg=>seeds[lg].slice(0,2));
    stage=F.msi.mode==="groups"?"groups":"knockout";
  }else{
    const cfg=F.worlds;
    const {direct,playin}=buildWorldsField(null,cfg);
    field=direct.concat(simPlayIn(playin).slice(0,cfg.playin.take));
    stage=cfg.main;
  }
  const name=type==="msi"?"MSI":"世界赛";
  const st=simEventStaged(field,stage);
  const ev=intlChampEvent(name,st.champ);
  if(type==="msi"){
    enterBreak("summer",MID_WEEKS,"季中间歇 · MSI 进行中",
      `春季赛收官。MSI 在没有你的情况下开打——<b>夏季赛才是你的下一战</b>，这两周把该补的补上。`);
    queueBreakNews(1,`MSI 开赛，${field.length} 支队伍到场。你在训练室里看完了揭幕战。`,"info","MSI");
    queueBreakNews(2,`MSI 四强出炉：${st.four.map(n=>`<b>${n}</b>`).join("、")}。`,"info","MSI");
    queueBreakNews(3,ev.text,ev.tone,ev.tag);          // 间歇结束时揭晓
  }else{
    enterBreak("wrap",3,"世界赛期间",
      `你的赛季提前结束了。世界赛在没有你的情况下开打——<b>这三周，练</b>。明年站上去的得是你。`);
    queueBreakNews(1,`世界赛${stage==="swiss"?"瑞士轮":stage==="groups"?"小组赛":""}开打，${field.length} 支队伍向奖杯发起冲击。没有你的名字。`,"info","世界赛");
    queueBreakNews(2,`世界赛八强出炉：${st.eight.map(n=>`<b>${n}</b>`).join("、")}。`,"info","世界赛");
    queueBreakNews(3,`世界赛四强：${st.four.map(n=>`<b>${n}</b>`).join("、")}。决赛就在下周。`,"info","世界赛");
    queueBreakNews(4,ev.text,ev.tone,ev.tag);          // 三周走完、进结算前揭晓
  }
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
    const wasGroups=I.stage==="groups";
    I.stage="knockout"; I.knockField=[S.team].concat(others);
    if(typeof checkAch==="function") checkAch("intlknock");
    I.knockRound=1; I.beaten=[];
    pushEvent(`<b>${S.team}</b> ${wasGroups?"小组出线":"瑞士轮 3 胜晋级"}，进入八强。`,"good",name);
    pushEvent(`八强对阵抽签：你们抽到了 <b>${nextIntlOpp()}</b>（${leagueOf(nextIntlOpp())}）。淘汰赛全部 BO5。`,"info",name);
    enterPrep("intl", nextIntlOpp(), 3, `${name}八强 · 赛前备战`); return;
  }
  /* 瑞士轮/小组赛的下一轮也要过「赛前备战」——原来这里直接 startMatch，
     一场接一场，疲劳每场 +13 却没有任何恢复窗口（玩家报的就是这个）。
     入围赛、淘汰赛早就走备战了，唯独这条路被跳过，没有理由。 */
  I.round++;
  enterPrep("intl", nextIntlOpp(), intlBoNeed(),
    `${name}${I.stage==="groups"?"小组赛":"瑞士轮"}第 ${I.round} 轮（${I.record.join("-")}${intlStakes()}）· 赛前备战`);
}

/* 其余队伍的瑞士轮战绩推进 */
function simOtherSwiss(){
  const I=S.intl;
  I.field.forEach(n=>{
    if(n===S.team) return;
    const r=I.swiss[n]; if(!r||r[0]>=3||r[1]>=3) return;
    // 强队更容易赢
    const q=clamp((pw(n)-70)/22+0.5,0.15,0.85);
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
  // 冠军奖金每次都发——不是一次性成就（那边只发首冠纪念）
  if(typeof addMoney==="function"&&typeof PRIZE_MSI!=="undefined"){
    const amt=I.type==="msi"?PRIZE_MSI.champion:PRIZE_W.champion;
    addMoney("prize",amt);
    pushEvent(`${name}冠军奖金到账 <b>${amt} 万</b>。`,"good","奖金");
  }
  S.career.titles.push(`${SEASONS[S.si].tag} ${name}`);
  S.career[I.type]= (S.career[I.type]||0)+1;
  // 记年份，供「双冠王 / 卫冕 / 三冠」判定
  const yk=I.type==="msi"?"msiYears":"worldsYears";
  S.career[yk]=(S.career[yk]||[]).concat([S.si]);
  // 夺冠是里程碑经历，走独立的里程碑池——机械路径刷得再满也占不掉这份
  const cap0={心态:(S.capBonus&&S.capBonus.心态)||0, 指挥:(S.capBonus&&S.capBonus.指挥)||0};
  if(typeof breakthrough==="function"){
    if(I.type==="msi"){
      breakthrough("心态",2.5,"你在国际赛场的最高领奖台上站过了。大场面再也吓不到你。",undefined,"mile");
      breakthrough("指挥",2.5,"拿过冠军的人说话，队友会听。",undefined,"mile");
    }else{
      breakthrough("心态",3.5,"你在世界最高的舞台上赢过一次。没有什么再能让你手抖。",undefined,"mile");
      breakthrough("指挥",3.0,"世界冠军做的每一个决定，队友都愿意跟。",undefined,"mile");
    }
  }
  const btkGain={心态:q1(((S.capBonus&&S.capBonus.心态)||0)-cap0.心态),
                 指挥:q1(((S.capBonus&&S.capBonus.指挥)||0)-cap0.指挥)};
  const beatLCK=leagueOf(S.match.oppName)==="LCK";
  pushEvent(`<b>${S.team} 夺得 ${SEASONS[S.si].tag} ${name} 冠军！</b>${
    beatLCK?`决赛击败 LCK 的 ${S.match.oppName}——<b>至暗时刻的墙，被你砸开了一道口子。</b>`:""}`,
    "big",name);
  // 夺冠那一刻的总结弹窗。奖金和突破一直都发（玩家插桩验证过），
  // 缺的是「这一刻」本身——大事记里一行字撑不起一座奖杯。
  S.intlChamp={type:I.type, name, tag:SEASONS[S.si].tag,
    opp:S.match?S.match.oppName:"", beatLCK,
    prize:(typeof PRIZE_MSI!=="undefined")?(I.type==="msi"?PRIZE_MSI.champion:PRIZE_W.champion):0,
    nth:S.career[I.type], titles:S.career.titles.length, btkGain};
  S.intlResult=(S.intlResult||{}); S.intlResult[I.type]="champion";
  noteDepth("champion");
  S.intl=null; afterIntl();
}
/* 夺冠总结弹窗——和升段/杯赛结果同一套遮罩 */
function intlChampCard(){
  const c=S.intlChamp; if(!c) return "";
  const g=c.btkGain||{};
  const gtxt=["心态","指挥"].filter(d=>(g[d]||0)>0.05)
    .map(d=>`${d}上限 <i class="up">+${g[d].toFixed(1)}</i>`).join("　");
  return `<div class="rankup"><div class="ru-inner" style="max-width:460px">
    <div class="ru-icon">${typeof gicon==="function"?gicon("cup",52):"🏆"}</div>
    <div class="ru-eyebrow">${c.tag} ${c.name}</div>
    <div class="ru-tier">冠军</div>
    <div class="ru-txt">${c.beatLCK
      ?`决赛击败 LCK 的 <b>${c.opp}</b>——至暗时刻的墙，被你砸开了一道口子。`
      :`决赛击败 <b>${c.opp}</b>。这座奖杯从今天起写着你的名字。`}${
      c.nth>=2?`<br>这是你的第 ${c.nth} 座${c.name}冠军。`:""}</div>
    <div class="evres"><span class="er up">冠军奖金 <b>+${c.prize} 万</b></span>${
      gtxt?`<span class="er">${gtxt}</span>`:""}</div>
    <div class="row" style="justify-content:center">
      <button class="btn" id="intlchampok">${c.type==="msi"?"带着冠军回夏季赛 →":"这个赛季，到此为止了 →"}</button></div>
  </div></div>`;
}
function finishIntl(stageText,kind){
  const I=S.intl, name=I.type==="msi"?"MSI":"世界赛";
  pushEvent(`${name} ${stageText}：<b>${S.team}</b> 的赛季结束了。`,"bad",name);
  S.intlResult=(S.intlResult||{}); S.intlResult[I.type]=kind;
  noteDepth(kind);
  // 奖金按走到的最高档结算（MSI 双败里带着三胜出局的按亚军算）
  if(typeof addMoney==="function"&&typeof PRIZE_MSI!=="undefined"){
    let pk=kind;
    if(I.double&&(I.wins||0)>=3&&kind==="knock") pk="final";
    const tbl=I.type==="msi"?PRIZE_MSI:PRIZE_W;
    const amt=tbl[pk]||tbl.main||0;
    if(amt){ addMoney("prize",amt);
      pushEvent(`${name}奖金按名次结算：<b>${amt} 万</b>。`,"info","奖金"); }
  }
  // 你回家了，赛事还没完。剩下的对阵照打，冠军过几天才揭晓——
  // 决赛输掉是例外：刚赢你的那支队就是冠军，当场就知道。
  if(kind==="final"&&S.match){
    const ev=intlChampEvent(name,S.match.oppName);
    pushEvent(ev.text,ev.tone,ev.tag);
  }else{
    const base=((I.stage==="knockout"?(I.knockField||I.field):I.field)||[]).filter(n=>n!==S.team);
    if(base.length){
      const champ=simWholeEvent(base,I.stage==="knockout"?"knockout":I.stage);
      if(champ) S._intlWrap={name,champ};
    }
  }
  S.intl=null; afterIntl();
}
function afterIntl(){
  // MSI 打完回夏季赛，世界赛打完进休赛期。
  // 被淘汰的人先过一段「赛事还在打」的日子，冠军在间歇的最后才揭晓。
  const go=S.afterIntlGo; S.afterIntlGo=null;
  const wrap=S._intlWrap; S._intlWrap=null;
  if(go==="summer"){
    if(wrap){
      enterBreak("summer",1,"季中间歇",
        `MSI 出局了。夏季赛开始前还有一点时间——<b>世界赛名额就看下个赛段</b>。`);
      const ev=intlChampEvent(wrap.name,wrap.champ);
      queueBreakNews(2,ev.text,ev.tone,ev.tag);      // 间歇结束时揭晓
      return;
    }
    // 冠军也要回国过季中注册窗——原来这里直接 startSeason，
    // 于是 MSI 冠军成了全联盟唯一没有季中转会窗的人（玩家撞见的就是它的邻居 bug）。
    enterBreak("summer",1,"季中间歇",
      `捧着奖杯回国。夏季赛开始前，<b>季中注册窗开着</b>——冠军的电话只会更多。`);
    return;
  }
  if(wrap){
    enterBreak("wrap",2,"世界赛 · 你出局之后",
      `你的世界赛结束了，比赛还在打。<b>剩下的几周，先把自己捡起来。</b>`);
    const ev=intlChampEvent(wrap.name,wrap.champ);
    queueBreakNews(3,ev.text,ev.tone,ev.tag);        // 两周走完、进结算前揭晓
    return;
  }
  S.step="offseason"; render();
}

/* 界面用：当前赛事阶段名 */
function intlStageName(){
  const I=S.intl; if(!I) return "";
  const n=I.type==="msi"?"MSI":"世界赛";
  if(I.stage==="playin") return n+" 入围赛";
  if(I.stage==="groups") return n+" 小组赛 "+I.record.join("-")+intlStakes();
  if(I.stage==="swiss")  return n+" 瑞士轮 "+I.record.join("-")+intlStakes();
  if(I.double) return n+" "+(I.losses?"败者组":"胜者组")+" 第"+(I.wins+I.losses+1)+"场"+(I.losses?" · 再输回家":"");
  return n+" "+(I.knockRound>=3?"决赛":I.knockRound===2?"半决赛":"八强");
}
/* 瑞士轮/小组赛这一场押着什么——玩家原话：0-2 的 BO3 看不出是生死局 */
function intlStakes(){
  const I=S.intl; if(!I||!I.record) return "";
  const [w,l]=I.record;
  if(w===2&&l===2) return " · 生死局：赢了晋级，输了回家";
  if(l===2) return " · 生死局：再输就淘汰";
  if(w===2) return " · 晋级局：赢了进八强";
  return "";
}
