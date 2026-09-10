/* ================= 节点活动与小游戏 =================
   《策划稿-小游戏与节点活动》2026-09-08 动工。活动只放在玩家本来就在等一个结果的时刻上，
   小游戏是仪式里「轮到你」的那 15–40 秒，不是每周的功课。
   三条铁律：
   · 可跳过，跳过 = 银档（不亏不赚）；托管 / 自动推进 / 批测机器人一律按跳过走——批测数字不动
   · 一次的结果覆盖一整段（整个季后赛的状态、整个世界赛的恢复），玩家记得的是「那次抽签我手没抖」
   · 本地结算，只进存档，不换钱不换卡
   先做三场：季后赛抽签仪式（专注）、出征仪式（节奏）、年度颁奖夜（无小游戏）；外加休赛期的特训营。
   2026-09-08 第二批：决赛之夜·入场（反应）、试训第一天·上机（反应，职业前那套更松的线）、
   版本发布会（决策：五道限时三选一）、媒体日（限时三选一，不算小游戏——限时本身就是「面对镜头」）。
   小游戏只用 Math.random 摆盘，绝不碰 rng.ts 的种子——不然同一份存档的比赛结果会因为你玩没玩而变。 */
import { S } from "./state";
import { bondFarewellLines } from "./bond";
import { relAll } from "./clout";
import { DIMS, POSN, SEASONS, addFans, avg, breakthrough, capOf, clamp, isBenched, lplRank, poMyOpp, pushEvent, render, trialCanPay } from "./main";
import { CUPS } from "./cup";
import { rnd } from "./rng";
import { meName } from "./save";
import { mvpBonus, splitRating, yearRating } from "./boxscore";
import { majorStandings } from "./intl";
import { addTrustAll } from "./team";
import { addMoney } from "./shop";
import { checkAch } from "./achieve";
import { topRival } from "./rivals";

/* ---------- 档位 ---------- */
export const TIER_N={gold:"金档",silver:"银档",bronze:"铜档"};
/* 抽签仪式：整个季后赛的状态；出征仪式：世界赛期间的疲劳恢复倍率；
   决赛之夜：这一场（整个系列赛）的战力与节点成功率；试训上机：这次试训的评级档；
   版本发布会：整个赛季的版本相性；媒体日：这个赛段的舆论基调（不是档位，是三种口径） */
export const CER_EFF={
  draw:  {gold:3,   silver:0, bronze:-2},
  depart:{gold:1.3, silver:1, bronze:0.8},
  final: {pw:{gold:2, silver:0, bronze:-1}, node:{gold:0.05, silver:0, bronze:-0.03}},
  bench: {gold:1,   silver:0, bronze:-1},          // 评级 ±1 档（一档 = 8 分）
  patch: {gold:0.5, silver:0, bronze:-0.3},
  media: {bold:{heat:15,tilt:1.5}, steady:{heat:5,tilt:1}, blame:{heat:10,trust:-3,tilt:1}},
  /* 替补版媒体日（作者拍板 2026-09-09）：一个连正式比赛都没打过的人不该站在背景板前
     跟三个记者放狠话。改成收工时被顺口问一句，热度减半；「狂」的代价也不能再是
     「输了更伤心态」——替补根本不上场，那一条对他等于零成本（这正是旧版的白嫖口子）。
     换成教练组盯得更紧：下一次对位挑战的每一局成功率 −5%。 */
  mediaBench: {bold:{heat:8,scrim:-0.05}, steady:{heat:3}},
  trial: {gold:1.0},                                  // 过关 = 该维天花板 +1（里程碑池）；没过下个赛段再来，不扣
  rehab: {gold:-1},                                   // 康复期金档：少养一周
  allstar:{gold:20, silver:8, bronze:0}               // 技巧赛：人气；跳过 / 没去 = 0
};
/* 突破试炼：每一维对应一套机制（策划稿第三节第 10 场）。运营那套「记忆」要峡谷简笔画素材，先用决策代 */
export const TRIAL_MECH={操作:"react",心态:"focus",指挥:"decide",运营:"decide",体质:"rhythm"};
/* 档位线（赛季一套、职业前一套更松的——「职业训练更细、越往上越难」） */
export function focusTier(sec){ return sec<=25?"gold":sec<=35?"silver":"bronze"; }
export function rhythmTier(ms){ return ms<=80?"gold":ms<=150?"silver":"bronze"; }
/* 反应：命中率 + 平均反应。金 ≥75% 且 ≤380ms（职业前 ≤450ms）；银 ≥60% 且 ≤480ms */
export function reactTier(rate,ms,pre?){ if(rate>=0.75&&ms<=(pre?450:380)) return "gold"; if(rate>=0.60&&ms<=480) return "silver"; return "bronze"; }
/* 决策：五题答对几题。金 ≥4；银 2–3；铜 ≤1 */
export function decideTier(n){ return n>=4?"gold":n>=2?"silver":"bronze"; }

/* 托管 / 自动推进里不弹仪式：按跳过（银档）走，只在大事记留一行 */
export function cerAuto(){ return !!(S.auto&&(S.auto.career||S.auto.daily)); }

const HOSTS={2022:{c:"旧金山",h:12},2023:{c:"首尔",h:2},2024:{c:"伦敦",h:11},2025:{c:"成都",h:3}};
export function worldsHost(){ const y=SEASONS[S.si]&&SEASONS[S.si].y; return HOSTS[y]||{c:"主办城市",h:8}; }

/* ---------- 开场 / 排队 ----------
   S.cer 只有一个坑位。新赛季第一周会同时撞上版本发布会和媒体日，后来的排进 S.cerQ，
   前一场散了再开下一场。同一种仪式不会排两次。 */
function cerOpen(c){
  if(S.cer){ S.cerQ=S.cerQ||[]; if(!S.cerQ.some(x=>x.k===c.k)) S.cerQ.push(c); }
  else S.cer=c;
}
function cerDequeue(){
  // 排队的突破试炼轮到时，那一维已经付不出「+1」（到 99 / 池子满）就作废（老存档里排进去的也一样）
  while(!S.cer&&S.cerQ&&S.cerQ.length){ const c=S.cerQ.shift(); if(c&&c.k==="trial"&&c.dim&&!trialCanPay(c.dim)) continue; S.cer=c; }
}
/* 试训第一天、职业前杯赛决赛在职业前就会有——那时候 S.career 还是空的 */
const PRE_OK={bench:true, final:true};
/* 这一场要结算到哪个比赛对象上：正赛 S.match，职业前杯赛 S.cupMatch */
export function liveMatch(){ if(S.match&&!S.match.done) return S.match; if(S.cupMatch&&!S.cupMatch.done) return S.cupMatch; return null; }
export function cerStart(k,extra?){
  if(!S.career&&!PRE_OK[k]) return;
  if(k==="awards"){
    const aw=computeAwards(); if(!aw) return;
    applyAwards(aw);
    if(cerAuto()) return;
    cerOpen({k,step:0,data:aw}); return;
  }
  if(k==="final"&&!liveMatch()) return;
  if(k==="bench"&&!(S.tryout&&!S.tryout.done)) return;
  if(k==="rehab"&&!S.injury) return;
  if(k==="trial"&&(!(extra&&extra.dim)||!trialCanPay(extra.dim))) return;   // 到 99 硬顶、或突破池付不出这一格，就没有瓶颈可破
  if(k==="allstar"){ extra=Object.assign({sel:allstarSelected()},extra||{}); }
  const c=Object.assign({k,step:0},extra||{});
  if(cerAuto()){ cerApply(k,"silver",true,c); return; }
  cerOpen(c);
}
export function cerSteps(k,c?){
  if(k==="allstar") return (c&&c.sel===false)?["miss"]:["story","game","result"];
  if(k==="farewell0"||k==="farewell") return ["story"];
  if(k==="draw"||k==="final"||k==="bench"||k==="patch"||k==="media"||k==="trial"||k==="rehab") return ["story","game","result"];
  if(k==="depart") return ["s1","s2","s3","game","result"];
  return ["reveal"];
}
export function cerStepName(){ const c=S.cer; if(!c) return ""; return cerSteps(c.k,c)[c.step]||""; }
export function cerNext(){ if(!S.cer) return; S.cer.step++; render(); }
export function cerSkip(){ if(!S.cer) return; cerApply(S.cer.k,"silver",true); render(); }
/* 小游戏打完：记档位，翻到结算页 */
export function cerFinish(tier,detail){ if(!S.cer) return; S.cer.tier=tier; S.cer.detail=detail||{}; S.cer.step=cerSteps(S.cer.k,S.cer).indexOf("result"); render(); }
export function cerClose(){ if(!S.cer) return; _mgLive=false; const c=S.cer; if(c.k==="awards"){ S.cer=null; cerDequeue(); render(); return; }
  const storyOnly=(c.k==="farewell0"||c.k==="farewell"||(c.k==="allstar"&&c.sel===false));
  cerApply(c.k,c.tier||"silver",storyOnly); render(); }
/* 结算：一次的结果覆盖一整段 */
export function cerApply(k,tier,skipped,ctx?){
  _mgLive=false;
  const t=tier||"silver";
  const C=ctx||S.cer||{};
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
  else if(k==="final"){
    const m=liveMatch();
    if(m){
      m.cerFinal={pw:CER_EFF.final.pw[t], node:CER_EFF.final.node[t]};
      m.lines.push(`<div><span class="hi">入场</span> ${skipped?"通道里走得很快，没多想。":t==="gold"?"手是热的。<b>这一场战力 +2、临场决策更容易成</b>。":t==="silver"?"热身正常，按平时打。":"热身没找到手感，<b>这一场战力 −1</b>。"}</div>`);
    }
    pushEvent(skipped?`决赛之夜：入场通道、灯光、握手。<span style="color:var(--ink-3)">这一场按平时打。</span>`
      :`决赛入场的反应挑战 <b>${TIER_N[t]}</b>：${t==="gold"?`最后一次热身手是热的。<b>这一场战力 +2，临场决策成功率 +5%</b>。`:t==="silver"?`热身正常，这一场按平时打。`:`热身没找到手感。<b>这一场战力 −1，临场决策成功率 −3%</b>。`}`,
      t==="gold"?"good":t==="bronze"?"bad":"info","仪式");
  }else if(k==="bench"){
    const tr=S.tryout;
    if(tr&&!tr.done){
      tr.cerAdj=CER_EFF.bench[t];
      if(!skipped) tr.lines.push(`<div><span class="hi">上机</span> 先打几把给教练组看 — ${t==="gold"?'<span class="w">手很快，他们互相看了一眼</span>':t==="silver"?'正常发挥':'<span class="l">手有点凉</span>'}　<b style="color:${t==="gold"?'var(--cyan)':t==="bronze"?'var(--red)':'var(--ink-3)'}">${t==="gold"?"评级 +1 档":t==="bronze"?"评级 −1 档":"评级不变"}</b></div>`);
    }
  }else if(k==="patch"){
    S.verCer={si:S.si, adj:CER_EFF.patch[t]};
    const d=S.cer&&S.cer.detail||{};
    pushEvent(skipped?`版本发布会：教练念完三条变化，你点了点头。<span style="color:var(--ink-3)">版本相性不变。</span>`
      :`版本发布会的决策挑战 <b>${TIER_N[t]}</b>（${d.n||0}/5）：${t==="gold"?`教练组：你把版本吃透了。<b>整个赛季版本相性 +0.5</b>。`:t==="silver"?`大方向对，细节还得再看录像。版本相性不变。`:`教练组：还得再看录像。<b>整个赛季版本相性 −0.3</b>。`}`,
      t==="gold"?"good":t==="bronze"?"bad":"info","仪式");
  }else if(k==="media"){
    const d=(!skipped&&S.cer&&S.cer.detail)||{};
    const tone=d.tone;
    const bench=isBenched();
    const T=bench?CER_EFF.mediaBench:CER_EFF.media;
    if(tone&&T[tone]){
      const E=T[tone];
      S.media={si:S.si, split:S.split||0, tone, bench:bench||undefined};
      S.heat=Math.max(0,(S.heat||0)+(E.heat||0));
      if(E.trust) addTrustAll(E.trust);
      if(tone==="blame") relAll(-1.5);   // 甩锅：队友互相之间也会传
      pushEvent(bench
        ? `收工的时候记者问了你一句，你的口径是<b>${MEDIA_TONE_N[tone]}</b>。${tone==="bold"
            ? `热度 +8，<b>但教练组听见了</b>——下次对位挑战每一局成功率 −5%。`
            : `热度 +3。你还没有说大话的本钱，这个回答挑不出毛病。`}`
        : `媒体日：你的口径是<b>${MEDIA_TONE_N[tone]}</b>。${tone==="bold"?`热度 +15，<b>但这个赛段输了更伤心态</b>——话说出去了，就得打回来。`:tone==="steady"?`热度 +5，没留下把柄。`:`热度 +10，<b>更衣室信任 −3</b>——队友看得懂你在说谁。`}`,
        tone==="blame"?"bad":"info","媒体日");
    }else{
      pushEvent(bench
        ? `记者从你旁边走过去，没停。<span style="color:var(--ink-3)">名单上没有你的名字。</span>`
        : `媒体日：三个记者三个问题，你说的都是套话。<span style="color:var(--ink-3)">没人写你。</span>`,"info","媒体日");
    }
  }
  else if(k==="trial"){
    const d=C.dim; S.btkTrial=S.btkTrial||{};
    if(d){
      if(!skipped&&t==="gold"){
        S.btkTrial[d]="pass";
        breakthrough(d,CER_EFF.trial.gold,`突破试炼：教练把你单独留下，「今天不过这一关别回去」——你过了。`,undefined,"mile");
      }else{
        S.btkTrial[d+"_si"]=S.si;   // 这个赛段试过了，下个赛段再来
        pushEvent(skipped?`突破试炼：教练想留你加练一关，你说今天算了。<span style="color:var(--ink-3)">${d}的瓶颈还在，下个赛段再说。</span>`
          :`突破试炼 <b>${TIER_N[t]}</b>：${d}那一关没过。<span style="color:var(--ink-3)">不扣什么，下个赛段再来。</span>`,"info","突破");
      }
    }
  }else if(k==="rehab"){
    if(S.injury){
      if(!skipped&&t==="gold"&&S.injury.left>1){ S.injury.left+=CER_EFF.rehab.gold;
        pushEvent(`康复期的节奏训练 <b>金档</b>：理疗师说恢复比预期快，<b>少养一周</b>（还剩 ${S.injury.left} 周）。`,"good","伤病"); }
      else pushEvent(skipped?`康复期：理疗室、计划表，按部就班。`:`康复期的节奏训练 <b>${TIER_N[t]}</b>：按原计划养。`,"info","伤病");
    }
  }else if(k==="allstar"){
    if(C.sel===false){
      pushEvent(`全明星周末：投票名单上没有你。<span style="color:var(--ink-3)">明年让他们投。</span>`,"info","全明星");
    }else if(skipped){
      pushEvent(`全明星周末：你入选了，但没去技巧赛——只在表演赛上露了个脸。`,"info","全明星");
    }else{
      const g=CER_EFF.allstar[t]||0; if(g) addFans(g);
      pushEvent(`全明星技巧赛 <b>${TIER_N[t]}</b>：${t==="gold"?`全场最快的手。<b>人气 +20</b>。`:t==="silver"?`中规中矩。人气 +8。`:`手凉了，观众替你尴尬。`}`,t==="gold"?"good":"info","全明星");
    }
  }else if(k==="farewell0"){
    S.farewell={si:S.si};
    pushEvent(`<b>退役赛季开始。</b>这是你职业生涯的最后一年——每一个客场都会有人举着横幅送你。`,"big","生涯");
  }else if(k==="farewell"){
    pushEvent(`<b>退役仪式。</b>队友、教练、看台上的人各说了一句话。灯光暗下来的时候，你没有回头。`,"big","生涯");
  }
  if(!skipped) checkAch("cer",{k,tier:t,dim:C.dim||null,tone:(S.cer&&S.cer.detail&&S.cer.detail.tone)||null,picks:(S.cer&&S.cer.detail&&S.cer.detail.picks)||[]});
  S.cer=null;
  cerDequeue();
}
/* 全明星入选：今年的年度奖项、今年的冠军、或人气到「平台头部」 */
export function allstarSelected(){
  if(!S.career) return false;
  const aw=(S.career.awards||[]).some(x=>x.si===S.si&&(x.kind==="first"||x.kind==="second"||x.kind==="mvp"));
  const title=((S.career.lgYears||[]).includes(S.si))||((S.career.msiYears||[]).includes(S.si))||((S.career.worldsYears||[]).includes(S.si));
  return !!(aw||title||(S.fans||0)>=900);
}
/* 突破试炼的触发（赛段结算时调）：撞到天花板、这一维还没过关、这个赛段没试过——一次只开一维。
   天花板已经是 99 硬顶、或突破池付不出「+1」的不算（玩家实锤 2026-09-10：操作满 99 还被教练留下破瓶颈） */
export function btkTrialCheck(){
  if(!S.career||!S.attrs) return;
  S.btkTrial=S.btkTrial||{};
  const d=DIMS.find(x=>S.attrs[x]>=capOf(x)-0.05&&trialCanPay(x)&&S.btkTrial[x]!=="pass"&&S.btkTrial[x+"_si"]!==S.si);
  if(d) cerStart("trial",{dim:d});
}
export const MEDIA_TONE_N={bold:"狂",steady:"稳",blame:"甩锅"};
/* 决赛之夜：这一场的战力与节点成功率加成（只在 S.match 上，打完就没了） */
export function cerFinalPw(){ const m=S.match; return ((m&&m.cerFinal&&m.cerFinal.pw)||0)+((m&&m.farewellPw)||0); }
export function cerFinalNode(){ const m=S.match; return (m&&m.cerFinal&&m.cerFinal.node)||0; }
/* 版本发布会：这个赛季的版本相性加成 */
export function verCerAdj(){ const v=S.verCer; return (v&&v.si===S.si)?(v.adj||0):0; }
/* 这个赛段你在媒体日定的口径（狂 / 稳 / 甩锅）。没开过媒体日、跳过了、
   或者已经是下一个赛段了，都返回 null——「你说过的话」只在你真说过的时候才算数。 */
export function mediaToneNow(){
  const m=S.media;
  return (m&&m.si===S.si&&m.split===(S.split||0)&&m.tone)?m.tone:null;
}
/* 媒体日「狂」：这个赛段输掉的比赛攒的心态压力 ×1.5。
   替补版的代价是对位挑战成功率，不是心态——他压根不上场。 */
export function mediaTiltMul(){
  const m=S.media;
  if(m&&m.bench) return 1;
  return mediaToneNow()==="bold"?CER_EFF.media.bold.tilt:1;
}
/* 替补版「狂」留下的那一刀：对位挑战每一局成功率的修正（rotation.ts 用） */
export function mediaScrimAdj(){
  const m=S.media;
  return (m&&m.bench&&m.tone==="bold"&&m.si===S.si&&m.split===(S.split||0))
    ? (CER_EFF.mediaBench.bold.scrim||0) : 0;
}
/* 这一场是不是决赛：联赛季后赛第三轮、MSI 总决赛、世界赛决赛 */
export function isFinalMatch(){
  if(!S.career) return false;
  if(S.intl){ const B=S.intl.br, lab=B&&B.pending&&B.pending.label; return lab==="决赛"||lab==="总决赛"; }
  return !!(S.playoff&&S.playoff.alive!==false&&(S.playoff.round||1)>=3);
}
export function finalName(){
  if(!(S.match&&!S.match.done)&&S.cupMatch&&!S.cupMatch.done){ const C=CUPS[S.cupMatch.kind]; return `${(C&&C.name)||"杯赛"}决赛`; }
  if(S.intl) return S.intl.type==="msi"?"MSI 总决赛":"世界赛决赛";
  return `${S.homeLeague||"LPL"}${["春季赛","夏季赛"][S.split||0]||""}决赛`;
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
/* 二次校准（玩家实锤 2026-09-09：「我的队伍 LNG 都拿了好多次冠军，黄金之路了，
   但是年度一阵二阵只有一个辅助入选，这不科学」）。上一版为了治「为什么都是一个战队的」，
   把上限从 19 一刀砍到 7.5——但同一次改动**还加了 AWARD_TEAM_CAP=3**，
   「一支队包揽五席」这件事已经由那道闸挡住了，加分不必再兼职当闸。
   砍过头的代价这次量出来了：合成黄金之路（联赛+MSI+世界赛全拿）的 20 个赛季里，
   一阵平均只占 2.25 席，**6 次只拿到 1 席**——玩家看到的就是这一档。

   扫了 ×1 / ×1.3 / ×1.5 / ×1.75 / ×2 五档，两头的投诉放在同一张表上看：

     倍数   一阵均  只拿1席  MVP    入选者比该位置最强低（均/最差）
     ×1     2.25    30%     75%    2.0 / 6.0      ← 现在，横扫也进不去
     ×1.5   2.65    10%     90%    2.5 / 7.5      ← 取这一档
     ×2     3.00     0%    100%    3.3 / 8.3      ← 太绝对，横扫必满席必 MVP

   ×1.5 之后横扫的队仍然不是稳拿三席（20 次里 5 次没顶满、2 次只有 1 席），
   而「入选者比该位置最强低」只从 2.0 挪到 2.5、最差 6.0 → 7.5，
   离当年那句「68 分进一阵、84 分落选」（差 16 分）还远得很。 */
export const AWARD_BONUS={worlds:4.5, msi:2.5, league:3, top4:1.5};
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
    if(p.me){
      // 年度评选看整年（常规赛 + 季后赛），不只看当前赛段的常规赛（玩家实锤 2026-09-10）
      const sr=yearRating(S.si); if(sr!==null) sc+=(sr-1.0)*6;
      sc+=mvpBonus(S.si);   // 本场 MVP 进评选：常规赛 +0.5 / 季后赛 +1.0 每次，封顶 6
    }
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
  if(kind==="tunnel") return o+`<path d="M16 104h288"/><path d="M60 104V40l100-24 100 24v64" /><path d="M60 40l100 24 100-24M160 64v40" stroke-opacity=".5"/><path d="M80 104V60M240 104V60M110 104V70M210 104V70" stroke-opacity=".35"/><path d="M40 12l24 20M280 12l-24 20M160 4v14" stroke-opacity=".6"/><circle cx="160" cy="88" r="8"/><path d="M160 96v8M152 104h16" /></svg>`;
  if(kind==="board") return o+`<path d="M16 104h288"/><rect x="60" y="22" width="200" height="60" rx="2"/><path d="M60 82l-8 22M260 82l8 22"/><path d="M76 38h60M76 50h96M76 62h44" stroke-opacity=".6"/><path d="M190 42l14 14-14 14M212 42l14 14-14 14" stroke-opacity=".6"/><circle cx="238" cy="36" r="4" stroke-opacity=".6"/><path d="M40 104v-14h18v14M262 104v-14h18v14" stroke-opacity=".5"/></svg>`;
  if(kind==="media") return o+`<path d="M16 104h288"/><rect x="40" y="18" width="240" height="60" rx="2" stroke-opacity=".5"/><path d="M56 34h40M112 34h40M168 34h40M224 34h40M56 62h40M112 62h40M168 62h40M224 62h40" stroke-opacity=".25"/><path d="M160 78v26M140 104h40"/><path d="M92 104v-16M228 104v-16M92 88a6 6 0 0 1 6-6h4M228 88a6 6 0 0 0-6-6h-4" stroke-opacity=".6"/><rect x="96" y="76" width="10" height="14" rx="3" stroke-opacity=".6"/><rect x="214" y="76" width="10" height="14" rx="3" stroke-opacity=".6"/><path d="M150 26h20M146 36h28" stroke-opacity=".5"/></svg>`;
  if(kind==="night") return o+`<path d="M16 104h288"/><path d="M30 104V72h260v32"/><rect x="140" y="44" width="40" height="26" rx="2"/><path d="M160 70v8M146 84h28"/><path d="M60 44h40M60 56h40M220 44h40M220 56h40" stroke-opacity=".18"/><path d="M20 24h280" stroke-opacity=".15"/><circle cx="160" cy="18" r="5" stroke-opacity=".8"/><path d="M160 23v12" stroke-opacity=".5"/><path d="M120 40l40-14 40 14" stroke-opacity=".25"/></svg>`;
  if(kind==="clinic") return o+`<path d="M16 104h288"/><path d="M60 92h200v12H60z"/><path d="M60 92V70h200v22M70 70V60h60v10" /><path d="M250 30v40M230 50h40" stroke-opacity=".7"/><rect x="220" y="20" width="60" height="60" rx="4" stroke-opacity=".35"/><path d="M40 40h40M40 52h30" stroke-opacity=".3"/><path d="M96 60c8-10 20-10 28 0" stroke-opacity=".5"/></svg>`;
  if(kind==="trophy") return o+`<path d="M120 20h80v30c0 22-18 40-40 40s-40-18-40-40z"/><path d="M120 28H98c0 18 8 30 24 34M200 28h22c0 18-8 30-24 34"/><path d="M160 90v12M140 104h40M134 110h52"/><path d="M160 6v6M126 10l3 5M194 10l-3 5M100 40l-6 2M220 40l6 2" stroke-opacity=".5"/><path d="M40 104h240" stroke-opacity=".4"/></svg>`;
  return o+`</svg>`;
}

/* ---------- 题库 ----------
   版本发布会的五道题答案由 SEASONS[si] 算出来（红利位、关键属性、无畏征召、你的位置吃不吃版本），
   不是拍脑袋。媒体日不判对错，每个答案带一个口径：狂 / 稳 / 甩锅。
   摆盘（选项顺序）用 Math.random，不碰种子。 */
const shuffle=arr=>{ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const POS_GROUP={top:"上半区（上单 / 打野）",jng:"上半区（上单 / 打野）",mid:"中路",bot:"下路双人组",sup:"下路双人组"};
const DIM_PLAY={
  操作:"线上压人，个人对线拿优势——手上的细节决定一切",
  运营:"资源置换、视野和转线——把地图打成一张账",
  心态:"打后期，别急，等对面失误——谁先手抖谁输",
  指挥:"前中期抱团决策——一个声音说话，全队跟着动",
  体质:"拖长局、拼续航——BO5 打到第五局还有手"
};
export function patchQuiz(){
  const sea: any=SEASONS[S.si]||{}; const fav=sea.fav||[]; const dim=sea.dim||"操作";
  const favG=POS_GROUP[fav[0]]||"中路";
  const groups=["上半区（上单 / 打野）","中路","下路双人组"];
  const q1={q:"这个版本的红利位在哪？",ctx:"版本主题「"+(sea.ver||"")+"」。",a:shuffle(groups.map(g=>({t:g,ok:g===favG})))};
  const dims=shuffle(DIMS.filter(d=>d!==dim)).slice(0,2).concat([dim]);
  const q2={q:"这个版本最吃哪一维？",ctx:"教练问的是全队都该往哪练。",a:shuffle(dims.map(d=>({t:d,ok:d===dim})))};
  const plays=shuffle(Object.keys(DIM_PLAY).filter(d=>d!==dim)).slice(0,2).concat([dim]);
  const q3={q:"所以我们怎么打？",ctx:"白板上只写一行。",a:shuffle(plays.map(d=>({t:DIM_PLAY[d],ok:d===dim})))};
  const q4=sea.fearless
    ?{q:"这个赛季是无畏征召，英雄池怎么准备？",ctx:"同一个英雄一个系列赛只能用一次。",a:shuffle([
        {t:"池子要深——BO5 至少备五个能上场的",ok:true},{t:"练熟两三个绝活就够，剩下靳队友",ok:false},{t:"看对面禁什么再说",ok:false}])}
    :{q:"英雄池怎么准备？",ctx:"常规征召，禁选照旧。",a:shuffle([
        {t:"两三个绝活练到极致，逼对面 ban",ok:true},{t:"每个英雄都练一点，什么都能拿",ok:false},{t:"看版本每周换本命",ok:false}])};
  const mine=fav.includes(S.pos);
  const q5={q:"对面会怎么针对我们？",ctx:`你打的是${POSN[S.pos]||"这个位置"}。`,a:shuffle([
    {t:mine?`我的位置是红利位，对面会 ban 我的池子——我得多备两手`:`红利位在${favG}，对面会围着那边打——我要帮队友分担`,ok:true},
    {t:mine?`红利位不在我这，我按平时打就行`:`对面会盯着我打，我得多备两手`,ok:false},
    {t:"看对面 BP 再说，赛前想这些没用",ok:false}])};
  return {sec:8,qs:[q1,q2,q3,q4,q5]};
}
/* 替补版：一题、只有稳和狂两个口径。作者拍板做「替补版一题」而不是整个屏蔽——
   这段戏留着，只是身份对得上：你不在背景板前，你在收工的走廊里。 */
export function mediaQuizBench(){
  const inc=S.understudy;
  const q={q:inc?`记者收拾器材的时候顺口问你：「${inc.id} 状态挺好的，你什么时候能上？」`
                :"记者收拾器材的时候顺口问你：「你什么时候能上？」",
    ctx:"他没打开录音笔。这句话大概率不会见报——但走廊里还站着教练组的人。",
    a:shuffle([{t:"给我机会就行，我打给他看。",tone:"bold"},
               {t:"练到位了自然会上。",tone:"steady"}])};
  return {sec:10,qs:[q]};
}
export function mediaQuiz(){
  if(isBenched()) return mediaQuizBench();
  const ls=S.lastSeason;
  const mates=(S.world&&S.world[S.homeLeague||"LPL"]||[]).find(t=>t.name===S.team);
  const mate=mates&&mates.players.filter(p=>!p.me)[Math.floor(Math.random()*Math.max(1,mates.players.filter(p=>!p.me).length))];
  const rv: any=topRival();
  const lastTxt=!ls?null:ls.result==="champion"?"上赛段你们夺冠了":typeof ls.result==="number"?`上赛段你们${["季后赛首轮","半决赛","决赛"][ls.result-1]||"季后赛"}被淘汰`:"上赛段你们没进季后赛";
  const q1={q:lastTxt?`${lastTxt}。这个赛段目标是什么？`:"第一个赛段，给自己定个目标？",ctx:"第一个记者。镜头对着你。",a:shuffle([
    {t:"冠军。别的不算目标。",tone:"bold"},{t:"一场一场打，先把首发坐稳。",tone:"steady"},{t:lastTxt&&ls.result!=="champion"?"上赛段的问题不在我这。这次看队里怎么调整。":"看教练组怎么安排，我配合。",tone:"blame"}])};
  const q2={q:mate?`和 ${mate.id} 的配合磨合得怎么样？`:"和新队友的配合磨合得怎么样？",ctx:"第二个记者。他上周写过你们更衣室。",a:shuffle([
    {t:"配合？我带节奏，他跟上就行。",tone:"bold"},{t:"训练赛在磨，赛场上见。",tone:"steady"},{t:"他还在适应。我尽量照顾他。",tone:"blame"}])};
  const q3={q:rv?`${rv.id}（${rv.team}）说这个赛区没人能和他对线。`:`有对手说这个赛区${POSN[S.pos]||"这个位置"}没人能和他对线。`,ctx:"第三个记者。他在等一个标题。",a:shuffle([
    {t:"那他来试试。",tone:"bold"},{t:"赛场上说话。",tone:"steady"},{t:"我们上赛段输是因为团队，不是对线。",tone:"blame"}])};
  return {sec:10,qs:[q1,q2,q3]};
}

/* 战术题库：突破试炼里指挥 / 运营那两维用（运营那套「记忆」要峡谷简笔画，先用决策代）。八道取五道 */
const TACTIC_POOL=[
  {q:"对面打野在下半区露头，你们上路有先锋。",a:[{t:"上半区开先锋，让对面二选一",ok:true},{t:"全队下路反蹲",ok:false},{t:"各自发育，等对面失误",ok:false}]},
  {q:"落后四千经济，对面五人推中。",a:[{t:"守高地，等大龙刷新前的那波换血",ok:true},{t:"分带偷家",ok:false},{t:"中路正面接团",ok:false}]},
  {q:"你们领先，对面把视野全插在你们野区。",a:[{t:"排掉眼，把节奏拖回己方半区",ok:true},{t:"直接开大龙逼团",ok:false},{t:"四一分推",ok:false}]},
  {q:"小龙刷新前 40 秒，对面辅助不见了。",a:[{t:"下路先撤，等视野再说",ok:true},{t:"下路继续推线",ok:false},{t:"打野去小龙坑蹲",ok:false}]},
  {q:"你们的下路被单杀两次，塔还在。",a:[{t:"换线，让上路去下路拿塔",ok:true},{t:"打野下路住",ok:false},{t:"让下路自己顶",ok:false}]},
  {q:"对面中单没闪，你的打野在河道。",a:[{t:"让打野绕后，你先手",ok:true},{t:"等对面推线再说",ok:false},{t:"叫全队来中",ok:false}]},
  {q:"三十分钟，双方都是六神装。",a:[{t:"把地图做满视野，逼对面先动",ok:true},{t:"直接开大龙",ok:false},{t:"四人抱团推塔",ok:false}]},
  {q:"对面拿了三个团战英雄，你们是分推阵容。",a:[{t:"别接团，四一分推拉扯",ok:true},{t:"抱团正面打",ok:false},{t:"打野入侵野区",ok:false}]}
];
export function tacticQuiz(){
  const qs=shuffle(TACTIC_POOL).slice(0,5).map(q=>({q:q.q,ctx:"白板前只有你和教练。",a:shuffle(q.a)}));
  return {sec:8,qs};
}

/* ---------- 界面 ---------- */
// 杯赛的比赛卡自己就是一层弹窗；决赛之夜要压在它上面开场，所以「正在打的杯赛」不算挡路（第三批测试抓的）
const OTHER_POPS=()=>!!(S.intlChamp||S.rndEv||S.rndResult||S.locker||S.confirm||S.autoSum||S.patchNote||S.rankUp||S.streamOffer||S.cupResult||(S.cupMatch&&!(S.cer&&S.cer.k==="final"))||(S.achPop&&S.achPop.length));
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
  }else if(c.k==="final"){
    const m=liveMatch(), opp=(m&&(m.oppName||m.opp))||"对手", fn=finalName(), cup=!(S.match&&!S.match.done);
    if(st==="story") body=`${scene("tunnel")}<div class="cer-eyebrow">${SEASONS[S.si]?SEASONS[S.si].tag:""} · ${fn} · 入场</div>
      <p class="cer-p">${cup?`<b>网吧包场。</b>朋友都来了，后排站着几个不认识的人。对面 <b>${opp}</b> 已经坐下了，主持人在调麦。这是你第一次有观众——最后一次热身。`
        :`<b>入场通道。</b>灯光从尽头打过来，观众的声浪隔着墙都在震。对面 <b>${opp}</b> 从另一条通道走出来，赛前握手，谁都没看谁的眼睛。回到座位——最后一次热身。`}</p>
      <p class="cer-hint">接下来轮到你：<b>反应</b>——靶亮起就点，20 秒。决赛的靶更小、亮得更短。金档：<b>这一场战力 +2、临场决策成功率 +5%</b>；银档：按平时打；铜档：−1、−3%。</p>
      ${btns(`<button class="btn primary" data-cer="next">热身 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">反应 · 靶亮起就点</div><div id="cer-game" data-game="react" data-hard="${S.career?1:0}" data-pre="${S.career?0:1}"></div>${btns("")}`;
    else body=resultBody(c,"tunnel");
  }else if(c.k==="bench"){
    const tr=S.tryout, team=(tr&&tr.team)||"俱乐部";
    if(st==="story") body=`${scene("room")}<div class="cer-eyebrow">${team} · 试训第一天 · 上机</div>
      <p class="cer-p"><b>到基地。</b>前台登记、见教练组、分机位——你的位子在最靠墙那台。主教练没多说：「先上机打几把给我们看看。」身后架着一台录屏的机器。</p>
      <p class="cer-hint">接下来轮到你：<b>反应</b>——靶亮起就点，20 秒。金档：<b>这次试训评级 +1 档</b>；银档：不变；铜档：−1 档。</p>
      ${btns(`<button class="btn primary" data-cer="next">上机 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">反应 · 靶亮起就点</div><div id="cer-game" data-game="react" data-pre="1"></div>${btns("")}`;
    else body=resultBody(c,"room");
  }else if(c.k==="patch"){
    const sea: any=SEASONS[S.si]||{};
    if(st==="story") body=`${scene("board")}<div class="cer-eyebrow">${sea.tag} · 版本发布会 · 教练组开会</div>
      <p class="cer-p"><b>训练室的白板。</b>教练念了三条这个版本的变化：主题「<b>${sea.ver||""}</b>」，红利位在 <b>${(sea.fav||[]).map(x=>POSN[x]).join("、")}</b>，<b>${sea.dim}</b>的权重上升${sea.fearless?"，而且是<b>无畏征召</b>":""}。然后他放下笔：「我们怎么打？」</p>
      <p class="cer-hint">接下来轮到你：<b>决策</b>——五道题，每题 8 秒三选一，答案就在他刚念的那三条里。金档（≥4 题）：<b>整个赛季版本相性 +0.5</b>；银档（2–3 题）：不变；铜档（≤1 题）：−0.3。</p>
      ${btns(`<button class="btn primary" data-cer="next">开会 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">决策 · 8 秒一题</div><div id="cer-game" data-game="decide" data-quiz="patch"></div>${btns("")}`;
    else body=resultBody(c,"board");
  }else if(c.k==="media"){
    if(st==="story") body=`${scene("media")}<div class="cer-eyebrow">${SEASONS[S.si].tag} ${["春季赛","夏季赛"][S.split||0]||""} · 媒体日</div>
      <p class="cer-p"><b>背景板前。</b>三个记者，三个问题，每个都在等一个标题。你说的每句话这个赛段都会被翻出来——<b>狂</b>会涨热度，但输了更伤心态；<b>稳</b>不留把柄；<b>甩锅</b>热度也涨，只是队友看得懂你在说谁。</p>
      <p class="cer-hint">不是小游戏，是<b>限时三选一</b>：每题 10 秒，不答按「稳」算。三题里占多数的那个口径，就是你这个赛段的基调。</p>
      ${btns(`<button class="btn primary" data-cer="next">面对镜头 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">媒体日 · 10 秒一题</div><div id="cer-game" data-game="decide" data-quiz="media"></div>${btns("")}`;
    else body=mediaResultBody(c);
  }else if(c.k==="trial"){
    const d=c.dim||"操作", mech=TRIAL_MECH[d]||"react";
    const MN={react:"反应——靶亮起就点，20 秒",focus:"专注——25 格数字按顺序点完，没有弹幕，只有你",decide:"决策——五道战术题，每题 8 秒",rhythm:"节奏——跟着呼吸圆，20 秒"}[mech];
    if(st==="story") body=`${scene("night")}<div class="cer-eyebrow">${SEASONS[S.si].tag} · 突破试炼 · ${d}</div>
      <p class="cer-p"><b>训练室只剩你一个。</b>别人都走了，教练把门关上：「你的${d}已经到头了。今天不过这一关，别回去。」</p>
      <p class="cer-hint">接下来轮到你：<b>${MN}</b>。只有<b>金档</b>算过关：<b>${d}天花板 +1，当场兑现</b>。没过不扣什么，下个赛段再来。</p>
      ${btns(`<button class="btn primary" data-cer="next">开始 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">${d} · ${MN.split("——")[0]}</div><div id="cer-game" data-game="${mech}" data-quiz="tactic" data-quiet="1"></div>${btns("")}`;
    else body=resultBody(c,"night");
  }else if(c.k==="rehab"){
    const inj=S.injury||{n:"伤",left:2};
    if(st==="story") body=`${scene("clinic")}<div class="cer-eyebrow">康复期 · ${inj.n}</div>
      <p class="cer-p"><b>理疗室。</b>墙上贴着康复计划表，${inj.left} 周。理疗师说：「急不来。呼吸跟着我。」</p>
      <p class="cer-hint">接下来轮到你：<b>节奏</b>——跟着呼吸圆，在它最大的时候点，20 秒。金档：<b>少养一周</b>；银档 / 铜档：按原计划。</p>
      ${btns(`<button class="btn primary" data-cer="next">开始 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">节奏 · 圆最大的时候点一下</div><div id="cer-game" data-game="rhythm"></div>${btns("")}`;
    else body=resultBody(c,"clinic");
  }else if(c.k==="allstar"){
    if(st==="miss") body=`${scene("stage")}<div class="cer-eyebrow">${SEASONS[S.si].tag} · 全明星周末</div>
      <p class="cer-p"><b>投票结果出来了。</b>名单上没有你的名字。你在直播间看完了技巧赛——明年让他们投。</p>
      <div class="row cer-btns"><button class="btn primary" data-cer="close">关掉直播 →</button></div>`;
    else if(st==="story") body=`${scene("stage")}<div class="cer-eyebrow">${SEASONS[S.si].tag} · 全明星周末</div>
      <p class="cer-p"><b>你入选了。</b>灯光、音乐、观众席上举着你 ID 的牌子。技巧赛第一项：反应——全场最快的手是谁。</p>
      <p class="cer-hint">接下来轮到你：<b>反应</b>——靶亮起就点，20 秒。金档：<b>人气 +20</b>、成就「技巧赛之王」；银档：+8；铜档：0。</p>
      ${btns(`<button class="btn primary" data-cer="next">上台 →</button>`)}`;
    else if(st==="game") body=`<div class="cer-eyebrow">技巧赛 · 反应</div><div id="cer-game" data-game="react"></div>${btns("")}`;
    else body=resultBody(c,"stage");
  }else if(c.k==="farewell0"){
    body=`${scene("stage")}<div class="cer-eyebrow">${SEASONS[S.si].tag} · 退役赛季</div>
      <p class="cer-p"><b>这是最后一年。</b>合同、年纪、手速——都在说同一件事。你没有告诉太多人，但消息还是传出去了：这个赛季每一个客场，都会有人举着横幅送你。</p>
      <p class="cer-hint">退役赛季：客场会有告别横幅；夏季赛最后一场常规赛<b>战力 +2</b>；赛季结束有退役仪式。名片上会多一行。</p>
      <div class="row cer-btns"><button class="btn primary" data-cer="close">打完这一年 →</button></div>`;
  }else if(c.k==="farewell"){
    /* 点名（羁绊第二批）：陪你最久的那个、你带出来的那个，各说一句。
       原来这里是一句通用台词——因为队友一离开名单，你和他的一切就被删了，
       游戏说不出是谁。现在共事账本记着（bond.ts）。 */
    const _bl=bondFarewellLines();
    body=`${scene("stage")}<div class="cer-eyebrow">退役仪式</div>
      <p class="cer-p"><b>灯光打到台上。</b>${_bl.length?_bl.join("<br>"):`队友：「${S.team||"队里"}的位置一直给你留着。」`}<br>教练：「你是我带过最听不进话、也最能打出来的人。」看台上的横幅写着你的 ID，和第一年一样。</p>
      <p class="cer-p">你把外设收进包里。灯暗下来的时候，你没有回头。</p>
      <div class="row cer-btns"><button class="btn primary" data-cer="close">看生涯名片 →</button></div>`;
  }else if(c.k==="awards"){
    body=awardsBody(c.data);
  }
  return `<div class="cer" role="dialog" aria-modal="true" aria-label="仪式"><div class="cer-inner">${body}</div></div>`;
}
const RESULT_EFF={
  draw:  {gold:"整个季后赛状态 <b>+3</b>",silver:"整个季后赛状态 <b>不变</b>",bronze:"整个季后赛状态 <b>−2</b>"},
  depart:{gold:"世界赛期间疲劳恢复 <b>更快（×1.3）</b>",silver:"世界赛期间疲劳恢复 <b>正常</b>",bronze:"世界赛期间疲劳恢复 <b>更慢（×0.8）</b>"},
  final: {gold:"这一场 <b>战力 +2、临场决策成功率 +5%</b>",silver:"这一场 <b>按平时打</b>",bronze:"这一场 <b>战力 −1、临场决策成功率 −3%</b>"},
  bench: {gold:"这次试训 <b>评级 +1 档</b>",silver:"这次试训 <b>评级不变</b>",bronze:"这次试训 <b>评级 −1 档</b>"},
  patch: {gold:"整个赛季 <b>版本相性 +0.5</b>",silver:"整个赛季 <b>版本相性不变</b>",bronze:"整个赛季 <b>版本相性 −0.3</b>"},
  trial: {gold:"<b>过关</b>——这一维天花板 <b>+1</b>，当场兑现",silver:"没过。不扣什么，<b>下个赛段再来</b>",bronze:"没过。不扣什么，<b>下个赛段再来</b>"},
  rehab: {gold:"恢复比预期快，<b>少养一周</b>",silver:"按原计划养",bronze:"按原计划养"},
  allstar:{gold:"全场最快的手。<b>人气 +20</b>",silver:"中规中矩，<b>人气 +8</b>",bronze:"手凉了，观众替你尴尬"}
};
const RESULT_BTN={draw:"打季后赛 →",depart:"出发 →",final:"上场 →",bench:"进第一天 →",patch:"开赛 →",trial:"回去睡觉 →",rehab:"回去养 →",allstar:"表演赛 →"};
function resultDetail(c){
  const d=c.detail||{};
  if(c.k==="draw") return d.sec!==undefined?`用时 ${d.sec.toFixed(1)} 秒${d.wrong?`，点错 ${d.wrong} 次`:""}`:"";
  if(c.k==="depart"||c.k==="rehab") return d.ms!==undefined?`平均误差 ${Math.round(d.ms)} 毫秒，${d.hit||0}/${d.total||8} 次踩上`:"";
  if(c.k==="trial"){ if(d.sec!==undefined) return `用时 ${d.sec.toFixed(1)} 秒${d.wrong?`，点错 ${d.wrong} 次`:""}`; if(d.ms!==undefined&&d.rate===undefined) return `平均误差 ${Math.round(d.ms)} 毫秒`; if(d.n!==undefined) return `答对 ${d.n}/${d.total||5} 题`; }
  if(c.k==="final"||c.k==="bench"||c.k==="allstar"||c.k==="trial") return d.rate!==undefined?`命中 ${Math.round(d.rate*100)}%（${d.hit||0}/${d.total||0}），平均反应 ${d.ms>=9000?"—":Math.round(d.ms)+" 毫秒"}`:"";
  if(c.k==="patch") return d.n!==undefined?`答对 ${d.n}/${d.total||5} 题`:"";
  return "";
}
function resultBody(c,art){
  const t=c.tier||"silver";
  const eff=(RESULT_EFF[c.k]||RESULT_EFF.draw)[t], det=resultDetail(c);
  return `${scene(art)}<div class="cer-eyebrow">结算</div>
    <div class="cer-tier ${t}">${TIER_N[t]}</div>
    <p class="cer-p">${det}${det?"。":""}${eff}。</p>
    <div class="row cer-btns"><button class="btn primary" data-cer="close">${RESULT_BTN[c.k]||"继续 →"}</button></div>`;
}
/* 媒体日没有金银铜，结算页写的是口径 */
function mediaResultBody(c){
  const d=c.detail||{}, tone=d.tone||"steady", E=CER_EFF.media[tone]||CER_EFF.media.steady;
  const picks=(d.picks||[]).map(x=>MEDIA_TONE_N[x]||x).join(" · ");
  const eff=tone==="bold"?`热度 <b>+15</b>，<b>这个赛段输掉的比赛攒的心态压力 ×1.5</b>——话说出去了，就得打回来`
    :tone==="steady"?`热度 <b>+5</b>，没留下把柄`:`热度 <b>+10</b>，<b>更衣室信任 −3</b>——队友看得懂你在说谁`;
  return `${scene("media")}<div class="cer-eyebrow">明天的标题</div>
    <div class="cer-tier ${tone==="bold"?"gold":tone==="blame"?"bronze":""}">${MEDIA_TONE_N[tone]}</div>
    <p class="cer-p">${picks?`三个回答：${picks}。`:""}这个赛段的基调是<b>${MEDIA_TONE_N[tone]}</b>：${eff}。</p>
    <div class="row cer-btns"><button class="btn primary" data-cer="close">开赛 →</button></div>`;
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
function clearTimers(){ _timers.forEach(t=>{ try{ clearInterval(t); clearTimeout(t); cancelAnimationFrame(t); }catch(e){} }); _timers=[]; _mgLive=false; }
/* 小游戏正在台上（玩家实锤 2026-09-08：靶场点了「开始」之后会重新开始）。
   cerBind 挂在每次 render 末尾，render 会把 #stage 整个重写——正在跑的那一局连 DOM 带计时器
   一起被换掉，界面回到「点一下开始」。所以小游戏一挂上就锁住重画：这时候屏幕上只有这张模态卡，
   后面的东西没有什么要更新的。结算（cerFinish）、跳过（cerSkip）都先走 clearTimers 解锁再画。 */
let _mgLive=false;
export function mgLive(){ return _mgLive && !!S.cer; }
export function cerBind(st){
  clearTimers();
  if(!st||!st.querySelectorAll) return;
  st.querySelectorAll("[data-cer]").forEach((b: any)=>b.onclick=()=>{
    const a=b.dataset.cer;
    if(a==="next") cerNext(); else if(a==="skip"){ clearTimers(); cerSkip(); } else if(a==="close") cerClose();
  });
  const g=st.querySelector("#cer-game");
  if(g){
    const kind=g.getAttribute("data-game");
    const quiz=g.getAttribute("data-quiz");
    if(kind==="focus") focusMount(g,{quiet:g.getAttribute("data-quiet")==="1"});
    else if(kind==="react") reactMount(g,{hard:g.getAttribute("data-hard")==="1",pre:g.getAttribute("data-pre")==="1"});
    else if(kind==="decide") decideMount(g,quiz==="media"?mediaQuiz():quiz==="tactic"?tacticQuiz():patchQuiz(),quiz==="media");
    else rhythmMount(g);
  }
  st.querySelectorAll("[data-camp]").forEach((b: any)=>b.onclick=()=>pickCamp(b.dataset.camp));
  st.querySelectorAll("[data-meet]").forEach((b: any)=>b.onclick=()=>pickMeet(b.dataset.meet));
}
const reduced=()=>{ try{ return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches); }catch(e){ return false; } };
const DANMU=["别再演了","这队没戏","就这？","下赛季见","打野在干嘛","抽到他们稳了","菜就多练","坐等翻车","我信你一次","别送了","这把稳吗","上次也这么说"];

/* 专注：舒尔特 25 格 + 弹幕遮挡。点错罚 0.5 秒；40 秒没点完按铜档。 */
export function focusMount(el,opt?){
  _mgLive=true;
  const nums=[]; for(let i=1;i<=25;i++) nums.push(i);
  for(let i=nums.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [nums[i],nums[j]]=[nums[j],nums[i]]; }
  const noDm=reduced()||!!(opt&&opt.quiet);   // 突破试炼的专注没有弹幕：深夜训练室只有你
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
  _mgLive=true;
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

/* 反应：靶在随机位置亮起，亮 0.7–0.9 秒（决赛 0.55–0.7 秒、靶更小），20 秒；看命中率和平均反应。
   点空白处不罚分但会记下来；标签页切后台时定时器照跑，回来就是结果。 */
export function reactMount(el,opt){
  _mgLive=true;
  const hard=!!(opt&&opt.hard), pre=!!(opt&&opt.pre);
  const TOTAL=20000, SIZE=hard?36:44, LIT=hard?[550,700]:[700,900], GAP=hard?[220,420]:[280,520];
  el.innerHTML=`<div class="mg-head"><span>命中 <b id="mg-hit">0</b>/<span id="mg-n">0</span></span><span class="mono" id="mg-t">20.0 秒</span></div>
    <div class="mg-arena" id="mg-arena" role="application" aria-label="靶亮起就点"><button type="button" class="btn primary mg-go" id="mg-go">点一下开始</button></div>
    <p class="cer-hint" style="margin-top:8px">${hard?"决赛的靶更小、亮得更短。":""}靶只亮一下，点到就算，没点到就过去了。</p>`;
  const arena=el.querySelector("#mg-arena") as any, go=el.querySelector("#mg-go") as any, tEl=el.querySelector("#mg-t"), hEl=el.querySelector("#mg-hit"), nEl=el.querySelector("#mg-n");
  let t0=0, started=false, done=false, spawned=0, hit=0, miss=0, stray=0; const rts: number[]=[];
  let cur: any=null, curAt=0;
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const finish=()=>{ if(done) return; done=true; clearTimers(); if(cur){ try{ cur.remove(); }catch(e){} cur=null; }
    const total=spawned||1, rate=hit/total, ms=rts.length?rts.reduce((a,b)=>a+b,0)/rts.length:9999;
    cerFinish(reactTier(rate,ms,pre),{rate,ms,hit,total:spawned,miss,stray}); };
  const kill=()=>{ if(cur){ try{ cur.remove(); }catch(e){} cur=null; } };
  const spawn=()=>{ if(done||!document.body.contains(el)) return;
    /* 时间不够就别再放靶（玩家实锤 2026-09-09：第 28 下金圈刚出来就直接弹结算，
       没给点的机会，还被算成一次没中，命中率写成 23/24）。靶最长亮 LIT[1]，
       再留 260 毫秒的手速余量——放不下一个完整的靶，就把剩下的时间走完。 */
    const left=TOTAL-(Date.now()-t0);
    if(left<LIT[1]+260){ const end=setTimeout(finish,Math.max(0,left)); _timers.push(end); return; }
    kill();
    const W=arena.clientWidth||300, H=arena.clientHeight||240;
    const b=document.createElement("button"); b.type="button"; b.className="mg-target"; b.setAttribute("aria-label","靶");
    b.style.width=b.style.height=SIZE+"px";
    b.style.left=Math.round(rnd(4,Math.max(4,W-SIZE-4)))+"px"; b.style.top=Math.round(rnd(4,Math.max(4,H-SIZE-4)))+"px";
    spawned++; if(nEl) nEl.textContent=String(spawned);
    curAt=Date.now(); cur=b;
    const on=(ev)=>{ if(ev){ ev.preventDefault&&ev.preventDefault(); ev.stopPropagation&&ev.stopPropagation(); } if(done||cur!==b) return;
      hit++; rts.push(Date.now()-curAt); if(hEl) hEl.textContent=String(hit); b.classList.add("hit"); cur=null;
      const tm=setTimeout(()=>{ try{ b.remove(); }catch(e){} },90); _timers.push(tm);
      const nx=setTimeout(spawn,rnd(GAP[0],GAP[1])); _timers.push(nx); };
    b.onpointerdown=on; b.onclick=(ev)=>{ if(ev&&ev.pointerType==="") on(ev); };
    arena.appendChild(b);
    const lit=setTimeout(()=>{ if(cur===b){ miss++; kill(); const nx=setTimeout(spawn,rnd(GAP[0],GAP[1])); _timers.push(nx); } },rnd(LIT[0],LIT[1]));
    _timers.push(lit);
  };
  const start=(ev)=>{ if(ev&&ev.preventDefault) ev.preventDefault(); if(started) return; started=true; t0=Date.now(); try{ go.remove(); }catch(e){}
    const tick=setInterval(()=>{ if(!document.body.contains(el)){ clearInterval(tick); return; } const left=Math.max(0,TOTAL-(Date.now()-t0)); if(tEl) tEl.textContent=(left/1000).toFixed(1)+" 秒"; if(left<=0) finish(); },100);
    _timers.push(tick);
    const first=setTimeout(spawn,500); _timers.push(first); };
  if(go){ go.onpointerdown=start; go.onclick=(ev)=>{ if(ev&&ev.pointerType==="") start(ev); }; }
  if(arena){ arena.onpointerdown=(ev)=>{ if(!started||done) return; const tg=ev&&ev.target; if(tg&&(tg as any).classList&&(tg as any).classList.contains("mg-target")) return; stray++; }; }
}
/* 决策 / 限时三选一：一题一屏，倒计时条走完没答就按「没答」记（发布会 = 答错；媒体日 = 稳）。 */
export function decideMount(el,quiz,isMedia){
  _mgLive=true;
  const qs=(quiz&&quiz.qs)||[], SEC=(quiz&&quiz.sec)||8;
  let i=0, done=false; const picks: any[]=[]; let n=0;
  const finish=()=>{ if(done) return; done=true; clearTimers();
    if(isMedia){ const cnt={bold:0,steady:0,blame:0}; picks.forEach(t=>{ cnt[t]=(cnt[t]||0)+1; });
      const tone=cnt.bold>cnt.steady&&cnt.bold>cnt.blame?"bold":cnt.blame>cnt.steady&&cnt.blame>cnt.bold?"blame":"steady";
      cerFinish("silver",{tone,picks}); }
    else cerFinish(decideTier(n),{n,total:qs.length,picks}); };
  const show=()=>{ if(done||!document.body.contains(el)) return;
    if(i>=qs.length){ finish(); return; }
    const q=qs[i];
    el.innerHTML=`<div class="mg-head"><span>第 <b>${i+1}</b>/${qs.length} 题</span><span class="mono" id="mg-t">${SEC}.0 秒</span></div>
      <div class="mg-bar"><i id="mg-bar"></i></div>
      <div class="mg-q">${q.q}</div>${q.ctx?`<div class="mg-ctx">${q.ctx}</div>`:""}
      <div class="mg-opts">${q.a.map((a,k)=>`<button type="button" class="mg-opt" data-k="${k}">${a.t}</button>`).join("")}</div>`;
    const t0=Date.now(), bar=el.querySelector("#mg-bar") as any, tEl=el.querySelector("#mg-t");
    let answered=false;
    const pick=(k)=>{ if(answered||done) return; answered=true; clearTimers();
      const a=k>=0?q.a[k]:null;
      if(isMedia) picks.push(a?a.tone:"steady"); else { picks.push(a?a.t:null); if(a&&a.ok) n++; }
      el.querySelectorAll(".mg-opt").forEach((b: any,idx)=>{ b.disabled=true; if(!isMedia){ if(q.a[idx].ok) b.classList.add("ok"); else if(idx===k) b.classList.add("bad"); } else if(idx===k) b.classList.add("ok"); });
      i++; const nx=setTimeout(show,isMedia?450:650); _timers.push(nx); };
    el.querySelectorAll(".mg-opt").forEach((b: any)=>{ const on=(ev)=>{ if(ev&&ev.preventDefault) ev.preventDefault(); pick(+b.dataset.k); }; b.onpointerdown=on; b.onclick=(ev)=>{ if(ev&&ev.pointerType==="") on(ev); }; });
    const tick=setInterval(()=>{ if(!document.body.contains(el)){ clearInterval(tick); return; } const left=Math.max(0,SEC*1000-(Date.now()-t0));
      if(tEl) tEl.textContent=(left/1000).toFixed(1)+" 秒"; if(bar) bar.style.width=(left/(SEC*10)).toFixed(1)+"%"; if(left<=0) pick(-1); },100);
    _timers.push(tick);
  };
  show();
}

/* ---------- 粉丝见面会（休赛期，人气够才有，一年一次） ----------
   办不办、办多大：三档场地，门票按粉丝算，成本先付。疲劳 >70 时一半概率办砸（热度掉、粉丝掉）。
   这是后期人气和钱的一个出口；托管不办，机器人不办，批测数字不动。 */
export const MEET_MIN_FANS=150;
export const MEETS=[
  {k:"small", n:"小型场地", cost:20,  cap:300,  per:0.30, fans:5,  heat:10, d:"一家咖啡馆的二楼，一百多个位子。"},
  {k:"mid",   n:"中型场地", cost:60,  cap:800,  per:0.35, fans:12, heat:25, d:"剧场，八百个位子，要请安保。"},
  {k:"big",   n:"大型场地", cost:150, cap:2000, per:0.40, fans:25, heat:50, d:"体育馆的副馆。灯光、舞台、周边全要自己出。"}
];
export function meetOpen(){ return !!(S.career&&S.off&&S.off.next==="year"&&(S.fans||0)>=MEET_MIN_FANS&&!(S.meet&&S.meet[S.si]!==undefined)); }
export function meetIncome(m){ return Math.round(Math.min(S.fans||0,m.cap)*m.per); }
export function meetCard(){
  if(!S.career||!S.off||S.off.next!=="year") return "";
  const done=S.meet&&S.meet[S.si];
  if(done){ const m=MEETS.find(x=>x.k===done.k); return m?`<div class="card"><h2>粉丝见面会<em>今年：${m.n} · ${done.ok?"办成了":"办砸了"}</em></h2><p class="note">${done.txt||m.d}</p></div>`:""; }
  if((S.fans||0)<MEET_MIN_FANS) return "";
  const tired=(S.fatigue||0)>70;
  return `<div class="card"><h2>粉丝见面会<em>休赛期 · 一年一次</em></h2>
    <p class="note">粉丝 ${Math.round(S.fans||0)}。门票收入按能来的人算，场地钱先付。${tired?`<b style="color:var(--red)">你现在疲劳 ${Math.round(S.fatigue)}——这个状态上台，一半概率办砸。</b>`:"状态还行，办得成。"}</p>
    <div class="grid g2">${MEETS.map(m=>{ const ok=(S.money||0)>=m.cost, inc=meetIncome(m);
      return `<button class="act" data-meet="${m.k}" ${ok?"":'disabled style="opacity:.34"'} title="${ok?"":"资金不够"}">
        <div class="t">${m.n} <i class="apc">−${m.cost} 万 / 约 +${inc} 万门票</i></div><div class="d">${m.d}<br><b>办成：热度 +${m.fans+m.heat}</b>（人气跟着热度慢慢涨）</div></button>`; }).join("")}
      <button class="act" data-meet="none"><div class="t">今年不办</div><div class="d">休赛期是休息的。</div></button></div></div>`;
}
export function pickMeet(k){
  if(!meetOpen()) return;
  S.meet=S.meet||{};
  if(k==="none"){ S.meet[S.si]={k:"none",ok:true,txt:"今年没办。"}; render(); return; }
  const m=MEETS.find(x=>x.k===k); if(!m) return;
  if((S.money||0)<m.cost) return;
  addMoney("meet",-m.cost);
  const inc=meetIncome(m);
  const flop=(S.fatigue||0)>70&&rnd()<0.5;
  if(flop){
    addMoney("meet",Math.round(inc*0.5)); addFans(-5); S.heat=Math.max(0,(S.heat||0)-15);
    S.meet[S.si]={k,ok:false,txt:`${m.n}办砸了：你在台上打了个哈欠被拍下来，热度掉了。门票只收回一半。`};
    pushEvent(`粉丝见面会（${m.n}）<b>办砸了</b>：疲劳 ${Math.round(S.fatigue)} 的人不该上台。门票收回 ${Math.round(inc*0.5)} 万，热度 −20、掉了一点粉。`,"bad","见面会");
  }else{
    addMoney("meet",inc); addFans(m.fans); S.heat=(S.heat||0)+m.heat;
    S.meet[S.si]={k,ok:true,txt:`${m.n}办成了：${m.d} 门票 ${inc} 万。`};
    pushEvent(`粉丝见面会（${m.n}）办成了：门票 <b>${inc} 万</b>，热度 +${m.fans+m.heat}。`,"good","见面会");
  }
  checkAch("meet",{k,ok:!flop});
  render();
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
