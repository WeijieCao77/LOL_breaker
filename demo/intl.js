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
/* 小赛区没有联赛积分榜，直接按战力取冠军。
   世界线张力闸：当年史实代表在库里且张力没起来，就按史实（GAM、DFM 这些） */
function minorChampion(lg){
  try{
    const WC=(typeof WORLDS_CANON!=="undefined"&&WORLDS_CANON[S.si])?WORLDS_CANON[S.si][lg]:null;
    if(WC&&WC.length&&(S.world[lg]||[]).some(t=>t.name===WC[0])&&rnd()>=wlOf(lg)) return WC[0];
  }catch(e){}
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
  let res=[champ,runner,rest[0],rest[1]];
  // 世界线张力闸：史实上这个赛段的联赛冠军若已知、在场、不是你的队，
  // 按 1−wl 概率收束成史实（LEAGUE_CANON 由史实数据层提供；缺数据就自由模拟）
  try{
    const LC=(typeof LEAGUE_CANON!=="undefined")?LEAGUE_CANON:null;
    const cn=LC&&LC[lg]&&LC[lg][S.si]?LC[lg][S.si][S.split||0]:null;
    if(cn&&cn!==S.team&&rk.includes(cn)&&rnd()>=wlOf(lg))
      res=[cn].concat(res.filter(n=>n!==cn)).slice(0,4);
  }catch(e){}
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
  // 世界线张力闸：逐赛区按 1−wl 概率用史实出线名单（映射到库内存在的队，
  // 缺席位由模拟排名补齐）；你自己打出来的名额在下面的 mySlot 逻辑里，永远真实
  try{
    if(typeof WORLDS_CANON!=="undefined"&&WORLDS_CANON[S.si]){
      MAJOR.forEach(lg=>{
        const hist=(WORLDS_CANON[S.si][lg]||[])
          .filter(n=>n!==S.team&&(S.world[lg]||[]).some(t=>t.name===n));
        if(hist.length&&rnd()>=wlOf(lg))
          seeds[lg]=hist.concat((seeds[lg]||[]).filter(n=>!hist.includes(n)));
      });
    }
  }catch(e){}

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
  /* 替补随队（玩家实锤的漏洞的另一半）：出征前教练用最新训练赛数据
     再看一眼——还没压过首发，就整届坐替补席，球队用真首发阵容打。 */
  if(typeof isBenched==="function"&&isBenched()&&S.understudy){
    return benchedIntl(type,playerResult);
  }
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
    // 世界线张力闸：MSI 名单逐赛区按 1−wl 概率用史实（你打出来的名额永远真实）
    try{
      if(typeof MSI_CANON!=="undefined"&&MSI_CANON[S.si]){
        Object.keys(MSI_CANON[S.si]).forEach(lg=>{
          const hist=(MSI_CANON[S.si][lg]||[])
            .filter(n=>n!==S.team&&(S.world[lg]||[]).some(t=>t.name===n));
          if(hist.length&&rnd()>=wlOf(lg))
            seeds[lg]=hist.concat((seeds[lg]||[]).filter(n=>!hist.includes(n)));
        });
      }
    }catch(e){}
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
        let cand=null;
        // 小赛区代表也过张力闸：史实代表在库里且没被扰动就按史实
        try{
          const h=(typeof MSI_CANON!=="undefined"&&MSI_CANON[S.si])?(MSI_CANON[S.si][lg]||[]):[];
          if(h.length&&h[0]!==S.team&&(S.world[lg]||[]).some(t=>t.name===h[0])&&rnd()>=wlOf(lg)) cand=h[0];
        }catch(e){}
        if(!cand){ const r=majorStandings(lg); cand=r&&r[0]; }
        if(cand&&field.indexOf(cand)<0) field.push(cand);
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
  qual=canonQual(playin,simPlayIn(playin).slice(0,cfg.playin.take));
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
  if(stage==="knockout") brInit(field, S.intl.double);   // MSI 直接淘汰赛：按战力排种子入树
  if(typeof breakthrough==="function")
    breakthrough("运营",2.0,"见过国际赛场的强度，回头看联赛都慢了半拍。","intl"+S.si);
  if(typeof checkAch==="function") checkAch("intl");   // 走出国门（审计：钩子缺失）
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
/* ---------- 淘汰赛对阵树（2026-09-05 玩家实锤：MSI 决赛遇上 70 分的队）----------
   原来淘汰赛的对手是「剩余未交手的队按战力升序取第 k 个」，双败还把输给过的队一并排除——
   胜者组输给 T1 之后决赛就永远遇不到它，T1/GEN 一百多分，决赛却和七十多的打。
   现在是真正的对阵树：8 队按种子入位（先看瑞士轮/小组战绩，再看战力；1v8、4v5 在上半区，
   2v7、3v6 在下半区，一二号种子只在决赛相遇），其他对局按战力模拟，你的下一个对手就是树上
   相邻的胜者。MSI 走完整双败：胜者组三轮 → 掉败者组 → 败者组决赛 → 总决赛。 */
function brSeed(field){
  const I=S.intl;
  const rec=n=>(I&&I.swiss&&I.swiss[n])?I.swiss[n][0]*10-I.swiss[n][1]:0;
  let seeded=field.slice().sort((a,b)=>(rec(b)-rec(a))||(pw(b)-pw(a)));
  // 你必须在树上：种子排到 8 名之外就顶掉第 8
  const mi=seeded.indexOf(S.team);
  if(mi>=8){ seeded.splice(mi,1); seeded.splice(7,0,S.team); }
  seeded=seeded.slice(0,8);
  const order=[0,7,3,4,1,6,2,5];
  return order.map(i=>seeded[i]||null);   // 不足 8 队的位置留空 = 轮空（MSI 六七支队常见）
}
function brInit(field,double){
  const seeds=brSeed(field);
  S.intl.br={double:!!double, step:0, ub:double?seeds:seeds.filter(Boolean), lb:[], lbw:[], out:[], champ:null, uL:null, pending:null};
}
/* 一场对局的胜者：一边轮空直接晋级，两边都空就继续空着往下传 */
function brSim(p){ return !p[0]?p[1]||null:!p[1]?p[0]:simBo(p[0],p[1],3); }
function brStep(){
  const B=S.intl&&S.intl.br; if(!B) return null;
  if(!B.double){
    const n=B.ub.length; if(n<=1) return null;
    const pairs=[]; for(let i=0;i+1<n;i+=2) pairs.push([B.ub[i],B.ub[i+1]]);
    return {pairs, label:n>=8?"八强":n>=4?"半决赛":"决赛"};
  }
  switch(B.step){
    case 0: return {pairs:[[B.ub[0],B.ub[1]],[B.ub[2],B.ub[3]],[B.ub[4],B.ub[5]],[B.ub[6],B.ub[7]]], label:"胜者组第一轮"};
    case 1: return {pairs:[[B.lb[0],B.lb[1]],[B.lb[2],B.lb[3]]], label:"败者组第一轮"};
    case 2: return {pairs:[[B.ub[0],B.ub[1]],[B.ub[2],B.ub[3]]], label:"胜者组半决赛"};
    case 3: return {pairs:[[B.lb[0],B.lb[1]],[B.lb[2],B.lb[3]]], label:"败者组第二轮"};
    case 4: return {pairs:[[B.ub[0],B.ub[1]]], label:"胜者组决赛"};
    case 5: return {pairs:[[B.lb[0],B.lb[1]]], label:"败者组第三轮"};
    case 6: return {pairs:[[B.lb[0],B.uL]], label:"败者组决赛"};
    case 7: return {pairs:[[B.ub[0],B.lb[0]]], label:"总决赛"};
  }
  return null;
}
function brApply(st,winners){
  const B=S.intl.br;
  const win=i=>winners[i]||null;
  const lose=i=>{ const p=st.pairs[i]; if(!p||!p[0]||!p[1]) return null; return p[0]===winners[i]?p[1]:p[0]; };
  const real=a=>a.filter(Boolean);
  if(!B.double){
    const n=B.ub.length;
    B.ub=st.pairs.map((p,i)=>win(i)).concat(n%2?[B.ub[n-1]]:[]);   // 奇数队最后一个轮空
    B.out=B.out.concat(real(st.pairs.map((p,i)=>lose(i))));
    if(B.ub.length===1) B.champ=B.ub[0];
    return;
  }
  switch(B.step){
    case 0: B.ub=[win(0),win(1),win(2),win(3)]; B.lb=[lose(0),lose(1),lose(2),lose(3)]; break;
    case 1: B.lbw=[win(0),win(1)]; B.out=B.out.concat(real([lose(0),lose(1)])); break;
    case 2: B.ub=[win(0),win(1)]; B.lb=[B.lbw[0],lose(1),B.lbw[1],lose(0)]; break;   // 交叉：胜者组掉下来的不立刻重赛
    case 3: B.lb=[win(0),win(1)]; B.out=B.out.concat(real([lose(0),lose(1)])); break;
    case 4: B.uL=lose(0); B.ub=[win(0)]; break;
    case 5: B.lb=[win(0)]; B.out=B.out.concat(real([lose(0)])); break;
    case 6: B.lb=[win(0)]; B.out=B.out.concat(real([lose(0)])); break;
    case 7: B.champ=win(0)||B.ub[0]||B.lb[0]; B.out=B.out.concat(real([lose(0)])); break;
  }
  B.step++;
}
/* 推进到「有你的那一场」：你不在的对局按战力模拟，你轮空就直接过；返回 {opp,label} 或 null（树跑完） */
function brNext(){
  const B=S.intl&&S.intl.br; if(!B) return null;
  for(let guard=0;guard<12;guard++){
    const st=brStep(); if(!st||!st.pairs.length) return null;
    const mine=st.pairs.findIndex(p=>p[0]===S.team||p[1]===S.team);
    if(mine>=0){
      const p=st.pairs[mine], opp=p[0]===S.team?p[1]:p[0];
      if(opp){ B.pending={step:B.step,idx:mine,label:st.label}; return {opp, label:st.label}; }
    }
    brApply(st, st.pairs.map(brSim));
    if(B.champ) return null;
  }
  return null;
}
/* 你打完了：结果写回树，同一轮其他对局模拟 */
function brResolveMine(won){
  const B=S.intl&&S.intl.br; if(!B||!B.pending) return;
  const st=brStep(); if(!st) return;
  const winners=st.pairs.map((p,i)=>{ if(i===B.pending.idx) return won?S.team:(p[0]===S.team?p[1]:p[0]); return brSim(p); });
  brApply(st,winners); B.pending=null;
}
function brOthersText(){
  const st=brStep(); if(!st) return "";
  const rest=st.pairs.filter(p=>p[0]&&p[1]&&p[0]!==S.team&&p[1]!==S.team);
  return rest.length?`同轮其他对局：${rest.map(p=>`${p[0]} vs ${p[1]}`).join("、")}`:"";
}
function nextIntlOpp(){
  const I=S.intl;
  if(I.stage==="knockout"){
    if(!I.br) brInit(I.knockField||I.field||[], I.double);
    const nx=brNext();
    if(nx) return nx.opp;
    // 兜底（树跑完却还在问）：剩余最强
    const base=(I.knockField||I.field||[]).filter(n=>n!==S.team&&!(I.beaten||[]).includes(n));
    base.sort((a,b)=>pw(b)-pw(a)); return base[0]||(I.field||[]).find(n=>n!==S.team);
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
/* ---------- 世界线收束（2026-09-02 玩家定调）----------
   「在我没加入/被淘汰的时候，联赛按历史发展；因我而变，且随影响力逐渐变大。」
   S12-S15 的国际冠军是史实剧本：世界赛 DRX、T1、T1、T1（LCK 四连，至暗时刻的本体），
   MSI RNG、JDG、GEN、GEN。S16 没有剧本——那一年留给你，或留给至暗延续。
   收束条件：正主还活在名单里、而且不是被你亲手打掉的。
   偏转不靠开关，靠你的行为本身：你顶掉正主名额、你在淘汰赛干掉正主、
   你自己打进决赛（决赛永远真打）——影响力越大，偏得越多，这正是要的曲线。 */
/* 史实数据层（Leaguepedia 逐条取证，gen-canon.js 生成——队名已映射到库内 2022 快照，
   库里不存在的席位不写、回落自由模拟）。si 0-3 = S12-S15；S16 无剧本。 */
const WORLDS_CANON={"0":{"LCK":["Gen.G","T1","Dplus Kia","Kiwoom DRX"],"LPL":["JD Gaming","Top Esports","EDward Gaming","Royal Never Give Up"],"LEC":["G2 Esports","Rogue","Fnatic","MAD Lions KOI"],"LCS":["100 Thieves","Cloud9","Evil Geniuses"],"VCS":["GAM Esports","Saigon Buffalo"],"PCS":["CTBC Flying Oyster"],"LJL":["DetonatioN FocusMe"],"CBLOL":["LOUD"],"LLA":["Isurus"],"LCO":["Chiefs Esports Club"],"TCL":["İstanbul Wildcats"]},"1":{"LCK":["Gen.G","T1","KT Rolster","Dplus Kia"],"LPL":["JD Gaming","Bilibili Gaming","LNG Esports","Weibo Gaming"],"LEC":["G2 Esports","Fnatic","MAD Lions KOI","Team BDS"],"LCS":["Cloud9","Team Liquid"],"VCS":["GAM Esports","Team Secret"],"PCS":["PSG Talon","CTBC Flying Oyster"],"LJL":["DetonatioN FocusMe"],"CBLOL":["LOUD"],"LLA":["Movistar R7"]},"2":{"LCK":["Hanwha Life Esports","Gen.G","Dplus Kia","T1"],"LPL":["Bilibili Gaming","Top Esports","LNG Esports","Weibo Gaming"],"LEC":["G2 Esports","Fnatic","MAD Lions KOI"],"LCS":["FlyQuest","Team Liquid","100 Thieves"],"VCS":["GAM Esports"],"PCS":["PSG Talon"],"LJL":["Fukuoka SoftBank HAWKS gaming"],"CBLOL":["paiN Gaming"],"LLA":["Movistar R7"]},"3":{"LCK":["Gen.G","Hanwha Life Esports","KT Rolster","T1"],"LPL":["Anyone's Legend","Bilibili Gaming","Top Esports","Invictus Gaming"],"LEC":["G2 Esports","Fnatic","MAD Lions KOI"],"LCS":["FlyQuest","100 Thieves"],"PCS":["CTBC Flying Oyster","PSG Talon"],"VCS":["Team Secret"]}};
const MSI_CANON={"0":{"LCK":["T1"],"LPL":["Royal Never Give Up"],"LEC":["G2 Esports"],"LCS":["Evil Geniuses"],"PCS":["PSG Talon"],"VCS":["Saigon Buffalo"],"LJL":["DetonatioN FocusMe"],"CBLOL":["RED Canids"],"LLA":["Team Aze"],"LCO":["ORDER"],"TCL":["İstanbul Wildcats"]},"1":{"LCK":["Gen.G","T1"],"LPL":["JD Gaming","Bilibili Gaming"],"LEC":["G2 Esports","MAD Lions KOI"],"LCS":["Cloud9","Golden Guardians"],"VCS":["GAM Esports"],"PCS":["PSG Talon"],"LJL":["DetonatioN FocusMe"],"CBLOL":["LOUD"],"LLA":["Movistar R7"]},"2":{"LCK":["Gen.G","T1"],"LPL":["Bilibili Gaming","Top Esports"],"LEC":["G2 Esports","Fnatic"],"LCS":["Team Liquid","FlyQuest"],"VCS":["GAM Esports"],"PCS":["PSG Talon"],"CBLOL":["LOUD"],"LLA":["Estral Esports"]},"3":{"LCK":["Gen.G","T1"],"LPL":["Bilibili Gaming","Anyone's Legend"],"LEC":["G2 Esports","MAD Lions KOI"],"LCS":["FlyQuest"],"CBLOL":["FURIA"],"PCS":["CTBC Flying Oyster"],"VCS":["GAM Esports"]}};
const LEAGUE_CANON={"LCK":{"0":["T1","Gen.G"],"1":["Gen.G","Gen.G"],"2":["Gen.G","Hanwha Life Esports"],"3":["Gen.G","Gen.G"]},"LEC":{"0":["G2 Esports","Rogue"],"1":["MAD Lions KOI","G2 Esports"],"2":["G2 Esports","G2 Esports"],"3":["MAD Lions KOI","G2 Esports"]},"LCS":{"0":["Evil Geniuses","Cloud9"],"1":["Cloud9",null],"2":["Team Liquid","FlyQuest"]},"LPL":{"0":["Royal Never Give Up","JD Gaming"],"1":["JD Gaming","JD Gaming"],"2":["Bilibili Gaming","Bilibili Gaming"],"3":["Top Esports","Bilibili Gaming"]}};
const INTL_CANON={
  worlds:{0:"Kiwoom DRX",1:"T1",2:"T1",3:"T1"},
  msi:{0:"Royal Never Give Up",1:"JD Gaming",2:"Gen.G",3:"Gen.G"}
};
/* ---------- 世界线张力（2026-09-03 玩家拍板：均衡档）----------
   一个变量管全部：wl[联赛] ∈ [0,1]，0=完全按史实，1=完全活模拟。
   注入：你在联赛打一周正赛 +0.03×影响力；国际赛淘汰某赛区的队 +0.10×影响力；
        夺国际冠军全联赛 +0.10。影响力 = 1+冠军×0.4+名气档×0.15，封顶 3。
   弛豫：赛段末，你不在的联赛 wl×0.6——世界线自愈，尽量弹回原时间线。
   消费：所有模拟出口统一 P(按史实)=1−wl；你亲自打的比赛永远真打。
   没有任何 if(第几年)/if(哪个赛区) 特判——转会出海、直接出道外赛区、
   首年进王朝队，全部由同一个场自然处理。 */
function wlOf(lg){ return (S.wl&&S.wl[lg])||0; }
function wlAdd(lg,amt){ if(!lg||!amt) return; S.wl=S.wl||{}; S.wl[lg]=clamp((S.wl[lg]||0)+amt,0,1); }
function wlInfluence(){
  const titles=(S.career&&S.career.titles)?S.career.titles.length:0;
  let fi=0; try{ FAN_TIERS.forEach((t,i)=>{ if((S.fans||0)>=t[0]) fi=i; }); }catch(e){}
  return clamp(1+titles*0.4+fi*0.15,1,3);
}
/* 赛段末弛豫：你不在的联赛往史实弹回 */
function wlRelax(){
  const HL=S.homeLeague||"LPL";
  Object.keys(S.wl||{}).forEach(lg=>{ if(lg!==HL) S.wl[lg]=+(S.wl[lg]*0.6).toFixed(3); });
}
function canonChamp(type){
  const t=INTL_CANON[type==="msi"?"msi":"worlds"];
  return (t&&t[S.si])||null;
}
/* 模拟出的冠军过一道史实闸门：正主在场、没被你亲手打掉，按 1−wl 概率收束。
   注意用 koWins（你赢下的淘汰赛对手）而不是 beaten——beaten 是「交过手」，
   输给 T1 也会进去，拿它判会让刚赢了你的正主反而不夺冠。 */
function convergeChamp(type,field,simmed){
  const canon=canonChamp(type);
  if(!canon) return simmed;
  if(!(field||[]).includes(canon)) return simmed;                // 正主不在场：世界线已被扰动
  if(S.intl&&(S.intl.koWins||[]).includes(canon)) return simmed; // 被你亲手打掉的正主不能诈尸
  if(rnd()<wlOf(leagueOf(canon))) return simmed;                 // 张力越高，史实越拉不回来
  return canon;
}
/* 分周播报的名单也要跟着收束——不能「四强没有 T1，决赛 T1 捧杯」 */
function convergeStaged(type,field,st){
  const c=convergeChamp(type,field,st.champ);
  if(c===st.champ) return st;
  if(!st.eight.includes(c)) st.eight[st.eight.length-1]=c;
  if(!st.four.includes(c))  st.four[st.four.length-1]=c;
  if(!st.two.includes(c))   st.two[st.two.length-1]=c;
  st.champ=c;
  return st;
}
/* 入围赛的史实闸：正主历史上就是从入围赛杀上来的（S12 的 DRX），
   模拟把他挡在门外世界线就断了——按 1−wl 把他放进晋级席 */
function canonQual(playin,qual){
  try{
    const c=canonChamp("worlds");
    if(c&&(playin||[]).includes(c)&&!(qual||[]).includes(c)&&rnd()>=wlOf(leagueOf(c)))
      return [c].concat(qual.slice(0,Math.max(0,qual.length-1)));
  }catch(e){}
  return qual;
}
/* 冠军播报——围观和亲历淘汰共用一句 */
/* 荣誉账本：哪一年谁拿了 MSI / 世界赛——明星聚光灯用它把本作里改写的历史写进履历 */
function noteHonor(kind,si,team){
  try{ S.honors=S.honors||{}; (S.honors[kind]=S.honors[kind]||{})[si]=team; }catch(e){}
}
function intlChampEvent(name,champ){
  noteHonor(name==="MSI"?"msi":"worlds",S.si,champ);
  const lck=leagueOf(champ)==="LCK";
  return {text:`${name}落幕，<b>${champ}</b> 捧起奖杯。${
      lck?"LCK 又一次站在了最高处。":"你在屏幕外看完了颁奖。"}`,
    tone:lck?"bad":"info", tag:name};
}
/* ---------- 替补随队：球队去打，你在场边 ----------
   名单构造和亲历版一致（自己的队占真实名额），赛果整届模拟＋世界线收束，
   按周揭晓；球队夺冠只发团队新闻，不进你的生涯表、不触发夺冠突破。 */
function benchedIntl(type,playerResult){
  const F=SEASONS[S.si];
  const name=type==="msi"?"MSI":"世界赛";
  let field,stage;
  if(type==="msi"){
    const seeds={}; MAJOR.forEach(lg=>seeds[lg]=majorStandings(lg));
    const HL=S.homeLeague||"LPL";
    if(!seeds[HL]) seeds[HL]=majorStandings(HL)||[];
    if(playerResult==="champion") seeds[HL]=[S.team].concat(seeds[HL].filter(n=>n!==S.team));
    try{
      if(typeof MSI_CANON!=="undefined"&&MSI_CANON[S.si]){
        Object.keys(MSI_CANON[S.si]).forEach(lg=>{
          const hist=(MSI_CANON[S.si][lg]||[]).filter(n=>n!==S.team&&(S.world[lg]||[]).some(t=>t.name===n));
          if(hist.length&&rnd()>=wlOf(lg)&&seeds[lg]&&lg!==HL) seeds[lg]=hist.concat(seeds[lg].filter(n=>!hist.includes(n)));
        });
      }
    }catch(e){}
    const twoSeed=(F.msi&&F.msi.mode)!=="groups";
    field=[]; MAJOR.forEach(lg=>{ const n=twoSeed&&(lg==="LPL"||lg==="LCK")?2:1; field.push(...(seeds[lg]||[]).slice(0,n)); });
    if(!twoSeed) (MINOR||[]).forEach(lg=>{ if(!S.world[lg]||!S.world[lg].length) return;
      const r=majorStandings(lg); if(r&&r[0]&&field.indexOf(r[0])<0) field.push(r[0]); });
    if(field.indexOf(S.team)<0) field.push(S.team);
    stage=F.msi.mode==="groups"?"groups":"knockout";
  }else{
    const cfg=F.worlds;
    const {direct,playin}=buildWorldsField(playerResult,cfg);
    field=direct.concat(canonQual(playin,simPlayIn(playin.filter(n=>n!==S.team)).slice(0,cfg.playin.take)));
    if(field.indexOf(S.team)<0) field.push(S.team);
    stage=cfg.main;
  }
  const st=convergeStaged(type,field,simEventStaged(field,stage));
  const champUs=st.champ===S.team;
  const our= champUs?"决赛"
    : st.two.includes(S.team)?"决赛"
    : st.four.includes(S.team)?"四强"
    : st.eight.includes(S.team)?"八强":"小组赛/瑞士轮";
  const bench=S.understudy?S.understudy.id:"首发";
  if(champUs&&typeof addRingTitle==="function") addRingTitle(`${F.tag} ${name}`);
  if(champUs) noteHonor(type==="msi"?"msi":"worlds",S.si,S.team);
  const ev=champUs
    ? {text:`${name}落幕，<b>${S.team} 夺冠</b>——你在替补席见证了全程。<span style="color:var(--ink-3)">戒指有你一枚，生涯表记为<b>随队冠军</b>；想让它算进成就和转会筹码，把首发抢下来。</span>`,tone:"big",tag:name}
    : intlChampEvent(name,st.champ);
  if(type==="msi"){
    enterBreak("summer",MID_WEEKS,"季中间歇 · 随队 MSI",
      `教练公布了 ${name} 名单：<b>首发还是 ${bench}</b>。你随队出征，位置在替补席——这几周把训练赛数据打上去。`);
    queueBreakNews(1,`${name} 开赛。${S.team} 的比赛你都在场边看完。`,"info",name);
    queueBreakNews(2,`${name} 四强：${st.four.map(n=>n===S.team?`<b>${n}</b>`:n).join("、")}。${st.four.includes(S.team)?"你的队还在走。":`${S.team} 止步${our}。`}`,"info",name);
    queueBreakNews(3,ev.text,ev.tone,ev.tag);
    if(typeof setBreakAgenda==="function") setBreakAgenda(
      [{w:1,t:`${name} 开赛 · ${stage==="groups"?"小组赛":"淘汰赛"}（${field.length} 队）`},{w:2,t:`${name} 四强`},{w:3,t:`${name} 决赛 · 冠军揭晓`}],
      `名单：首发还是 <b>${bench}</b>，你随队出征、在替补席。这几周能做的事：把训练赛数据打上去（下面的对位挑战）。`);
  }else{
    enterBreak("wrap",3,"世界赛 · 替补席随队",
      `世界赛名单公布：<b>首发还是 ${bench}</b>——教练看的是训练赛数据。你随队出征，在替补席看完这一届。`);
    queueBreakNews(1,`世界赛开打，${field.length} 支队伍。${S.team} 在场上，你在场边。`,"info","世界赛");
    queueBreakNews(2,`世界赛八强：${st.eight.map(n=>n===S.team?`<b>${n}</b>`:n).join("、")}。`,"info","世界赛");
    queueBreakNews(3,`世界赛四强：${st.four.map(n=>n===S.team?`<b>${n}</b>`:n).join("、")}。${st.four.includes(S.team)?"":S.team+" 止步"+our+"。"}`,"info","世界赛");
    queueBreakNews(4,ev.text,ev.tone,ev.tag);
    if(typeof setBreakAgenda==="function") setBreakAgenda(
      [{w:1,t:`世界赛开打 · ${stage==="swiss"?"瑞士轮":"小组赛"}（${field.length} 队）`},{w:2,t:`八强`},{w:3,t:`四强 → 决赛 · 冠军揭晓`}],
      `名单：首发还是 <b>${bench}</b>，你随队出征、在替补席。这几周能做的事：把训练赛数据打上去（下面的对位挑战）。`);
  }
  S.afterIntlGo=null; S._intlWrap=null;
  return true;
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
    // 围观的 MSI 也过世界线张力闸（和亲历版同一套史实）
    try{
      if(typeof MSI_CANON!=="undefined"&&MSI_CANON[S.si]){
        MAJOR.forEach(lg=>{
          const hist=(MSI_CANON[S.si][lg]||[])
            .filter(n=>n!==S.team&&(S.world[lg]||[]).some(t=>t.name===n));
          if(hist.length&&rnd()>=wlOf(lg))
            seeds[lg]=hist.concat((seeds[lg]||[]).filter(n=>!hist.includes(n)));
        });
      }
    }catch(e){}
    field=MAJOR.flatMap(lg=>seeds[lg].slice(0,2));
    stage=F.msi.mode==="groups"?"groups":"knockout";
  }else{
    const cfg=F.worlds;
    const {direct,playin}=buildWorldsField(null,cfg);
    field=direct.concat(canonQual(playin,simPlayIn(playin).slice(0,cfg.playin.take)));
    stage=cfg.main;
  }
  const name=type==="msi"?"MSI":"世界赛";
  const st=convergeStaged(type,field,simEventStaged(field,stage));
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
      const qual=[S.team].concat(canonQual(I.field.filter(n=>n!==S.team),
        simPlayIn(I.field.filter(n=>n!==S.team)).slice(0,take-1)));
      S.cameFromPlayin=true;
      pushEvent(`<b>${S.team}</b> 从入围赛杀进正赛。`,"good",name);
      const field=I.direct.concat(qual);
      if(!openIntl("worlds",field,(I.cfg&&I.cfg.main)||"swiss")) finishIntl("正赛出局","main");
      return;
    }
    I.round++; enterPrep("intl", nextIntlOpp(), intlBoNeed(), `${name}第 ${I.round} 轮 · 赛前备战`); return;
  }

  /* --- 淘汰赛（对阵树）--- */
  if(I.stage==="knockout"){
    I.beaten=(I.beaten||[]).concat([S.match.oppName]);
    if(won){
      // 真正被你打掉的才进 koWins（beaten 是「交过手」，含赢了你的）
      (I.koWins=I.koWins||[]).push(S.match.oppName);
      wlAdd(leagueOf(S.match.oppName),0.10*wlInfluence());   // 你掐断了这个赛区一截世界线
    }
    if(!I.br) brInit(I.knockField||I.field||[], I.double);
    const lab=(I.br.pending&&I.br.pending.label)||"淘汰赛";
    brResolveMine(won);
    const B=I.br;
    if(I.double){
      if(!won){
        I.losses++;
        if(lab==="总决赛"){ finishIntl("总决赛（亚军）","final"); return; }
        if(I.losses>=2){ finishIntl(lab,I.wins>=3?"final":"knock"); return; }
        pushEvent(`MSI ${lab}：<b>${S.team}</b> 输给 ${S.match.oppName}，掉入败者组。<b>再输一场就回家。</b>`,"bad","MSI");
      } else {
        I.wins++;
        if(B.champ===S.team){ crownChampion(); return; }
      }
      const nx=brNext();
      if(!nx){ if(B.champ===S.team) crownChampion(); else finishIntl(lab,"knock"); return; }
      I.knockRound++;
      pushEvent(`MSI ${nx.label}：对手 <b>${nx.opp}</b>（${leagueOf(nx.opp)}）。${brOthersText()}`,"info","MSI");
      enterPrep("intl", nx.opp, 3, `${name}${nx.label} · 赛前备战`); return;
    }
    /* 世界赛：8 强单败 BO5 */
    if(!won){
      finishIntl(lab,lab==="决赛"?"final":lab==="半决赛"?"semi":"knock"); return;
    }
    if(B.champ===S.team){ crownChampion(); return; }
    const nx=brNext();
    if(!nx){ crownChampion(); return; }
    I.knockRound++;
    pushEvent(`世界赛${nx.label}：对手 <b>${nx.opp}</b>（${leagueOf(nx.opp)}）。${brOthersText()}`,"info","世界赛");
    enterPrep("intl", nx.opp, 3, `${name}${nx.label} · 赛前备战`); return;
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
    brInit(I.knockField,false);   // 八强对阵树：按瑞士轮/小组战绩排种子
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
  // 逐年国际赛走到哪（结局名片用；同一届会记多条，取最深的那条）
  if(S.intl) S.career.intlLog=(S.career.intlLog||[]).concat([{si:S.si,type:S.intl.type,d}]);
}
function crownChampion(){
  const I=S.intl, name=I.type==="msi"?"MSI":"世界赛";
  noteHonor(I.type==="msi"?"msi":"worlds",S.si,S.team);
  // 世界线张力：国际冠军让全世界都开始围着你转
  try{ Object.keys(S.world).forEach(lg=>wlAdd(lg,0.10)); }catch(e){}
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
  // 荣誉成就钩子（审计修复）：checkAch("msi"/"worlds") 从未被调用过——
  // 世界冠军/MSI 冠军以及挂在它们身上的双冠王/卫冕/大满贯/三冠全是死成就
  if(typeof checkAch==="function"){ checkAch(I.type==="msi"?"msi":"worlds"); checkAch("crown"); }
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
    const base=((I.stage==="knockout"?(I.knockField||I.field):I.field)||[])
      .filter(n=>n!==S.team&&!(I.koWins||[]).includes(n));   // 被你亲手打掉的不参加收尾模拟
    if(base.length){
      const champ=convergeChamp(I.type,base,simWholeEvent(base,I.stage==="knockout"?"knockout":I.stage));
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
