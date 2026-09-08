/* ================= 节点活动与小游戏 =================
   《策划稿-小游戏与节点活动》2026-09-08 动工。活动只放在玩家本来就在等一个结果的时刻上，
   小游戏是仪式里「轮到你」的那 15–40 秒，不是每周的功课。
   三条铁律：
   · 可跳过，跳过 = 银档（不亏不赚）；托管 / 自动推进 / 批测机器人一律按跳过走——批测数字不动
   · 一次的结果覆盖一整段（整个季后赛的状态、整个世界赛的恢复），玩家记得的是「那次抽签我手没抖」
   · 本地结算，只进存档，不换钱不换卡
   先做三场：季后赛抽签仪式（专注）、出征仪式（节奏）、年度颁奖夜（无小游戏）；外加休赛期的特训营。
   小游戏只用 Math.random 摆盘，绝不碰 rng.ts 的种子——不然同一份存档的比赛结果会因为你玩没玩而变。 */
import { S, onEra } from "./state";
import { eraDef } from "./eras";
import { DIMS, POSN, SEASONS, addFans, avg, clamp, isBenched, lplRank, poMyOpp, pushEvent, render } from "./main";
import { meName } from "./save";
import { splitRating } from "./boxscore";
import { majorStandings } from "./intl";
import { addTrustAll } from "./team";
import { addMoney } from "./shop";
import { checkAch } from "./achieve";

/* ---------- 档位 ---------- */
export const TIER_N={gold:"金档",silver:"银档",bronze:"铜档"};
/* 抽签仪式：整个季后赛的状态；出征仪式：世界赛期间的疲劳恢复倍率 */
export const CER_EFF={
  draw:  {gold:3,   silver:0, bronze:-2},
  depart:{gold:1.3, silver:1, bronze:0.8}
};
/* 档位线（赛季一套；职业前的仪式还没做，做的时候另起一套更松的） */
export function focusTier(sec){ return sec<=25?"gold":sec<=35?"silver":"bronze"; }
export function rhythmTier(ms){ return ms<=80?"gold":ms<=150?"silver":"bronze"; }

/* 托管 / 自动推进里不弹仪式：按跳过（银档）走，只在大事记留一行 */
export function cerAuto(){ return !!(S.auto&&(S.auto.career||S.auto.daily)); }

/* 世界赛主办地（出征仪式的时差用）——跟着纪元走 */
let HOSTS: any=eraDef("s12").hosts;
onEra(k=>{ HOSTS=eraDef(k).hosts; });
export function worldsHost(){ const y=SEASONS[S.si]&&SEASONS[S.si].y; return HOSTS[y]||{c:"主办城市",h:8}; }

/* ---------- 开场 ---------- */
export function cerStart(k){
  if(!S.career) return;
  if(k==="awards"){
    const aw=computeAwards(); if(!aw) return;
    applyAwards(aw);
    if(cerAuto()){ S.cer=null; return; }
    S.cer={k,step:0,data:aw}; return;
  }
  if(cerAuto()){ cerApply(k,"silver",true); return; }
  S.cer={k,step:0};
}
export function cerSteps(k){ return k==="draw"?["story","game","result"]:k==="depart"?["s1","s2","s3","game","result"]:["reveal"]; }
export function cerStepName(){ const c=S.cer; if(!c) return ""; return cerSteps(c.k)[c.step]||""; }
export function cerNext(){ if(!S.cer) return; S.cer.step++; render(); }
export function cerSkip(){ if(!S.cer) return; cerApply(S.cer.k,"silver",true); render(); }
/* 小游戏打完：记档位，翻到结算页 */
export function cerFinish(tier,detail){ if(!S.cer) return; S.cer.tier=tier; S.cer.detail=detail||{}; S.cer.step=cerSteps(S.cer.k).indexOf("result"); render(); }
export function cerClose(){ if(!S.cer) return; const c=S.cer; if(c.k==="awards"){ S.cer=null; render(); return; } cerApply(c.k,c.tier||"silver",false); render(); }
/* 结算：一次的结果覆盖一整段 */
export function cerApply(k,tier,skipped){
  const t=tier||"silver";
  if(k==="draw"){
    S.poForm=CER_EFF.draw[t];
    pushEvent(skipped?`抽签仪式：你站在台上握了手、合了影，没理会弹幕。<span style="color:var(--ink-3)">季后赛状态不变。</span>`
      :`抽签仪式的专注挑战 <b>${TIER_N[t]}</b>：${t==="gold"?`弹幕飘满屏你也没抬眼。<b>整个季后赛状态 +3</b>。`:t==="silver"?`稳住了，季后赛状态不变。`:`看了弹幕，手慢了半拍。<b>整个季后赛状态 −2</b>。`}`,
      t==="gold"?"good":t==="bronze"?"bad":"info","仪式");
  }else if(k==="depart"){
    S.cerRec={si:S.si,mul:CER_EFF.depart[t]};
    pushEvent(skipped?`出征仪式：机场、落地、训练室。时差各人各倒各的。<span style="color:var(--ink-3)">世界赛期间恢复正常。</span>`
      :`出征仪式的节奏挑战 <b>${TIER_N[t]}</b>：${t==="gold"?`时差倒得干净，<b>世界赛期间疲劳恢复更快</b>。`:t==="silver"?`倒得一般，世界赛期间恢复正常。`:`没睡好，<b>世界赛期间疲劳恢复更慢</b>。`}`,
      t==="gold"?"good":t==="bronze"?"bad":"info","仪式");
  }
  if(!skipped) checkAch("cer",{k,tier:t});
  S.cer=null;
}
/* addFat 用：出征仪式的恢复倍率只在集结周和世界赛期间生效 */
export function cerRecMul(){
  const r=S.cerRec; if(!r||r.si!==S.si) return 1;
  return (S.intl||(S.off&&S.off.next==="intl"))?r.mul:1;
}

/* ---------- 年度颁奖夜：一阵 / 二阵 / 最佳新秀 / MVP ----------
   全部从已有数据算：五维、状态、常规赛排名、这一年的冠军。你的那一份还看本赛段场均评分。
   不是随机数——同一份存档、同一个赛季算出来永远一样（不碰种子）。 */
/* 团队成绩的加分（2026-09-07 玩家点名「为什么都是一个战队的」「ming 只有 70 综评了咋上的一阵」）：
   原来是世界赛 8 + MSI 4 + 联赛 5 + 常规赛前四 2 = 上限 19 分，而同联赛「最强 − 中位」的
   五维差中位只有 15.1 分——冠军队五个人被整体抬过所有人。批测（64 个颁奖夜）里 36% 的一阵
   席位被这项加分抢走；本队包揽三冠那一年一阵 5/5 全是本队，入选者平均比该位置最强低 16 分，
   实测出现过「68 分进一阵、84 分落选」。
   收到上限 7.5（约等于实力差中位的一半）：势均力敌时冠军队赢，差一个档次时赢不了。 */
export const AWARD_BONUS={worlds:3, msi:1.5, league:2, top4:1};
export const AWARD_TEAM_CAP=3;   // 一支队在一阵/二阵里最多几个人（照 2025 年真实一阵 AL 占 3 个）
export function computeAwards(){
  const HL=S.homeLeague||"LPL";
  if(HL==="LDL") return null;          // 二级联赛不办颁奖夜
  const teams=(S.world&&S.world[HL])||[]; if(!teams.length) return null;
  let rk=[]; try{ rk=lplRank().map(r=>r.n); }catch(e){ rk=[]; }
  let top=[]; try{ top=majorStandings(HL); }catch(e){ top=[]; }
  const H=S.honors||{};
  const wc=(H.worlds&&H.worlds[S.si])||(((S.career&&S.career.worldsYears)||[]).includes(S.si)?S.team:null);
  const mc=(H.msi&&H.msi[S.si])||(((S.career&&S.career.msiYears)||[]).includes(S.si)?S.team:null);
  const lc=top[0]||rk[0]||null;
  const bonus=n=>(n===wc?AWARD_BONUS.worlds:0)+(n===mc?AWARD_BONUS.msi:0)+(n===lc?AWARD_BONUS.league:0)
                +(rk.indexOf(n)>=0&&rk.indexOf(n)<4?AWARD_BONUS.top4:0);
  const bench=isBenched();
  const rows=[];
  teams.forEach(t=>t.players.forEach(p=>{
    if(!p||p.retired) return;
    if(p.me&&bench) return;
    const r=p.me?S.attrs:(p.r||{});
    let sc=avg(DIMS.map(d=>r[d]||0))+(((p.form===undefined||p.form===null)?52:p.form)-52)/8+bonus(t.name);
    if(p.me){ const sr=splitRating(); if(sr!==null) sc+=(sr-1.0)*6; }
    // 新秀 = 这个赛季头一回进一队名单（debutSi 在 makeRookie / 提拔时写下）。
    // 老存档没有这个字段，回落到原来的「20 岁以下」。
    rows.push({id:p.me?meName():p.id,cn:p.me?"":(p.cn||""),pos:p.pos,team:t.name,age:p.age||22,me:!!p.me,
               debut:(p.debutSi!==undefined&&p.debutSi===S.si),sc});
  }));
  if(!rows.length) return null;
  rows.sort((a,b)=>b.sc-a.sc);
  const POS=["top","jng","mid","bot","sup"];
  /* 一支队在一阵（二阵同理）里最多 AWARD_TEAM_CAP 人（2026-09-07 玩家点名「为什么都是一个战队的」）。
     现实里冠军队本来就该多占位置，但不该 5/5 全占。分配办法：按「该位置头名的分」从高到低
     排位置，强的位置先挑人；某队占满 3 席之后，它的人顺延，位置由次名递补。
     兜底那一支 find 是防退化用的——名单不够时宁可破例，也不留空位。 */
  const byPos={}; POS.forEach(ps=>{ byPos[ps]=rows.filter(x=>x.pos===ps); });
  const order=POS.slice().sort((a,b)=>((byPos[b][0]||{sc:-1e9}).sc)-((byPos[a][0]||{sc:-1e9}).sc));
  const used=new Set();
  const fill=()=>{
    const out={},cnt={};
    order.forEach(ps=>{
      const c=byPos[ps].find(x=>!used.has(x)&&(cnt[x.team]||0)<AWARD_TEAM_CAP)||byPos[ps].find(x=>!used.has(x));
      if(c){ out[ps]=c; used.add(c); cnt[c.team]=(cnt[c.team]||0)+1; }
    });
    return POS.map(ps=>out[ps]).filter(Boolean);
  };
  const first=fill(),second=fill();
  // MVP 从一阵里出——现实里 MVP 不可能不进一阵
  const mvp=first.slice().sort((a,b)=>b.sc-a.sc)[0]||rows[0];
  const rookie=rows.find(x=>x.debut)||rows.find(x=>x.age<=20)||null;
  const mine=[];
  if(mvp&&mvp.me) mine.push("mvp");
  if(first.some(x=>x.me)) mine.push("first"); else if(second.some(x=>x.me)) mine.push("second");
  if(rookie&&rookie.me) mine.push("rookie");
  return {si:S.si,tag:SEASONS[S.si].tag,lg:HL,first,second,mvp,rookie,mine,wc,mc,lc};
}
export const AWARD_N={mvp:"年度 MVP",first:"年度一阵",second:"年度二阵",rookie:"最佳新秀"};
const AWARD_FANS={mvp:80,first:40,second:15,rookie:25};
/* 荣誉是事实，看不看颁奖夜都算：进生涯表、涨人气、点成就 */
export function applyAwards(aw){
  if(!aw||!S.career) return;
  S.career.awards=(S.career.awards||[]).filter(x=>x.si!==aw.si);
  aw.mine.forEach(kind=>{
    S.career.awards.push({si:aw.si,kind});
    addFans(AWARD_FANS[kind]||0);
    checkAch("award",{kind});
  });
  const line=aw.mine.length?`年度颁奖夜：你拿到 <b>${aw.mine.map(k=>AWARD_N[k]).join("、")}</b>。`
    :`年度颁奖夜：一阵 ${aw.first.map(x=>x.id).join(" / ")}，MVP <b>${aw.mvp?aw.mvp.id:"—"}</b>。名单上没有你。`;
  pushEvent(line,aw.mine.length?"good":"info","颁奖夜");
}
export function awardsText(){
  const a=(S.career&&S.career.awards)||[]; if(!a.length) return "";
  const cnt={}; a.forEach(x=>{ cnt[x.kind]=(cnt[x.kind]||0)+1; });
  return ["mvp","first","second","rookie"].filter(k=>cnt[k]).map(k=>`${AWARD_N[k]}${cnt[k]>1?` ×${cnt[k]}`:""}`).join("、");
}

/* ---------- 场景简笔画（自己画的线稿，不用任何官方素材） ---------- */
function scene(kind){
  const o='<svg class="cer-art" viewBox="0 0 320 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
  if(kind==="stage") return o+`<path d="M20 100h280M40 100l10-24h220l10 24M60 76l6-14h188l6 14"/><path d="M160 14l-40 62M160 14l40 62" stroke-opacity=".45"/><path d="M160 14l-70 62M160 14l70 62" stroke-opacity=".2"/><circle cx="160" cy="12" r="5"/><path d="M110 62h26M123 62v14M184 62h26M197 62v14"/><rect x="128" y="34" width="64" height="18" rx="2"/><path d="M136 43h48" stroke-opacity=".6"/></svg>`;
  if(kind==="airport") return o+`<path d="M16 104h288M40 96l22-12M90 96l22-12M140 96l22-12M190 96l22-12M240 96l22-12"/><path d="M84 48l64-12 20-20 10 2-14 22 70-14 10 6-72 26 4 26-8 2-14-22-22 4-4 14-8-2 2-16-30-8z"/><path d="M256 30v40M256 30h34v18h-34" /><path d="M262 36h22" stroke-opacity=".5"/></svg>`;
  if(kind==="city") return o+`<path d="M16 104h288"/><path d="M40 104V60h30v44M80 104V38h40v66M130 104V70h26v34M170 104V26h36v78M216 104V58h28v46M252 104V44h32v60"/><path d="M50 70h10M50 82h10M90 50h20M90 64h20M90 78h20M180 40h16M180 56h16M180 72h16M262 56h12M262 72h12" stroke-opacity=".55"/><path d="M40 20c8-8 18-8 26 0M290 24c-6-6-14-6-20 0" stroke-opacity=".4"/></svg>`;
  if(kind==="room") return o+`<path d="M16 104h288"/><path d="M30 104V72h260v32"/><rect x="48" y="44" width="34" height="24" rx="2"/><rect x="100" y="44" width="34" height="24" rx="2"/><rect x="152" y="44" width="34" height="24" rx="2"/><rect x="204" y="44" width="34" height="24" rx="2"/><rect x="256" y="44" width="34" height="24" rx="2"/><path d="M65 68v6M117 68v6M169 68v6M221 68v6M273 68v6M52 82h26M104 82h26M156 82h26M208 82h26M260 82h26"/><path d="M20 24h280" stroke-opacity=".3"/><path d="M150 24v8M170 24v8" stroke-opacity=".3"/></svg>`;
  if(kind==="trophy") return o+`<path d="M120 20h80v30c0 22-18 40-40 40s-40-18-40-40z"/><path d="M120 28H98c0 18 8 30 24 34M200 28h22c0 18-8 30-24 34"/><path d="M160 90v12M140 104h40M134 110h52"/><path d="M160 6v6M126 10l3 5M194 10l-3 5M100 40l-6 2M220 40l6 2" stroke-opacity=".5"/><path d="M40 104h240" stroke-opacity=".4"/></svg>`;
  return o+`</svg>`;
}

/* ---------- 界面 ---------- */
const OTHER_POPS=()=>!!(S.intlChamp||S.rndEv||S.rndResult||S.locker||S.confirm||S.autoSum||S.patchNote||S.rankUp||S.streamOffer||S.cupResult||S.cupMatch||(S.achPop&&S.achPop.length));
export function cerCard(){
  const c=S.cer; if(!c) return "";
  if(OTHER_POPS()) return "";         // 别的弹窗先走，仪式等它们散了再开场
  const st=cerStepName();
  const btns=(main,skip=true)=>`<div class="row cer-btns">${main}${skip?`<button class="btn ghost sm" data-cer="skip" title="跳过按银档结算：不亏不赚">跳过</button>`:""}</div>`;
  let body="";
  if(c.k==="draw"){
    const opp=poMyOpp()||"对手";
    if(st==="story") body=`${scene("stage")}<div class="cer-eyebrow">${SEASONS[S.si].tag} 季后赛 · 抽签仪式</div>
      <p class="cer-p"><b>灯光打到台上。</b>六支队伍的队长依次上去，对阵树亮出来——你们这一轮的对手是 <b>${opp}</b>。握手，合影，镜头转向你。手机里的弹幕已经飘起来了。</p>
      <p class="cer-hint">接下来轮到你：<b>专注</b>——25 格数字按 1 → 25 的顺序点完，弹幕会挡视线，点错罚时。金档 ≤25 秒：整个季后赛状态 +3；银档 ≤35 秒：不变；铜档：−2。</p>
      ${btns(`<button class="btn primary" data-cer="next">上台 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">专注 · 弹幕里按 1 → 25 点完</div><div id="cer-game" data-game="focus"></div>${btns("")}`;
    else body=resultBody(c,"stage");
  }else if(c.k==="depart"){
    const H=worldsHost();
    if(st==="s1") body=`${scene("airport")}<div class="cer-eyebrow">${SEASONS[S.si].tag} 世界赛 · 出征仪式 1/3</div>
      <p class="cer-p"><b>机场。</b>送行的粉丝举着队旗，有人在喊你的 ID。安检口你回头看了一眼——飞${H.c}的航班要 ${H.h} 个小时。</p>
      ${btns(`<button class="btn primary" data-cer="next">登机 →</button>`)}`;
    else if(st==="s2") body=`${scene("city")}<div class="cer-eyebrow">出征仪式 2/3</div>
      <p class="cer-p"><b>落地${H.c}。</b>时差、酒店、主办方的车。队里已经有人开始头疼，教练在群里发了一张作息表。</p>
      ${btns(`<button class="btn primary" data-cer="next">去训练室 →</button>`)}`;
    else if(st==="s3") body=`${scene("room")}<div class="cer-eyebrow">出征仪式 3/3</div>
      <p class="cer-p"><b>第一次进主办地训练室。</b>键盘是自己的，椅子不是。教练只说了一句：先把时差倒过来。</p>
      <p class="cer-hint">接下来轮到你：<b>节奏</b>——跟着呼吸圆，在它最大的时候点一下，20 秒。金档：世界赛期间疲劳恢复更快；银档：正常；铜档：更慢。</p>
      ${btns(`<button class="btn primary" data-cer="next">开始 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">节奏 · 圆最大的时候点一下</div><div id="cer-game" data-game="rhythm"></div>${btns("")}`;
    else body=resultBody(c,"room");
  }else if(c.k==="awards"){
    body=awardsBody(c.data);
  }
  return `<div class="cer" role="dialog" aria-modal="true" aria-label="仪式"><div class="cer-inner">${body}</div></div>`;
}
function resultBody(c,art){
  const t=c.tier||"silver", d=c.detail||{};
  const eff=c.k==="draw"?`整个季后赛状态 <b>${({gold:"+3",silver:"不变",bronze:"−2"})[t]}</b>`
    :`世界赛期间疲劳恢复 <b>${({gold:"更快（×1.3）",silver:"正常",bronze:"更慢（×0.8）"})[t]}</b>`;
  const det=c.k==="draw"?(d.sec!==undefined?`用时 ${d.sec.toFixed(1)} 秒${d.wrong?`，点错 ${d.wrong} 次`:""}`:"")
    :(d.ms!==undefined?`平均误差 ${Math.round(d.ms)} 毫秒，${d.hit||0}/${d.total||8} 次踩上`:"");
  return `${scene(art)}<div class="cer-eyebrow">结算</div>
    <div class="cer-tier ${t}">${TIER_N[t]}</div>
    <p class="cer-p">${det}${det?"。":""}${eff}。</p>
    <div class="row cer-btns"><button class="btn primary" data-cer="close">${c.k==="draw"?"打季后赛 →":"出发 →"}</button></div>`;
}
/* 顺序与入场序号（2026-09-07 玩家点名「你这个年度二阵为什么在一阵上面」）：
   原来照颁奖礼「先念二阵、压轴念一阵」的现场感写，但这张卡是一次性铺满的静态榜单，
   不是逐条揭晓的现场——静态榜单只有从高到低。现在是一阵 → 二阵 → 最佳新秀 → MVP。
   同一段还有一处动画序号错位：i 在拼模板时已经跑到 12，「年度一阵」「最佳新秀」「年度 MVP」
   三个小标题全部拿到 --i:12（延迟 2.64 秒），比自己底下那几行还晚淡入。
   现在标题和行共用同一个递增的 i，标题先亮、行随后。 */
function awardsBody(a){
  if(!a) return `<div class="cer-eyebrow">年度颁奖夜</div><div class="row cer-btns"><button class="btn primary" data-cer="close">散场 →</button></div>`;
  let i=0;
  const row=(x,label?,big?)=>x?`<div class="aw-row${big?" big":""}${x.me?' me':''}" style="--i:${i++}"><span class="aw-pos">${
    label||POSN[x.pos]||x.pos}</span><b>${x.id}</b><span class="aw-team">${x.team}</span></div>`:"";
  const block=(title,list,label?,big?)=>(list&&list.length)
    ? `<div class="aw-sec" style="--i:${i++}">${title}</div><div class="aw-list">${list.map(x=>row(x,label,big)).join("")}</div>`
    : "";
  const blocks=block("年度一阵",a.first)+block("年度二阵",a.second)
    +block("最佳新秀",a.rookie?[a.rookie]:[],"新秀")
    +block("年度 MVP",a.mvp?[a.mvp]:[],"MVP",true);
  const mine=a.mine.length?`你拿到 <b>${a.mine.map(k=>AWARD_N[k]).join("、")}</b>，人气跟着涨。`:`名单上没有你的名字。<span style="color:var(--ink-3)">明年让他们念。</span>`;
  return `${scene("trophy")}<div class="cer-eyebrow">${a.tag} ${a.lg} · 年度颁奖夜</div>
    ${blocks}
    <p class="cer-p" style="--i:${i++}">${mine}</p>
    <div class="row cer-btns"><button class="btn primary" data-cer="close">散场 →</button></div>`;
}

/* ---------- 绑定与小游戏 ---------- */
let _timers: any[]=[];
function clearTimers(){ _timers.forEach(t=>{ try{ clearInterval(t); clearTimeout(t); cancelAnimationFrame(t); }catch(e){} }); _timers=[]; }
export function cerBind(st){
  clearTimers();
  if(!st||!st.querySelectorAll) return;
  st.querySelectorAll("[data-cer]").forEach((b: any)=>b.onclick=()=>{
    const a=b.dataset.cer;
    if(a==="next") cerNext(); else if(a==="skip"){ clearTimers(); cerSkip(); } else if(a==="close") cerClose();
  });
  const g=st.querySelector("#cer-game");
  if(g){ if(g.getAttribute("data-game")==="focus") focusMount(g); else rhythmMount(g); }
  st.querySelectorAll("[data-camp]").forEach((b: any)=>b.onclick=()=>pickCamp(b.dataset.camp));
}
const reduced=()=>{ try{ return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches); }catch(e){ return false; } };
const DANMU=["别再演了","这队没戏","就这？","下赛季见","打野在干嘛","抽到他们稳了","菜就多练","坐等翻车","我信你一次","别送了","这把稳吗","上次也这么说"];

/* 专注：舒尔特 25 格 + 弹幕遮挡。点错罚 0.5 秒；40 秒没点完按铜档。 */
export function focusMount(el){
  const nums=[]; for(let i=1;i<=25;i++) nums.push(i);
  for(let i=nums.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [nums[i],nums[j]]=[nums[j],nums[i]]; }
  const noDm=reduced();
  el.innerHTML=`<div class="mg-head"><span>下一个：<b id="mg-next">1</b></span><span class="mono" id="mg-t">0.0 秒</span></div>
    <div class="mg-wrap"><div class="mg-grid">${nums.map(n=>`<button type="button" class="mg-cell" data-n="${n}" aria-label="${n}">${n}</button>`).join("")}</div>
    ${noDm?"":`<div class="mg-dm" aria-hidden="true">${[0,1,2,3,4,5,6].map(i=>{ const txt=DANMU[Math.floor(Math.random()*DANMU.length)]; const top=4+Math.random()*88, dur=4.5+Math.random()*4, delay=-Math.random()*dur; return `<span style="top:${top.toFixed(0)}%;animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s">${txt}</span>`; }).join("")}</div>`}</div>
    <p class="cer-hint" style="margin-top:8px">${noDm?"你的设备关掉了动效：没有弹幕，按同一条档位线算。":"弹幕挡了就等它飘过去，别点错——错一次罚 0.5 秒。"}</p>`;
  let next=1, wrong=0, t0=0, started=false, done=false;
  const tEl=el.querySelector("#mg-t"), nEl=el.querySelector("#mg-next");
  const elapsed=()=>started?(Date.now()-t0)/1000+wrong*0.5:0;
  const finish=(timeout?)=>{ if(done) return; done=true; clearTimers(); const sec=timeout?40:elapsed(); cerFinish(timeout?"bronze":focusTier(sec),{sec,wrong,timeout:!!timeout}); };
  const tick=setInterval(()=>{ if(!document.body.contains(el)){ clearInterval(tick); return; } if(tEl) tEl.textContent=elapsed().toFixed(1)+" 秒"; if(started&&elapsed()>=40) finish(true); },100);
  _timers.push(tick);
  el.querySelectorAll(".mg-cell").forEach((b: any)=>{
    const on=(ev)=>{ if(ev&&ev.preventDefault) ev.preventDefault(); if(done) return;
      if(!started){ started=true; t0=Date.now(); }
      const n=+b.dataset.n;
      if(n===next){ b.classList.add("done"); b.disabled=true; next++; if(nEl) nEl.textContent=String(Math.min(next,25)); if(next>25) finish(); }
      else { wrong++; b.classList.add("bad"); setTimeout(()=>b.classList.remove("bad"),300); }
    };
    b.onpointerdown=on;
    b.onclick=(ev)=>{ if(ev&&ev.pointerType==="") on(ev); };   // 键盘触发的 click 没有 pointerdown
  });
}
/* 节奏：呼吸圆周期 2.4 秒，最大时点一下，20 秒 8 个峰。误差按最近的峰算，没踩的峰记 400 毫秒。 */
export function rhythmMount(el){
  const PERIOD=2400, TOTAL=20000, PEAKS=8;
  if(reduced()){
    el.innerHTML=`<p class="cer-p">你的设备关掉了动效，呼吸圆动不起来。这一段按<b>银档</b>结算：世界赛期间恢复正常。</p>
      <div class="row cer-btns"><button type="button" class="btn primary" id="mg-rm">按银档结算 →</button></div>`;
    const b=el.querySelector("#mg-rm"); if(b) (b as any).onclick=()=>cerFinish("silver",{reduced:true});
    return;
  }
  el.innerHTML=`<div class="mg-head"><span>踩上 <b id="mg-hit">0</b>/${PEAKS}</span><span class="mono" id="mg-t">20.0 秒</span></div>
    <button type="button" class="mg-ring" id="mg-ring" aria-label="圆最大的时候点一下"><i id="mg-circ"></i><span id="mg-fb">点一下开始</span></button>
    <p class="cer-hint" style="margin-top:8px">吸气它变大，呼气它变小。在最大的那一刻点。</p>`;
  const ring=el.querySelector("#mg-ring") as any, circ=el.querySelector("#mg-circ") as any, fb=el.querySelector("#mg-fb"), tEl=el.querySelector("#mg-t"), hEl=el.querySelector("#mg-hit");
  let t0=0, started=false, done=false, raf=0;
  const best: number[]=[]; for(let i=0;i<PEAKS;i++) best.push(-1);
  const peakAt=k=>PERIOD/2+k*PERIOD;
  const finish=()=>{ if(done) return; done=true; clearTimers(); if(raf) cancelAnimationFrame(raf);
    let sum=0, hit=0; best.forEach(e=>{ if(e<0) sum+=400; else { sum+=e; hit++; } });
    const ms=sum/PEAKS; cerFinish(rhythmTier(ms),{ms,hit,total:PEAKS}); };
  const frame=()=>{ if(!document.body.contains(el)) return;
    const t=started?Date.now()-t0:0;
    const ph=(t%PERIOD)/PERIOD, sc=0.42+0.58*(0.5-0.5*Math.cos(2*Math.PI*ph));
    if(circ) circ.style.transform=`scale(${started?sc.toFixed(3):0.42})`;
    if(tEl) tEl.textContent=(Math.max(0,TOTAL-t)/1000).toFixed(1)+" 秒";
    if(started&&t>=TOTAL+400) { finish(); return; }
    raf=requestAnimationFrame(frame); _timers.push(raf); };
  const tap=(ev)=>{ if(ev&&ev.preventDefault) ev.preventDefault(); if(done) return;
    if(!started){ started=true; t0=Date.now(); if(fb) fb.textContent="…"; return; }
    const t=Date.now()-t0; const k=clamp(Math.round((t-PERIOD/2)/PERIOD),0,PEAKS-1); const err=Math.abs(t-peakAt(k));
    if(best[k]<0||err<best[k]) best[k]=err;
    if(fb) fb.textContent=err<=80?"准":err<=150?(t<peakAt(k)?"稍早":"稍晚"):(t<peakAt(k)?"早了":"晚了");
    if(hEl) hEl.textContent=String(best.filter(e=>e>=0&&e<=150).length);
  };
  if(ring){ ring.onpointerdown=tap; ring.onclick=(ev)=>{ if(ev&&ev.pointerType==="") tap(ev); }; }
  // 标签页切到后台时 requestAnimationFrame 会停，结束不能只靠帧循环：开始之后另挂一个定时器兜底
  const guard=setInterval(()=>{ if(!document.body.contains(el)){ clearInterval(guard); return; } if(started&&Date.now()-t0>=TOTAL+400) finish(); },250);
  _timers.push(guard);
  frame();
}

/* ---------- 特训营（休赛期，一年一次） ----------
   玩家拍板（2026-09-08）：营和价钱不能影响游戏难度和数值平衡。
   所以营里不练五维、不动天花板、不碰伤病概率——练的是人：热度、更衣室、疲劳、心态压力，
   贵的营是后期资金的一个出口，免费的那个是回家。 */
export const CAMPS=[
  {k:"abroad", n:"海外集训", cost:260, d:"跟着队伍去海外集训三周。训练室的照片一发，热度和更衣室都涨。", eff:"热度 +80 · 更衣室信任 +2"},
  {k:"fitness",n:"体能营",   cost:90,  d:"体能教练带着练三周，体检报告一切正常。", eff:"疲劳清零 · 心态压力清零 · 热度 +10"},
  {k:"mind",   n:"心理课",   cost:70,  d:"运动心理师的课。学的不是技术，是怎么在决胜局里不想输赢。", eff:"心态压力清零 · 更衣室信任 +4"},
  {k:"home",   n:"陪家里三周", cost:0, d:"回家。妈做的饭，老同学的局，什么都不练。", eff:"心态压力清零 · 疲劳 −15 · 热度 +5"}
];
export function campOpen(){ return !!(S.career&&S.off&&S.off.next==="year"&&!(S.camp&&S.camp[S.si]!==undefined)); }
export function campCard(){
  if(!S.career||!S.off||S.off.next!=="year") return "";
  const done=S.camp&&S.camp[S.si];
  if(done){ const c=CAMPS.find(x=>x.k===done); return c?`<div class="card"><h2>特训营<em>今年：${c.n}</em></h2><p class="note">${c.d}</p></div>`:""; }
  return `<div class="card"><h2>特训营<em>休赛期 · 一年一次</em></h2>
    <p class="note">三周假期怎么过。营里不练数值——练的是人：热度、更衣室、身体的账。有钱才能选贵的。</p>
    <div class="grid g2">${CAMPS.map(c=>{ const ok=(S.money||0)>=c.cost;
      return `<button class="act" data-camp="${c.k}" ${ok?"":'disabled style="opacity:.34"'} title="${ok?"":"资金不够"}">
        <div class="t">${c.n} <i class="apc">${c.cost?`${c.cost} 万`:"免费"}</i></div><div class="d">${c.d}<br><b>${c.eff}</b></div></button>`; }).join("")}</div></div>`;
}
export function pickCamp(k){
  if(!campOpen()) return;
  const c=CAMPS.find(x=>x.k===k); if(!c) return;
  if((S.money||0)<c.cost) return;
  if(c.cost) addMoney("camp",-c.cost);
  S.camp=S.camp||{}; S.camp[S.si]=k;
  S.tilt=0;
  if(k==="abroad"){ addFans(80); addTrustAll(2); }
  else if(k==="fitness"){ S.fatigue=0; addFans(10); }
  else if(k==="mind"){ addTrustAll(4); }
  else { S.fatigue=Math.max(0,(S.fatigue||0)-15); addFans(5); }
  pushEvent(`特训营：<b>${c.n}</b>${c.cost?`（${c.cost} 万）`:""}。${c.d}`,"info","休赛期");
  checkAch("camp",{k});
  render();
}
