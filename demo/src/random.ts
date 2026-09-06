import { AUTO_KEYS } from "./auto";
import { addStaff } from "./clout";
import { DIMS, addFans, addFat, capOf, clamp, myStrength, preLog, preScore, pushEvent, q1, render, tacAdd, teamTenure } from "./main";
import { rnd } from "./rng";
import { addQuest, evMakeRival, evPickTeam, evRosterChange } from "./quest";
import { noteGrudge } from "./rivals";
import { addMoney, bizNote } from "./shop";
import { addSquad } from "./squad";
import { S } from "./state";
import { addTrustAll, avgTrust, salaryOf } from "./team";
import { addTraitPt } from "./trait";
import { queueInvite } from "./tryout";

/* ================= 随机事件 =================
   有好有坏，由你的选择决定走向。
   刻意做得「不致命」——最多是两周的临时增益或者一笔小钱，
   不会一次事件定生死。它们负责的是质感，不是数值。 */

/* 花钱的统一出口。
   际遇里原来是直接 pay(50) 这样扣，不看余额——实测 7% 的局
   会把资金扣成负数，最低到过 −35 万。而「负债」在这个游戏里
   没有任何机制承接：不影响什么，也解释不通，纯粹是个漏洞。
   现在买不起的选项在界面上就是禁用的，这里再兜一道底。 */
export function pay(n){
  if(S.money < n) return false;
  addMoney("other",-n);
  return true;
}

/* ---------- 临时增益 ---------- */
/* {k:效果, v:倍率/数值, left:剩余周数, n:显示名} */
export function addBuff(k,v,weeks,n){
  S.tbuff=S.tbuff||[];
  S.tbuff=S.tbuff.filter(b=>b.k!==k);       // 同类覆盖
  S.tbuff.push({k,v,left:weeks,n});
}
export function buffVal(k,dflt?){
  const b=(S.tbuff||[]).find(x=>x.k===k);
  return b?b.v:(dflt===undefined?1:dflt);
}
export function tickBuffs(){
  if(!S.tbuff) return;
  S.tbuff.forEach(b=>b.left--);
  S.tbuff=S.tbuff.filter(b=>b.left>0);
}
/* 增益必须把效果写在脸上。
   「设备拖后腿 2周」——拖的是什么后腿？「心无旁骛」又加什么？
   玩家看不懂就等于没有这条增益，只剩一个吓人的红框。
   所以每个 chip 都自己算出百分比，用当前公式现算，不写死。 */
export function buffPct(v){ const n=Math.round((v-1)*100); return `${n>=0?"+":"−"}${Math.abs(n)}%`; }
export function buffEffect(b){
  // train：直接乘进 gain()，就是训练收益
  if(b.k==="train") return `训练收益 ${buffPct(b.v)}`;
  // mood：同样乘进 gain()，另外还改排位胜率（soloWinP 里 (v-1)*8 加在实力差上）。
  //       实力差换算成胜率不是线性的，这里按「势均力敌时」折算，跟界面口径一致。
  if(b.k==="mood"){
    const md=(b.v-1)*8;
    const dp=(1/(1+Math.exp(-md/5.2))-0.5)*100;
    return `训练收益 ${buffPct(b.v)}・排位胜率 ${buffPct(1+dp/100)}`;
  }
  return buffPct(b.v);
}
export function buffChips(){
  if(!S.tbuff||!S.tbuff.length) return "";
  return `<div class="buffs">${S.tbuff.map(b=>
    `<span class="buff ${b.v>=1?'good':'bad'}">${b.n}<em>${buffEffect(b)}</em><i>${b.left}周</i></span>`).join("")}</div>`;
}

/* ---------- 事件池 ----------
   when: 触发条件；w: 在随机池里的相对权重
   auto:false —— 不进随机池，只由 fireEvent(id) 定向触发。
   选项的 e() 返回一句结果文字。

   为什么要分这两类：
   「你从小看的 EDG 今天又输了」原来是 when:()=>true 的纯随机事件——
   玩家未必认识 EDG，而且 EDG 那天到底输没输，游戏里是有答案的，
   凭空捏一个等于告诉玩家「这些文字和你的世界无关」。
   凡是能由真实发生的事引出来的，就不该靠摇骰子。            */
export const RANDOM_EVENTS=[
  /* ================= 伏笔事件（2026-09-04 玩家点名：前期要有会影响后面的事）=================
     职业前每个事件在 S.flags 上留一个标记，职业后由对应的「回响」事件兑现。
     一局各限一次。这些不是调味料——每个选择都在几年后有账。 */
  {id:"daida", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=25,
   q:()=>`有人私信开价 <b>5 万</b>，让你帮他把号打上钻石。「就几天的事，没人会知道。」`,
   ctx:"这个段位的代打市场一直存在。钱是真的，风险也是。",
   a:[{t:"接了，几天就完", g:"hard", e:()=>{ S.money+=5; (S.flags=S.flags||{}).daida=1;
        return "五万到账。你把那个号打到了钻石，然后删了聊天记录。<b>这件事没有消失，只是暂时没人提。</b>"; }},
      {t:"不接，这条线不能碰", g:"grind", e:()=>{ (S.flags=S.flags||{}).clean=1;
        S.attrs.心态=Math.min(capOf("心态"),q1(S.attrs.心态+0.5));
        return "你回了个「不做」。多年以后如果有人翻旧账，你的记录是干净的。心态 +0.5。"; }}]},

  {id:"cafecoach", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&S.money>=3,
   q:()=>`常去的那家网吧老板，聊起来才知道是退役辅助——打过次级联赛。他愿意收 <b>3 万</b>带你两周。`,
   ctx:"「你打得很凶，但你不知道为什么赢。这个我可以教。」",
   a:[{t:"交钱，学", cost:3, e:()=>{ pay(3);
        S.attrs.指挥=Math.min(capOf("指挥"),q1(S.attrs.指挥+1)); tacAdd(4,"网吧老板的两周课");
        return "两周里他给你拆了三十场录像，讲的全是视野、时机和资源交换。<b>指挥 +1，战术素养 +4。</b>"; }},
      {t:"算了，自己练", g:"grind", e:()=>"你觉得三万块能干别的。他也没多说。"}]},

  {id:"peilian", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career,
   q:()=>`排位里遇到个打得挺有想法的路人，加了好友。他说下个月有青训试训，想找人陪他冲一冲分。`,
   ctx:"没有报酬。就是花时间。",
   a:[{t:"陪他冲两周", g:"show", e:()=>{ addFat(6); addFans(4); (S.flags=S.flags||{}).peilian=1; S.pre.scoutSeen=(S.pre.scoutSeen||0)+1;
        return "两周双排，他的分冲上去了，你也顺便被他直播间的人认识了几个。<b>他说：以后进队了记得我。</b>"; }},
      {t:"没时间", g:"grind", e:()=>"你回了个「忙」。他没再找你。"}]},

  {id:"geardeal", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=60,
   q:()=>`一个小外设品牌找你签<b>独家</b>——现在给 <b>15 万</b>，条件是三年内不能用别家的键鼠露出。`,
   ctx:"钱不少。但「三年」对一个还没上岸的人来说，是很长的时间。",
   a:[{t:"签，先拿钱", g:"hard", e:()=>{ S.money+=15; (S.flags=S.flags||{}).exclusiveGear=1;
        bizNote("外设独家","小外设品牌","签了",15,"三年独家，别家键鼠不能露出");
        return "十五万到账，快递来了两套键鼠。合同锁在抽屉里。<b>三年很快的。</b>"; }},
      {t:"不签独家", g:"grind", e:()=>{ bizNote("外设独家","小外设品牌","拒了",0,"留着以后的选择"); return "你说想留着以后的选择。对方没再联系。"; }}]},

  {id:"reporter", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=100,
   q:()=>`一位跑赛区多年的记者想给你做一期「草根选手」的专访。她的号在圈里有分量。`,
   ctx:"她说：「我不吹你。我写我看到的。」",
   a:[{t:"接受采访", g:"show", e:()=>{ addFans(10); (S.flags=S.flags||{}).pressFriend=1;
        return "稿子发出来很克制，但看的人不少。<b>她留了你的联系方式：「上岸了告诉我。」</b>"; }},
      {t:"现在还不是时候", g:"grind", e:()=>"你觉得没打出成绩就上稿子太早。她说理解。"}]},

  {id:"acadwatch", rec:0, w:1.5, max:1, when:()=>!!S.pre&&!S.career&&preScore()>=50,
   q:()=>`一家俱乐部的青训教练给你发了张观摩证——去看他们二队一周的训练赛，不上场，只看。`,
   ctx:"「你先看看职业队怎么练，再决定要不要走这条路。」",
   a:[{t:"去看一周", g:"grind", e:()=>{ addFat(4); tacAdd(3,"二队训练赛观摩"); S.pre.scoutSeen=(S.pre.scoutSeen||0)+2;
        return "一周里你在训练室后排坐了六天。<b>原来职业队的复盘是这么开的。</b>战术素养 +3，教练组也记住了这张脸。"; }},
      {t:"不去，要打排位", g:"grind", e:()=>"你觉得分更重要。观摩证过期了。"}]},

  /* ================= 职业前的日常（2026-09-06 玩家实锤「培养冗长」）=================
     一年压到 14 周之后，空周更不能空。这十六件事只在职业前出现，效果都不致命：
     一两周的临时增益、一笔小钱、一点人气、教练组多记住你一次（scoutSeen）。 */
  {id:"cafecup", rec:0, w:2.2, max:1, when:()=>!!S.pre&&!S.career&&S.pre.rank>=30,
   q:()=>`常去的网吧周末办<b>店内联赛</b>，冠军 <b>2 万</b>加一年免费上网。老板点名要你来。`,
   ctx:"对手是隔壁几家网吧的常客。不算比赛，但有人看。",
   a:[{t:"去打", g:"show", e:()=>{ addFat(6); addFans(3); if(S.pre.mates&&S.pre.mates.length) addSquad("syn",1);
        const win=rnd()<0.45+S.pre.rank*0.004;
        if(win){ S.money+=2; return "决赛 2:0。<b>两万到手</b>，老板把你的 ID 贴在了前台。人气 +3。"; }
        return "决赛输给了一支打了三年的固定队。<b>但看台上有人开始叫你的 ID。</b>人气 +3。"; }},
      {t:"不去，周末打排位", g:"grind", e:()=>"老板有点失望。你多打了十把排位。"}]},

  {id:"hater", rec:0, w:2, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=40,
   q:()=>`直播间来了个黑粉，连着三天在弹幕刷「代打号」「买的分」。今天他开始点名骂你家里人。`,
   ctx:"回怼会有人看。不回也会有人看。",
   a:[{t:"当场回怼，开麦对线", g:"hard", e:()=>{ S.heat=(S.heat||0)+12; S.attrs.心态=Math.max(20,q1(S.attrs.心态-0.3)); (S.flags=S.flags||{}).beefy=1;
        return "切片当晚就传开了。<b>热度 +12，心态 −0.3。</b>你也出了名——出的是「脾气」的名。"; }},
      {t:"拉黑，继续打", g:"grind", e:()=>{ S.attrs.心态=Math.min(capOf("心态"),q1(S.attrs.心态+0.3));
        return "你把他拉黑，继续补刀。弹幕安静了一会儿。<b>心态 +0.3。</b>"; }}]},

  {id:"family", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)<150&&S.pre.week>=4,
   q:()=>`家里打来电话：亲戚介绍了一份工作，让你下周去面试。「打游戏能打到什么时候？」`,
   ctx:"你没法拿出一份合同来证明什么。",
   a:[{t:"「再给我一年」", g:"hard", e:()=>{ addBuff("mood",1.08,3,"憋着一口气"); S.attrs.心态=Math.max(20,q1(S.attrs.心态-0.2));
        return "电话那头沉默了很久，最后说「随你」。<b>接下来三周你练得比谁都狠。</b>心态 −0.2。"; }},
      {t:"先去面试，稳住家里", g:"grind", e:()=>{ S.money+=2; addFat(5); S.heat=Math.max(0,(S.heat||0)-3);
        return "面试通过了，你没去上班，但家里的火先压下去了。<b>那一周排位一把没打。</b>资金 +2。"; }}]},

  {id:"duopro", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&S.pre.rank>=65,
   q:()=>`排位里连着两把碰到同一个人，ID 是空的，操作不像路人。打完他发来好友申请：<b>「一起排两天？」</b>`,
   ctx:"后来你才知道，那是某支队的替补在练小号。",
   a:[{t:"双排一周", g:"grind", e:()=>{ addFat(5); S.attrs.操作=Math.min(capOf("操作"),q1(S.attrs.操作+0.4)); S.attrs.运营=Math.min(capOf("运营"),q1(S.attrs.运营+0.2)); S.pre.scoutSeen=(S.pre.scoutSeen||0)+1;
        return "一周里他教了你三套打线的节奏。<b>操作 +0.4，运营 +0.2</b>，他回队后在群里提过你的名字。"; }},
      {t:"打完就散", g:"grind", e:()=>{ S.attrs.操作=Math.min(capOf("操作"),q1(S.attrs.操作+0.1)); return "两把之后你们再没排过。那两把你学到一点东西。操作 +0.1。"; }}]},

  {id:"keyboard", rec:0, w:1.8, max:1, when:()=>!!S.pre&&!S.career&&S.money>=3,
   q:()=>`键盘的 Q 键开始连点，关键团战放两次技能。修不好，换一把要 <b>3 万</b>。`,
   ctx:"凑合能用。但每一把都在赌它今天不出问题。",
   a:[{t:"换新的", cost:3, e:()=>{ pay(3); addBuff("train",1.06,3,"新键盘");
        return "新键盘到了，手感对了。<b>训练收益 +6%，三周。</b>"; }},
      {t:"凑合用", g:"grind", e:()=>{ addBuff("train",0.94,2,"键盘连点"); return "又连点了两次。<b>训练收益 −6%，两周</b>——直到你自己也习惯了。"; }}]},

  {id:"viral", rec:0, w:2, when:()=>!!S.pre&&!S.career&&(S.heat||0)>=25,
   q:()=>`昨晚一波 1v3 的切片被搬上短视频平台，一夜 <b>八十万播放</b>。评论区在问「这人是谁」。`,
   ctx:"热度这种东西，三天就没。",
   a:[{t:"趁热连播三天", g:"show", e:()=>{ addFans(10); S.heat=(S.heat||0)+18; addFat(6);
        return "三天直播间人数都是平时的五倍。<b>人气 +10，热度 +18</b>，也累。"; }},
      {t:"照常练，不管它", g:"grind", e:()=>{ addFans(3); return "播放量第四天就停了。<b>留下来的人不多，但都是真看你打的。</b>人气 +3。"; }}]},

  {id:"fakeagent", rec:0, w:1.8, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=80,
   q:()=>`一个自称「某俱乐部经纪人」的人私信你：交 <b>8 万</b>「试训保证金」，下个月安排进青训。`,
   ctx:"他的头像是那家俱乐部的队标。他没有工牌。",
   a:[{t:"交钱，别错过机会", cost:8, g:"hard", e:()=>{ pay(8); S.attrs.心态=Math.max(20,q1(S.attrs.心态-0.4)); (S.flags=S.flags||{}).scammed=1;
        return "转账之后他再也没上线。<b>八万没了，心态 −0.4。</b>真正的俱乐部从来不收钱。"; }},
      {t:"查一下再说", g:"grind", e:()=>"你查了那家「公司」，注册地址是一家奶茶店。你把聊天记录发到了圈子群里，救了两个人。"}]},

  {id:"exam", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&S.age<=18,
   q:()=>`学校的期末考在下周。请假两周专心练，还是回去把试考了？`,
   ctx:"班主任说：「你要是真能打出来，我不拦你。」",
   a:[{t:"请假，专心练", g:"hard", e:()=>{ addBuff("train",1.10,2,"请了两周假"); (S.flags=S.flags||{}).skipExam=1;
        return "两周没人管你，练到凌晨三点。<b>训练收益 +10%，两周。</b>成绩单上那一栏空着。"; }},
      {t:"回去考试", g:"grind", e:()=>{ addFat(-10); S.attrs.心态=Math.min(capOf("心态"),q1(S.attrs.心态+0.4)); S.pre.rank=Math.max(0,S.pre.rank-1.5);
        return "考完试你歇了几天，手生了一点。<b>体能回了不少，心态 +0.4，段位 −1.5。</b>"; }}]},

  {id:"acadscrim", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&preScore()>=40,
   q:()=>`一支俱乐部的<b>二队缺人打训练赛</b>，教练在群里找陪练：「不算钱，管饭，打一周。」`,
   ctx:"陪练不上名单。但你会坐在他们的训练室里。",
   a:[{t:"去打一周", g:"grind", e:()=>{ addFat(6); tacAdd(2,"给二队当陪练"); S.attrs.运营=Math.min(capOf("运营"),q1(S.attrs.运营+0.2)); S.pre.scoutSeen=(S.pre.scoutSeen||0)+2;
        return "一周里你被他们打了三十把，也看懂了他们怎么复盘。<b>战术素养 +2，运营 +0.2</b>，教练记住了你。"; }},
      {t:"不去，自己冲分", g:"grind", e:()=>"你觉得替人当靶子不划算。他们找了别人。"}]},

  {id:"crewfight", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&!!(S.pre.mates&&S.pre.mates.length),
   q:()=>`车队里两个人吵起来了——一个嫌另一个不做视野，另一个说他从不听指挥。群里已经开始互相拉黑。`,
   ctx:"业余车队散伙，一般就是这么散的。",
   a:[{t:"把两个人拉进语音，劝到半夜", g:"grind", e:()=>{ addSquad("syn",1.5); S.attrs.心态=Math.max(20,q1(S.attrs.心态-0.1));
        return "凌晨两点他们终于把话说开了。<b>默契 +1.5</b>，你少睡了一晚。"; }},
      {t:"随他们去，散了再找", g:"hard", e:()=>{ addSquad("syn",-2); return "第二天少了一个人。剩下的人练得更沉默了。<b>默契 −2。</b>"; }}]},

  {id:"giftgear", rec:0, w:1.6, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=120,
   q:()=>`一个常来直播间的观众寄来一套<b>职业选手同款外设</b>，附了张纸条：「等你上岸。」`,
   ctx:"东西不便宜。你不知道该不该收。",
   a:[{t:"收下，好好用", g:"show", e:()=>{ addBuff("train",1.04,4,"观众送的外设"); addFans(2);
        return "你在直播里认真谢了他。<b>训练收益 +4%，四周。</b>"; }},
      {t:"退回去", g:"grind", e:()=>{ addFans(4); S.attrs.心态=Math.min(capOf("心态"),q1(S.attrs.心态+0.2));
        return "你把东西退了回去，在直播里说了原因。<b>弹幕刷了一屏「有原则」。</b>人气 +4，心态 +0.2。"; }}]},

  {id:"platform", rec:0, w:1.8, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=70&&!S.streamDeal,
   q:()=>`直播平台的运营找上门：一份<b>小合同</b>，一次性 <b>10 万</b>，条件是接下来每周至少开播两次。`,
   ctx:"不是独家，也没有分成——就是要你露脸。",
   a:[{t:"签", g:"show", e:()=>{ addMoney("stream",10); S.heat=(S.heat||0)+5; (S.flags=S.flags||{}).smallDeal=1;
        return "十万到账。<b>接下来每周你都得开播</b>——练的时间被挤掉一块。热度 +5。"; }},
      {t:"不签，先把分打上去", g:"grind", e:()=>"运营说「那你打出来再聊」。你觉得这话没错。"}]},

  {id:"ladderrival", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&S.pre.rank>=55,
   q:()=>`天梯上有个人连着三把在对面，把你打得很难受，赛后加你好友：<b>「solo 一把？」</b>`,
   ctx:"他直播间三千人在看。",
   a:[{t:"solo", g:"hard", e:()=>{ const win=rnd()<0.5+(S.attrs.操作-55)*0.012;
        if(win){ S.attrs.操作=Math.min(capOf("操作"),q1(S.attrs.操作+0.3)); S.heat=(S.heat||0)+8; return "你赢了。他的直播间刷了一屏问号。<b>操作 +0.3，热度 +8。</b>"; }
        S.attrs.心态=Math.max(20,q1(S.attrs.心态-0.2)); S.attrs.操作=Math.min(capOf("操作"),q1(S.attrs.操作+0.15));
        return "你输了，输得不难看。<b>心态 −0.2，操作 +0.15</b>——输给强的人也是练。"; }},
      {t:"不理他", g:"grind", e:()=>{ S.heat=(S.heat||0)+3; return "他在直播里说了你两周。<b>热度 +3</b>，你一句没回。"; }}]},

  {id:"wristache", rec:0, w:2, when:()=>!!S.pre&&!S.career&&S.fatigue>=60,
   q:()=>`右手手腕开始发麻，握鼠标半小时就得甩两下。你知道这是什么信号。`,
   ctx:"这个年纪的手，坏起来很快。",
   a:[{t:"停一周，去看医生", g:"grind", e:()=>{ addFat(-16); S.pre.rank=Math.max(0,S.pre.rank-1);
        return "医生说没大事，就是累。<b>体能回了一大截，段位掉了 1</b>——分是能打回来的。"; }},
      {t:"硬撑，分不能掉", g:"hard", e:()=>{ addFat(6); S.attrs.操作=Math.max(20,q1(S.attrs.操作-0.15)); (S.flags=S.flags||{}).wristRisk=1;
        return "你换了个鼠标垫继续打。<b>操作 −0.15</b>，手腕的事没解决，只是先不提。"; }}]},

  {id:"coachfollow", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&S.pre.week>=6&&preScore()>=38,
   q:()=>`那个加过你的青训教练又发来消息：<b>「发几场你最近的录像给我看看。」</b>`,
   ctx:"他没说会怎么样。但他问了。",
   a:[{t:"挑三场发过去", g:"grind", e:()=>{ S.pre.scoutSeen=(S.pre.scoutSeen||0)+2; S.attrs.运营=Math.min(capOf("运营"),q1(S.attrs.运营+0.2));
        return "两天后他回了三条语音，全是挑毛病。<b>运营 +0.2</b>，他说「继续练，我在看」。"; }},
      {t:"没回", g:"hard", e:()=>"你觉得还没到给人看的时候。他没再问。"}]},

  {id:"collab", rec:0, w:2, max:1, when:()=>!!S.pre&&!S.career&&(S.fans||0)>=50,
   q:()=>`一个粉丝比你多二十倍的主播发来邀请：<b>连麦双排一晚</b>。他的观众会看到你。`,
   ctx:"他打得一般，但会聊。",
   a:[{t:"连", g:"show", e:()=>{ addFans(14); S.heat=(S.heat||0)+14; addFat(5);
        return "那晚你的直播间涌进来几千人。<b>人气 +14，热度 +14。</b>他说下次还找你。"; }},
      {t:"想先把分打上去", g:"grind", e:()=>{ S.attrs.心态=Math.min(capOf("心态"),q1(S.attrs.心态+0.1)); return "你回了「下次」。他没生气。<b>心态 +0.1。</b>"; }}]},

  /* ---------- 回响：职业后兑现 ---------- */
  {id:"daida_echo", rec:0, w:2, max:1, when:()=>!!S.career&&!!(S.flags&&S.flags.daida)&&(S.heat||0)>=120,
   q:()=>`<b>旧账被扒了。</b>一个营销号放出了当年那个号的战绩截图和转账记录——「职业选手代打前科」上了热搜。`,
   ctx:"截图是真的。你知道它是真的。",
   a:[{t:"公关硬扛：不回应", g:"hard", e:()=>{ S.heat=Math.max(0,(S.heat||0)*0.6); addTrustAll(-3);
        return "热搜挂了三天。俱乐部没说话，队友也没说话——<b>但训练室安静了很多</b>。热度掉了四成。"; }},
      {t:"承认，公开道歉", g:"grind", e:()=>{ S.heat=Math.max(0,(S.heat||0)*0.78); addTrustAll(-1);
        S.attrs.心态=Math.min(capOf("心态"),q1(S.attrs.心态+0.5));
        return "你发了一段不长的声明。骂的人还是骂，但也有人说「敢认」。<b>热度掉两成，心态 +0.5——这事翻篇了。</b>"; }}]},

  {id:"clean_echo", rec:0, w:1.5, max:1, when:()=>!!S.career&&!!(S.flags&&S.flags.clean)&&(S.fans||0)>=400,
   q:()=>`有人在论坛造你的谣：说你当年打排位时收钱代打。帖子被转了几千次。`,
   ctx:"俱乐部找你核实。",
   a:[{t:"把当年拒绝代打的聊天记录甩出来", g:"show", e:()=>{ addFans(20); addTrustAll(2);
        return "记录一放，帖子当天就被删了。<b>「他连五万都没收过」成了你身上的一个标签。</b>粉丝 +20，队友信任 +2。"; }}]},

  {id:"gear_echo", rec:0, w:2, max:1, when:()=>!!S.career&&!!(S.flags&&S.flags.exclusiveGear)&&salaryOf()>0,
   q:()=>`一家一线外设品牌开出 <b>60 万</b>的年度代言——但你当年签的那份小品牌独家还在期内，解约要付 <b>20 万</b>违约金。`,
   ctx:"当年抽屉里那份合同，现在有人替你翻出来了。",
   a:[{t:"付违约金，签大牌", cost:20, e:()=>{ pay(20); S.money+=60; delete S.flags.exclusiveGear;
        bizNote("代言","一线外设品牌","签了",40,"年度代言 60 万，付小品牌违约金 20 万");
        return "二十万违约金付掉，六十万代言到账，净赚四十万。<b>当年那十五万，成了最贵的一笔预支。</b>"; }},
      {t:"守约，等它到期", g:"grind", e:()=>{ addFans(5);
        bizNote("代言","一线外设品牌","守约拒了",0,"小品牌独家未到期；圈里说你讲信用");
        return "你拒了大牌。小品牌老板亲自打电话来谢你，圈里也有人说你讲信用。<b>粉丝 +5，钱没有。</b>"; }}]},

  {id:"press_echo", rec:0, w:2, max:1, when:()=>!!S.career&&!!(S.flags&&S.flags.pressFriend),
   q:()=>`当年采访过你的那位记者发来消息：「上岸了？说好的。」她想做一期从网吧到职业的跟拍。`,
   ctx:"她的号比当年更有分量了。",
   a:[{t:"接受跟拍", g:"show", e:()=>{ addFans(18); delete S.flags.pressFriend;
        return "稿子发出来的那周，你的名字第一次被圈外人念对。<b>粉丝 +18。</b>她说：「下次拿冠军再写。」"; }},
      {t:"等打出成绩再说", g:"grind", e:()=>{ return "她说：「行，我等。」这次是真的等。"; }}]},

  /* 强队爆冷：由 simWorld 真的模拟出冷门之后才触发，队名取自当周真实结果 */
  {id:"upset", rec:0, auto:false, when:()=>!!(S._upset),
   q:()=>{ const u=S._upset||{};
     return `<b>${u.loser}</b> 输给了 <b>${u.winner}</b>，赛前没人看好${u.winner}。`; },
   ctx:"你把这场的回放看了两遍。这行没有理所当然的赢。",
   a:[{t:"憋着一股劲，加练", g:"grind",e:()=>{addBuff("train",1.5,2,"憋着劲");addFat(6);
        return "接下来两周你练得比谁都狠。"}},
      {t:"发条动态点评两句", g:"show",e:()=>{addFans(6);
        return "转发不少，也有人说你自己都还没打上首发。"}},
      {t:"关掉，睡了", g:"grind",e:()=>{addFat(-8);
        return "第二天状态还行。有些事跟你没关系。"}}]},

  {id:"scam", rec:2, w:2, when:()=>S.money>=60,
   q:()=>`有人私信你，说能内推进某青训营，先交 <b>50 万</b>「考察费」。`,
   ctx:"对方头像是个战队队标，但你查不到这个人。",
   a:[{t:"交钱试试", cost:50, e:()=>{ if(rnd()<0.72){ pay(50);
          return "对方收了钱就把你拉黑了。这五十万买了个教训。"; }
        pay(50); S.pre&&(S.pre.scoutHint=1); addFans(14);
        return "居然是真的，你被安排去看了一场训练赛，认识了两个人。"}},
      {t:"不理", g:"grind",e:()=>{return "你没回。第二天那个号就注销了。"}},
      {t:"挂到网上", g:"hard",e:()=>{addFans(9);
        return "帖子火了，不少人说自己也被骗过。"}}]},

  {id:"wrist", rec:0, w:2, when:()=>S.fatigue>=55,
   q:()=>`手腕开始疼。你已经连着几周高强度了。`,
   ctx:"忍一忍也能打，但你知道这东西会积累。",
   a:[{t:"去医院看看", g:"show", cost:25, e:()=>{pay(25);addFat(-30);addBuff("train",0.8,1,"休养中");
        return "医生说没大事，让你少练两天。"}},
      {t:"贴个膏药接着练", g:"grind",e:()=>{addFat(10);
        if(rnd()<0.3){ S.attrs.体质=Math.max(20,S.attrs.体质-1.5);
          return "疼了一整周。你的体质悄悄掉了一点。"; }
        return "扛过去了，这次运气不错。"}}]},

  {id:"streamGift", rec:1, auto:false, when:()=>S.fans>=40,
   q:()=>`直播间来了个大哥，一口气刷了一堆礼物。`,
   ctx:"他要求你连麦陪他打两把。",
   a:[{t:"陪打", g:"warm",e:()=>{addMoney("other",45);addFat(8);addFans(4);
        return "他玩得很开心，还说下次再来。"}},
      {t:"婉拒，正常直播", g:"grind",e:()=>{addMoney("other",12);addFans(6);
        return "弹幕觉得你挺有原则的。"}}]},

  {id:"oldFriend", rec:0, w:2, when:()=>true,
   q:()=>`初中同学约你出去吃饭，说好久没见了。`,
   ctx:"你已经三个月没出过门。",
   a:[{t:"去", g:"show", cost:8, e:()=>{addFat(-22);pay(8);addBuff("mood",1.2,2,"心情不错");
        return "聊了一晚上，回来的时候觉得轻松多了。"}},
      {t:"不去，练", g:"grind",e:()=>{addFat(4);addBuff("train",1.15,1,"心无旁骛");
        return "你把那顿饭的时间换成了两把排位。"}}]},

  {id:"proNews", rec:0, w:3, when:()=>!!S.world,
   q:()=>{ const lg="LPL";
     const ts=(S.world&&S.world[lg])||[];
     const t=ts[Math.floor(rnd()*ts.length)];
     S._ev={t:t?t.name:"某支队", team:t};
     return `<b>${S._ev.t}</b> 官宣裁掉了首发选手，位置空出来了。`; },
   ctx:"消息底下全是「谁能顶上」。",
   /* 这条新闻要在世界里真的发生：那支队的名单确实变了，战力跟着变。
      原来它只是弹一句话——说完什么也没发生，等于告诉玩家「这些字和你的世界无关」。 */
   a:[{t:"给自己剪个集锦发过去", g:"show",e:()=>{addFans(11);
        const ch=evRosterChange(S._ev&&S._ev.team);
        const tail=ch?`<br><span style="color:var(--ink-3)">${S._ev.t} 提上了新秀 <b>${ch.nr.id}</b>，${ch.out.id} 走了。</span>`:"";
        if(rnd()<0.35){ S.pre&&(S.pre.rank=clamp(S.pre.rank+2,0,100));
          return "有个教练回了你一条：「继续打，我们看着。」"+tail; }
        return "石沉大海。但集锦本身涨了点关注。"+tail}},
      {t:"该干嘛干嘛", g:"grind",e:()=>{
        const ch=evRosterChange(S._ev&&S._ev.team);
        return "机会不是这么来的。你回去打排位了。"+(ch?`<br><span style="color:var(--ink-3)">几天后 ${S._ev.t} 提上了新秀 <b>${ch.nr.id}</b>。</span>`:"")}}]},

  /* ================= 梗与文化 =================
     这一类的共同点：它们是「圈子对你的二次创作」，所以门槛都挂在粉丝数上——
     没人认识你，就没人拿你做梗。 */

  {id:"bible", rec:0, w:2, max:1, when:()=>S.fans>=800&&((S.career&&S.career.l)||0)>=6,
   q:()=>`你上个月赛后采访那句话，被人剪进了「LPL 圣经」合集。`,
   ctx:"播放量七位数，弹幕全是你的名字，但没一条是在夸你打得好。",
   a:[{t:"自己转发，配一句「下次赢回来」", g:"show",e:()=>{addFans(30);addBuff("mood",1.15,2,"心里踏实");
        return "评论区风向当场就变了。玩得起的人，大家反而服。"}},
      {t:"当没看见，闷头训练", g:"grind",e:()=>{addBuff("train",1.25,2,"憋着一口气");
        addQuest({id:"bible",n:"把话咽下去",
          d:"你说了不回应——那就得练出来给人看",kind:"train",need:6,due:3,
          fans:40,okTxt:"三周后你的数据被同一批人拿去做了另一个合集。",
          failTxt:"你既没回应，也没练。那条视频还在涨播放。",penFans:35});
        return "你把那条视频的链接删了，然后多打了两个小时训练赛。"}},
      {t:"发长文澄清那句话的语境", g:"show",e:()=>{addFans(12);addBuff("mood",0.88,2,"越描越黑");
        return "长文被截成了新的梗图。有些事越解释越热闹。"}}]},

  {id:"ghostcut", rec:0, w:2, when:()=>S.fans>=500,
   q:()=>`有人把你的一波操作做成了鬼畜，播放量比比赛正片还高。`,
   ctx:"作者在简介里 @ 了你，说「求本人不要生气」。",
   a:[{t:"三连，评论「做得比我打得好」", g:"show",e:()=>{addFans(26);
        return "作者激动坏了，又剪了三期。你的名字在鬼畜区挂了一整月。"}},
      {t:"私信作者要授权，做成自己的直播片头", g:"show",e:()=>{addFans(16);addMoney("other",-10);
        return "花了点小钱买断，片头一放弹幕就刷屏。这波你也算参与了创作。"}},
      {t:"不理", g:"grind",e:()=>{addFans(5);
        return "热度自己散了。你连点开都没点开。"}}]},

  {id:"nickname", rec:0, w:2, max:1, when:()=>S.fans>=350&&!!S.team,
   q:()=>{ const d=DIMS.reduce((a,b)=>S.attrs[a]>=S.attrs[b]?a:b);
     S._ev={d};
     return `解说在直播里给你起了个外号，取的是你${d}那一手。`; },
   ctx:"一晚上之后，弹幕已经没人叫你 ID 了。",
   a:[{t:"认下来，直播间标题都改成外号", g:"warm",e:()=>{addFans(22);
        return "外号比 ID 传得远。这行认脸也认梗。"}},
      {t:"公开说不喜欢这个叫法", g:"hard",e:()=>{addFans(9);addBuff("mood",0.9,1,"有点烦");
        return "你越说不喜欢，叫的人越多。"}}]},

  {id:"matchfix", rec:0, w:2, max:1, when:()=>!!S.team&&S.fans>=600&&((S.career&&S.career.l)||0)>=8,
   q:()=>`论坛有个帖子在扒你上一场的走位，说那波送得「太刻意」。`,
   ctx:"帖子底下已经有人在艾特反假赛的举报邮箱了。",
   a:[{t:"逐帧录一期复盘，把那波讲透", g:"hard",e:()=>{addFat(12);addFans(34);
        addStaff("mgr",5);
        return "你把决策链讲了二十分钟。原帖删了，俱乐部转发了你的视频。"}},
      {t:"交给俱乐部公关处理", cost:60, e:()=>{ if(!pay(60)) return "你手上没这个钱。";
        addFans(6);
        return "律师函发出去了，帖子没了。但「心虚」两个字也留在了评论区。"}},
      {t:"不回应，用下一场说话", g:"grind",e:()=>{addBuff("train",1.3,2,"用成绩说话");
        addQuest({id:"matchfix",n:"用下一场说话",
          d:"传闻还挂在论坛上，只有赢比赛能压下去",kind:"win",need:2,due:3,
          fans:60,mgr:6,trust:6,okTxt:"两场打完，帖子沉了——没人再提那波走位。",
          failTxt:"传闻越传越像真的。",penFans:70});   // mgr 只写一次：任务系统里同一个字段管奖惩（成功 +6、失败 -6）；原来重复写了 mgr:-8，把成功奖励也盖成了 -8
        return "你什么都没说。下一场的准备做得格外细。"}}]},

  /* ================= 人生 =================
     这一类不吃战绩，吃的是你有多少钱、多大年纪、离家多远。 */

  {id:"firstcar", rec:2, w:2, max:1, when:()=>S.money>=400&&S.age>=19,
   q:()=>`驾照到手快一年了，你第一次认真翻起了买车的页面。`,
   ctx:"队里年纪比你大的都开了车。你算了算账，买得起。",
   a:[{t:"买一辆", cost:320, e:()=>{ if(!pay(320)) return "钱不够。再等等。";
        addBuff("mood",1.25,3,"人生第一辆车");addFans(14);
        return "提车那天你绕着基地开了两圈。有些东西不是必需品，是证明。"}},
      {t:"再等等，先给家里换个房", g:"grind",e:()=>{addBuff("mood",1.1,2,"心里踏实");
        return "你把页面关了。这笔钱有更该去的地方。"}},
      {t:"不买，钱留着", g:"grind",e:()=>{return "你连页面都没收藏。现在还不是时候。"}}]},

  {id:"parentsill", rec:2, w:2, max:1, when:()=>S.age>=20,
   q:()=>`家里打电话来，说父亲住院了，让你别担心，不用回。`,
   ctx:"「不用回」这三个字，你听了二十年了。",
   a:[{t:"请假回家一趟", g:"warm", cost:40, e:()=>{pay(40);addFat(-10);
        addBuff("train",0.85,2,"人不在状态");addBuff("mood",1.3,3,"回过家了");
        return "床边坐了三天。回来的时候训练落下了，但心里那块石头落了地。"}},
      {t:"打钱，不回", cost:150, e:()=>{ if(!pay(150)) return "你连这笔钱都拿不出来，只能干着急。";
        addBuff("mood",0.85,3,"心里挂着事");
        return "钱转过去了。之后每次训练走神，你都知道是为什么。"}},
      {t:"每天视频半小时", g:"warm",e:()=>{addFat(5);addBuff("mood",1.1,2,"隔着屏幕也算陪");
        return "他嫌你浪费时间，但每次都提前十分钟等着。"}}]},

  {id:"hometown", rec:0, w:1, max:1, when:()=>S.fans>=1200,
   q:()=>`老家县城在主干道上挂了条横幅，上面是你的名字。`,
   ctx:"照片是你妈发来的，配文只有三个感叹号。",
   a:[{t:"发微博谢谢家乡", g:"show",e:()=>{addFans(24);addBuff("mood",1.2,2,"被看见了");
        return "本地号全转了。你妈把那条微博截图设成了头像。"}},
      {t:"私下给母校捐一笔", g:"show", cost:200, e:()=>{ if(!pay(200)) return "你想捐，但账上不够。";
        addFans(18);addBuff("mood",1.25,3,"做了件实事");
        return "学校新添了一间电竞教室。校长说，以前老师拿你当反面教材。"}}]},

  {id:"landlord", rec:0, w:1, when:()=>!S.team&&S.fans>=200,
   q:()=>`房东上门收租，看了你半天，问：「你是不是在网上那个打游戏的？」`,
   ctx:"他儿子在旁边猛点头。",
   a:[{t:"承认，给他儿子签个名", g:"warm",e:()=>{addFans(8);addMoney("other",-0);
        return "这个月房租他给你抹了个零头。他儿子在班级群里吹了一星期。"}},
      {t:"否认", g:"grind",e:()=>{return "他将信将疑地走了。你关上门，松了口气。"}}]},

  /* ================= 行业 =================
     这一类的触发条件挂在「你已经是个有商业价值的人」上。 */

  {id:"adshoot", rec:2, w:2, when:()=>S.fans>=900&&!!S.team,
   q:()=>`一个外设品牌找过来，要拍一支 30 秒的广告。`,
   ctx:"报价不低，但拍摄要占掉你一整天。",
   /* 广告不是拍完就完了：合同里写着要在直播里露出。
      于是它给你留下一件有期限的事，这一周的行动点怎么花被它改变了。 */
   a:[{t:"接，认真拍", g:"show",e:()=>{addFat(20);addMoney("other",180);addFans(28);
        addQuest({id:"adshoot",n:"品牌露出",
          d:"合同要求你在直播里用他们的外设",kind:"stream",need:2,due:3,
          money:120,fans:14,okTxt:"品牌方很满意，尾款结清。",
          failTxt:"品牌方按合同扣了尾款。",penalty:90,mgr:-3});
        return "拍了一整天，导演让你重念了四十遍那句台词。钱到账很快。"}},
      {t:"接，但压缩到半天", g:"show",e:()=>{addFat(10);addMoney("other",95);addFans(12);
        addQuest({id:"adshoot",n:"品牌露出",
          d:"成片糙了点，品牌方盯得更紧",kind:"stream",need:2,due:2,
          money:60,fans:8,okTxt:"总算糊弄过去了。",
          failTxt:"品牌方本来就不满意，这下直接扣钱。",penalty:70,mgr:-4});
        return "成片有点糙，品牌方脸色一般。钱少拿了一半，时间省下来了。"}},
      {t:"推掉，专心备战", g:"grind",e:()=>{addBuff("train",1.2,2,"心无旁骛");
        return "经纪那边有点可惜。但这周的训练赛你一场没落。"}}]},

  {id:"variety", rec:1, w:1, max:1, when:()=>S.fans>=2000,
   q:()=>`一档综艺来邀请，说想请你去当嘉宾，聊聊「电竞选手的一天」。`,
   ctx:"录制在赛季中间，要飞一趟，来回三天。",
   a:[{t:"去", g:"show",e:()=>{addFat(28);addFans(70);addMoney("other",120);
        addStaff("mgr",-5);
        return "节目播出后你破了圈，路人都认识你了。教练组对这三天没什么好脸色。"}},
      {t:"不去，赛季中不折腾", g:"grind",e:()=>{ addStaff("mgr",6);
        return "俱乐部很满意。机会以后还有，赛季只有这一次。"}}]},

  {id:"beef", rec:2, w:2, when:()=>S.fans>=700,
   q:()=>`另一个主播在直播里点了你的名，说你「就是运气好」。`,
   ctx:"切片已经传遍了，两边粉丝在评论区打起来了。",
   a:[{t:"约他打一场表演赛", g:"hard",e:()=>{addFans(45);addFat(10);
        // 这一架要在世界里留下人：对面成了你的宿敌，之后对上会接着这条线走
        const t=evPickTeam();
        if(t&&true) evMakeRival(t.name,"直播里那场约战");
        return "约战当天两个直播间加起来百万人在看。谁赢的已经没人记得了，热度是真的。"
          +(t?`<br><span style="color:var(--ink-3)">他后来签去了 <b>${t.name}</b>——这笔账还没完。</span>`:"")}},
      {t:"直播里回敬一句", g:"hard",e:()=>{addFans(26);addBuff("mood",0.85,2,"心态受影响");
        return "骂战升级了。热度有了，心态也有点乱。"}},
      {t:"完全不接", g:"grind",e:()=>{addFans(4);addBuff("train",1.15,2,"没别的事");
        return "你连提都没提。三天后这事就没人说了。"}}]},

  {id:"platjump", rec:1, w:2, max:1, when:()=>!!S.streamDeal&&S.fans>=1200,
   q:()=>{ const p=(S.streamDeal&&S.streamDeal.plat)||"平台";
     S._ev={p};
     return `另一家平台私下找你，开的价比 <b>${p}</b> 给你的高一截。`; },
   ctx:"合同还没到期。跳槽这事在这行不新鲜，但从来没有干净的。",
   a:[{t:"违约跳槽", g:"hard", cost:200, e:()=>{ if(!pay(200)) return "违约金你付不起，这事只能作罢。";
        if(S.streamDeal){ S.streamDeal.base=Math.round(S.streamDeal.base*1.35); }
        addFans(20);
        addStaff("mgr",-10);
        return "违约金赔了，新合同的保底高了三成五。圈里传了一阵闲话，俱乐部也不太高兴。"}},
      {t:"拿这份报价去找原平台谈", g:"show",e:()=>{ if(rnd()<0.55){
          if(S.streamDeal) S.streamDeal.base=Math.round(S.streamDeal.base*1.18);
          return "原平台加了价——保底涨了一成八。谈判就是这么回事。"; }
        addBuff("mood",0.9,2,"谈崩了");
        return "对方一句「合同白纸黑字」把你顶了回来。你什么也没拿到。"}},
      {t:"不动", g:"grind",e:()=>{ addStaff("mgr",4);
        return "你把消息删了。守约的人，路会长一点。"}}]},

  /* ================= 触发式：由真发生的事引出 ================= */

  {id:"slump", rec:0, auto:false, when:()=>!!S.team,
   q:()=>`连败之后，更衣室安静得不像话。有人开始翻你的数据。`,
   ctx:"这种时候说什么都像找借口，但什么都不说更糟。",
   a:[{t:"开个会，把问题摊开讲", g:"warm",e:()=>{ addTrustAll(10);
        addFat(8);addBuff("mood",1.15,2,"话说开了");
        return "吵了两个小时，但走出会议室的时候，气氛终于松了。"}},
      {t:"自己加练，用状态说话", g:"grind",e:()=>{addFat(14);addBuff("train",1.35,2,"闷头练");
        return "你一个人在训练室待到凌晨。没人知道，但下周所有人都看见了。"}},
      {t:"跟教练要一次轮换",e:()=>{ addStaff("coach",-6);
        addFat(-18);
        // 真的坐板凳：benchedSplits 是别处在用的量（影响 proPerf、影响下放提议），
        // 所以这一下是有后果的，不是一句台词
        S.benchedSplits=(S.benchedSplits||0)+1;
        return "教练同意让你歇一场。他答应得太快了，这让你更慌。"}}]},

  {id:"afterchamp", rec:1, auto:false, when:()=>!!S.team,
   q:()=>`夺冠之后，庆功宴、采访、商务饭局一个接一个。`,
   ctx:"这是你打了那么多年想要的东西，但你已经三天没摸到鼠标了。",
   a:[{t:"全程参加，该享受就享受", g:"show",e:()=>{addFat(24);addFans(40);addMoney("other",60);
        return "你喝到了凌晨，也第一次感觉这行有回报。代价是身体透支了几天。"}},
      {t:"露个面就回去训练", g:"show",e:()=>{addFans(10);addBuff("train",1.25,2,"没飘");
        addStaff("coach",8);
        return "教练在群里发了张你独自训练的照片，配文只有两个字：不错。"}},
      {t:"全推了，直接休假",e:()=>{addFat(-35);
        addStaff("mgr",-7);
        return "你睡了三天。商务那边的电话打了十几个，一个没接。"}}]},

  {id:"laptop", rec:0, w:1, when:()=>true,
   q:()=>`电脑半夜蓝屏了，硬盘可能坏了。`,
   ctx:"修一下要钱，换一台更要钱。",
   a:[{t:"花钱修", cost:35, e:()=>{pay(35);
        return "修好了，就是风扇声更大了。"}},
      {t:"凑合用",e:()=>{addBuff("train",0.85,2,"设备拖后腿");
        return "接下来两周时不时卡一下，手感很受影响。"}}]},

  /* 2026-09-05 玩家点名：原来写「问你想不想来试训」，去了却只是打一下午训练赛、签不了合同——
     名不副实。现在说清是训练赛（不是试训），但打得好真的会换来一封正式试训邀请。 */
  {id:"coachDM", rec:1, w:2, when:()=>(S.pre?S.pre.rank>=30:false)&&!S.career,
   q:()=>`一个认证是「青训教练」的号加了你，问你想不想来队里<b>打一下午训练赛</b>，看看水平。`,
   ctx:"这不是试训——但正式的试训邀请，往往就是从这种下午开始的。",
   a:[{t:"去", g:"show",e:()=>{addFat(14);addFans(10);
        if(S.pre){ S.pre.tryoutSeen=1; S.pre.scoutSeen=(S.pre.scoutSeen||0)+2; }
        const good=(myStrength())>=50&&rnd()<0.55;
        if(good&&true){ queueInvite("acad","训练赛里被青训教练看中");
          return "打了一下午训练赛，教练在场边记了不少东西。<b>几天后，正式的试训邀请来了。</b>"; }
        return "打了一下午训练赛。教练说保持联系——<b>暂时没有下文</b>，但你的名字进了他们的本子（被看见的次数 +2）。"}},
      {t:"先问清楚条件",e:()=>{addFans(5);
        return "对方说了些含糊的话。你没去成，但也没损失。"}}]},

  {id:"teamDinner", rec:1, w:2, when:()=>!!S.team&&(teamTenure())>=4,
   q:()=>`队里聚餐，经理说想让大家放松放松。`,
   ctx:"你本来打算今晚加练的。",
   a:[{t:"去，喝两杯", g:"show",e:()=>{addTrustAll(7);addFat(-14);
        addSquad("syn",2.2);
        return "聊开了不少事。回去的路上气氛很好。"}},
      {t:"留下加练", g:"grind",e:()=>{addBuff("train",1.3,1,"独自加练");
        addTrustAll(-4);
        return "你一个人练到很晚。有人觉得你不合群。"}}]},

  {id:"hater", rec:1, auto:false, when:()=>S.fans>=70,
   q:()=>`有个营销号剪了你的失误集锦，标题很难听。`,
   ctx:()=>`剪的正是你上一场没成的那几个操作。底下已经几千条了。`,
   a:[{t:"回怼", g:"hard",e:()=>{addFans(14);addBuff("mood",0.85,2,"心态受影响");
        return "热度上去了，但你自己也难受了两周。"}},
      {t:"不看，专心打", g:"grind",e:()=>{addBuff("train",1.2,2,"用成绩说话");
        return "你把手机扔一边，练得更狠了。"}},
      {t:"找公关处理", cost:40, e:()=>{pay(40);addFans(4);
        return "视频很快下架了。钱花得不冤。"}}]},

  {id:"bonus", rec:0, w:1, when:()=>!!S.team,
   q:()=>`俱乐部发了笔额外奖金——上个赛段的赞助分成。`,
   ctx:"数额不大，但没想到还有这个。",
   a:[{t:"收下",e:()=>{const n=30+Math.floor(rnd()*50);addMoney("other",n);
        bizNote("赞助分成",S.team||"俱乐部","收下",n,"上赛段赞助分成");
        return `到账 ${n} 万。`}}]},

  {id:"junior", rec:0, w:2, when:()=>(S.pre?S.pre.rank>=25:false),
   q:()=>`同分段一个小号加你好友，说很崇拜你，想跟你双排。`,
   ctx:"他打得不太行，但很热情。",
   a:[{t:"带他两把", g:"warm",e:()=>{addFans(7);addFat(5);
        if(rnd()<0.4) return "他把你们的对局发了出去，你涨了点粉。";
        return "输了两把，但他很开心。"}},
      {t:"婉拒", g:"grind",e:()=>{return "你说最近在冲分。他表示理解。"}}]},

  /* ---------- 以下为定向触发：都由刚刚真的发生的事引出来 ---------- */

  {id:"skid", rec:0, auto:false, when:()=>!!S.team,
   q:()=>`连败之后，经理把你单独叫去办公室。`,
   ctx:()=>`他没发火，只是问你一句：「你觉得问题在哪？」`,
   a:[{t:"是我的问题，我会调整", g:"warm",e:()=>{addStaff("mgr",4);
        addBuff("train",1.25,2,"憋着一口气");
        return "他点点头，说这话他信。你接下来两周练得很沉。"}},
      {t:"是体系问题，该换打法",e:()=>{addSquad("tac",3.2);
        addStaff("coach",-3);
        return "教练组重新写了 BP 思路。战术顺了，但教练记住了这句话。"}},
      {t:"队友跟不上",e:()=>{addTrustAll(-8);
        addStaff("mgr",2);
        return "经理没接话。第二天更衣室里没人跟你说话。"}}]},

  {id:"bigWin", rec:0, auto:false, when:()=>!!S.team,
   q:()=>`赢下强队之后，官方采访点名要你。`,
   ctx:"镜头已经架好了，导播在倒计时。",
   a:[{t:"把功劳给队友", g:"warm",e:()=>{addTrustAll(9);addFans(8);
        return "队友在后台听到了。这句话比赢比赛本身更管用。"}},
      {t:"放狠话，点名下一个对手", g:"hard",e:()=>{addFans(26);
        0;
        return "热搜挂了一天。下一场对面打得格外凶。"}},
      {t:"照稿念，客套两句",e:()=>{addFans(3);
        return "安全，也没人记住。"}}]},

  {id:"patch", rec:0, auto:false, when:()=>!!S.team,
   q:()=>`新版本上线，你最拿手的那几个英雄被砍了一刀。`,
   ctx:"训练室里所有人都在重新试阵容。",
   a:[{t:"硬练新英雄池", cost:0, e:()=>{addFat(14);
        S.attrs.操作=Math.min(capOf("操作"),S.attrs.操作+0.6);
        addBuff("train",1.2,2,"重新学起");
        return "两周没打好，但手里多了三个能用的。"}},
      {t:"找教练要针对性 BP", g:"warm",e:()=>{addSquad("tac",3.6);
        addStaff("coach",2);
        return "教练给你留了保护位。这个版本你不至于难受。"}},
      {t:"不管版本，硬打", g:"hard",e:()=>{addBuff("mood",0.9,2,"逆版本");
        return "你还在打上个版本的游戏。有几场很别扭。"}}]},

  {id:"exMate", rec:0, auto:false, when:()=>!!S.team&&(teamTenure())>=12,
   q:()=>`一起打了很久的队友被卖了，走之前来找你吃了顿饭。`,
   ctx:"他说下赛季可能就是对面了。",
   a:[{t:"敬他一杯，好聚好散", g:"warm",e:()=>{addFat(-10);addBuff("mood",1.15,2,"心里踏实");
        return "他说你是队里唯一送他的人。"}},
      {t:"问清楚俱乐部是怎么想的",e:()=>{addStaff("mgr",-3);
        S.scoutHeat=(S.scoutHeat||0)+1;
        return "他透了点底：管理层也在评估你的位置。你多了个心眼。"}}]},

  {id:"airport", rec:0, w:1, when:()=>S.fans>=140,
   q:()=>`机场有人认出你，要求合影。`,
   ctx:"你正赶着登机，队友已经过安检了。",
   a:[{t:"停下来合影", g:"show",e:()=>{addFans(9);addFat(3);
        return "对方发了微博，转发不少。"}},
      {t:"边走边说抱歉",e:()=>{addFans(-4);
        return "有人拍了背影，配文说你耍大牌。"}}]},

  {id:"family", rec:0, w:2, when:()=>true,
   q:()=>`家里打电话，问你过年回不回去。`,
   ctx:"赛程排在那儿，你自己也说不准。",
   a:[{t:"答应回去待两天", g:"warm",e:()=>{addFat(-18);addBuff("mood",1.2,2,"回了趟家");
        return "在家睡了两天，什么都没想。"}},
      {t:"说今年怕是回不去", g:"show",e:()=>{addBuff("train",1.15,2,"没别的事");
        return "电话那头停了一下，说打好就行。"}}]},

  {id:"sponsor", rec:1, w:1, when:()=>!!S.team&&S.fans>=90,
   q:()=>`赞助商寄来一箱新外设，希望你直播时用一下。`,
   ctx:"东西不错，但手感和你现在用的不一样。",
   a:[{t:"接了，直播时用", g:"show",e:()=>{const n=40+Math.floor(rnd()*40);addMoney("other",n);
        addBuff("train",0.92,1,"手感在适应");
        bizNote("赞助外设","赞助商","接了",n,"直播时使用，手感适应一周");
        return `到账 ${n} 万。手感别扭了几天。`}},
      {t:"婉拒，手感要紧", g:"grind",e:()=>{addStaff("mgr",-2);
        bizNote("赞助外设","赞助商","婉拒了",0,"经理 −2");
        return "商务那边不太高兴，但你的手感没受影响。"}}]}
];

/* ---------- 触发与结算 ---------- */
export const EV_CAP=2;                                  // 同一个事件一局最多出几次
export function evBusy(){ return !!(S.rndEv||S.locker||S.signup||S.rankUp||S.cupMatch||S.tryout||S.deal); }
export function evLeft(e){ return ((S.rndSeen||{})[e.id]||0) < (e.max||EV_CAP); }
export function evOpen(e){ try{ return !e.when||e.when(); }catch(x){ return false; } }
export function setEv(ev){
  S.rndSeen=Object.assign({},S.rndSeen||{},{[ev.id]:((S.rndSeen||{})[ev.id]||0)+1});
  S.rndEv={id:ev.id,q:ev.q(),ctx:(typeof ev.ctx==="function"?ev.ctx():ev.ctx),a:ev.a};
}
/* 环境事件：每周摇一次，只从 auto 池里挑 */
export function tryRandomEvent(){
  if(evBusy()) return false;
  const pool=RANDOM_EVENTS.filter(e=>e.auto!==false&&evLeft(e)&&evOpen(e));
  if(!pool.length) return false;
  const tot=pool.reduce((a,e)=>a+e.w,0);
  let r=rnd()*tot;
  setEv(pool.find(e=>(r-=e.w)<=0)||pool[0]);
  return true;
}
/* 定向触发：由刚刚真的发生的事引出对应事件。
   p 是触发概率——不是每次直播都会来大哥，但来了一定是因为你在直播。 */
export function fireEvent(id,p){
  if(evBusy()) return false;
  if(p!==undefined&&rnd()>=p) return false;
  const e=RANDOM_EVENTS.find(x=>x.id===id);
  if(!e||!evLeft(e)||!evOpen(e)) return false;
  setEv(e);
  return true;
}
/* 选之前先拍个快照，选完对比出「到底变了什么」——
   光给一句文字，玩家不知道自己是赚了还是亏了。 */
export function snapshot(){
  const o: any={money:S.money,fans:S.fans,heat:S.heat||0,fat:S.fatigue};
  DIMS.forEach(d=>o["a_"+d]=S.attrs[d]);
  if(S.pre) o.rank=S.pre.rank;
  if(S.trust) o.trust=avgTrust();
  if(S.squad){ o.syn=S.squad.syn; o.tac=S.squad.tac; }
  if(S.staff){ o.coach=S.staff.coach; o.mgr=S.staff.mgr; }   // 更衣室事件常动这两个
  o.buffs=(S.tbuff||[]).map(b=>b.k).join(",");
  return o;
}
export function diffOf(a,b){
  const out=[];
  const num=(n,x,y,unit?,inv?)=>{
    const d=(y||0)-(x||0);
    if(Math.abs(d)<0.5) return;
    out.push({n,v:(d>0?"+":"")+d.toFixed(0)+(unit||""),good:inv?d<0:d>0});
  };
  num("资金",a.money,b.money," 万");
  num("粉丝",a.fans,b.fans);
  num("热度",a.heat,b.heat);
  num("体力",-a.fat,-b.fat);                 // 存的是疲劳，显示成体力要取反
  if(a.rank!==undefined) num("段位分",a.rank,b.rank);
  if(a.trust!==undefined) num("士气",a.trust,b.trust);
  if(a.coach!==undefined) num("教练信任",a.coach,b.coach);
  if(a.mgr!==undefined) num("经理信任",a.mgr,b.mgr);
  if(a.syn!==undefined){ num("默契",a.syn,b.syn); num("战术",a.tac,b.tac); }
  DIMS.forEach(d=>num(d,a["a_"+d],b["a_"+d]));
  // 新拿到的临时增益
  const before=a.buffs.split(",").filter(Boolean);
  (S.tbuff||[]).forEach(x=>{
    if(!before.includes(x.k)) out.push({n:x.n,v:x.left+" 周",good:x.v>=1});
  });
  return out;
}
export function resolveRandom(i){
  const ev=S.rndEv; if(!ev) return;
  const before=snapshot();
  addTraitPt(ev.a[i].g);   // 这一次选择也算进你是什么样的人
  const txt=ev.a[i].e();
  const after=snapshot();
  S.rndEv=null; S._ev=null;
  if(S.pre&&S.step==="pre") preLog(txt,"info");
  else pushEvent(txt,"info","际遇");
  // 把结果摊开给玩家看
  S.rndResult={choice:ev.a[i].t,txt,diff:diffOf(before,after)};
  render();
}
export function randomResultCard(){
  const r=S.rndResult; if(!r) return "";
  const d=r.diff;
  return `<div class="rankup"><div class="ru-inner" style="max-width:460px">
    <div class="ru-eyebrow">你选择了</div>
    <div class="ru-tier" style="font-size:19px">${r.choice}</div>
    <div class="ru-txt" style="margin-top:10px">${r.txt}</div>
    ${d.length?`<div class="evres">${d.map(x=>
      `<span class="er ${x.good?'up':'dn'}">${x.n} <b>${x.v}</b></span>`).join("")}</div>`
      :`<div class="evres"><span class="er none">这次什么也没发生</span></div>`}
    <div class="row" style="justify-content:center">
      <button class="btn" id="rndok">知道了</button></div>
  </div></div>`;
}
/* 遮罩，不是内联卡片。
   原来它排在整张行动卡后面，而行动卡本身就有一屏多高——
   玩家点完行动直接按「下一周」，根本没往下滑，于是从头到尾没看见过际遇。
   （结果卡 randomResultCard 反倒一直是遮罩，正好反了：
     要你做决定的那一下藏着，告诉你结果的那一下弹出来。） */
export function randomCard(){
  const e=S.rndEv; if(!e) return "";
  return `<div class="rankup"><div class="ru-inner ev-inner">
    <div class="ru-eyebrow">际遇</div>
    <div class="ev-q">${e.q}</div>
    <div class="ev-ctx">${e.ctx}</div>
    <div class="grid g2" style="margin-top:14px">${e.a.map((x,i)=>{
      const poor = x.cost && S.money < x.cost;
      return `<button class="opt" data-rnd="${i}" ${poor?'disabled style="opacity:.4"':''}>
        <div class="t">${x.t}${x.cost?` <span class="tag">${x.cost} 万</span>`:""}</div>
        ${poor?`<div class="d" style="color:var(--red)">钱不够（你有 ${Math.round(S.money)} 万）</div>`:""}
      </button>`;}).join("")}</div>
    ${`<div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="recobtn" data-reco="daily" title="按推荐选一项——不用开托管，这一次省点事">按推荐</button>
    </div>`}
  </div></div>`;
}
