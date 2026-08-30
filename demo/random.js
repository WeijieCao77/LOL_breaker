/* ================= 随机事件 =================
   有好有坏，由你的选择决定走向。
   刻意做得「不致命」——最多是两周的临时增益或者一笔小钱，
   不会一次事件定生死。它们负责的是质感，不是数值。 */

/* 花钱的统一出口。
   际遇里原来是直接 pay(50) 这样扣，不看余额——实测 7% 的局
   会把资金扣成负数，最低到过 −35 万。而「负债」在这个游戏里
   没有任何机制承接：不影响什么，也解释不通，纯粹是个漏洞。
   现在买不起的选项在界面上就是禁用的，这里再兜一道底。 */
function pay(n){
  if(S.money < n) return false;
  if(typeof addMoney==="function") addMoney("other",-n); else S.money-=n;
  return true;
}

/* ---------- 临时增益 ---------- */
/* {k:效果, v:倍率/数值, left:剩余周数, n:显示名} */
function addBuff(k,v,weeks,n){
  S.tbuff=S.tbuff||[];
  S.tbuff=S.tbuff.filter(b=>b.k!==k);       // 同类覆盖
  S.tbuff.push({k,v,left:weeks,n});
}
function buffVal(k,dflt){
  const b=(S.tbuff||[]).find(x=>x.k===k);
  return b?b.v:(dflt===undefined?1:dflt);
}
function tickBuffs(){
  if(!S.tbuff) return;
  S.tbuff.forEach(b=>b.left--);
  S.tbuff=S.tbuff.filter(b=>b.left>0);
}
/* 增益必须把效果写在脸上。
   「设备拖后腿 2周」——拖的是什么后腿？「心无旁骛」又加什么？
   玩家看不懂就等于没有这条增益，只剩一个吓人的红框。
   所以每个 chip 都自己算出百分比，用当前公式现算，不写死。 */
function buffPct(v){ const n=Math.round((v-1)*100); return `${n>=0?"+":"−"}${Math.abs(n)}%`; }
function buffEffect(b){
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
function buffChips(){
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
const RANDOM_EVENTS=[
  /* 强队爆冷：由 simWorld 真的模拟出冷门之后才触发，队名取自当周真实结果 */
  {id:"upset", auto:false, when:()=>!!(S._upset),
   q:()=>{ const u=S._upset||{};
     return `<b>${u.loser}</b> 输给了 <b>${u.winner}</b>，赛前没人看好${u.winner}。`; },
   ctx:"你把这场的回放看了两遍。这行没有理所当然的赢。",
   a:[{t:"憋着一股劲，加练",e:()=>{addBuff("train",1.5,2,"憋着劲");addFat(6);
        return "接下来两周你练得比谁都狠。"}},
      {t:"发条动态点评两句",e:()=>{addFame(6);
        return "转发不少，也有人说你自己都还没打上首发。"}},
      {t:"关掉，睡了",e:()=>{addFat(-8);
        return "第二天状态还行。有些事跟你没关系。"}}]},

  {id:"scam", w:2, when:()=>S.money>=60,
   q:()=>`有人私信你，说能内推进某青训营，先交 <b>50 万</b>「考察费」。`,
   ctx:"对方头像是个战队队标，但你查不到这个人。",
   a:[{t:"交钱试试", cost:50, e:()=>{ if(rnd()<0.72){ pay(50);
          return "对方收了钱就把你拉黑了。这五十万买了个教训。"; }
        pay(50); S.pre&&(S.pre.scoutHint=1); addFame(14);
        return "居然是真的，你被安排去看了一场训练赛，认识了两个人。"}},
      {t:"不理",e:()=>{return "你没回。第二天那个号就注销了。"}},
      {t:"挂到网上",e:()=>{S.fame+=9;
        return "帖子火了，不少人说自己也被骗过。"}}]},

  {id:"wrist", w:2, when:()=>S.fatigue>=55,
   q:()=>`手腕开始疼。你已经连着几周高强度了。`,
   ctx:"忍一忍也能打，但你知道这东西会积累。",
   a:[{t:"去医院看看", cost:25, e:()=>{pay(25);addFat(-30);addBuff("train",0.8,1,"休养中");
        return "医生说没大事，让你少练两天。"}},
      {t:"贴个膏药接着练",e:()=>{addFat(10);
        if(rnd()<0.3){ S.attrs.体质=Math.max(20,S.attrs.体质-1.5);
          return "疼了一整周。你的体质悄悄掉了一点。"; }
        return "扛过去了，这次运气不错。"}}]},

  {id:"streamGift", auto:false, when:()=>S.fame>=40,
   q:()=>`直播间来了个大哥，一口气刷了一堆礼物。`,
   ctx:"他要求你连麦陪他打两把。",
   a:[{t:"陪打",e:()=>{addMoney("other",45);addFat(8);addFame(4);
        return "他玩得很开心，还说下次再来。"}},
      {t:"婉拒，正常直播",e:()=>{addMoney("other",12);addFame(6);
        return "弹幕觉得你挺有原则的。"}}]},

  {id:"oldFriend", w:2, when:()=>true,
   q:()=>`初中同学约你出去吃饭，说好久没见了。`,
   ctx:"你已经三个月没出过门。",
   a:[{t:"去", cost:8, e:()=>{addFat(-22);pay(8);addBuff("mood",1.2,2,"心情不错");
        return "聊了一晚上，回来的时候觉得轻松多了。"}},
      {t:"不去，练",e:()=>{addFat(4);addBuff("train",1.15,1,"心无旁骛");
        return "你把那顿饭的时间换成了两把排位。"}}]},

  {id:"proNews", w:3, when:()=>!!S.world,
   q:()=>{ const lg="LPL";
     const ts=(S.world&&S.world[lg])||[];
     const t=ts[Math.floor(rnd()*ts.length)];
     S._ev={t:t?t.name:"某支队"};
     return `<b>${S._ev.t}</b> 官宣裁掉了首发选手，位置空出来了。`; },
   ctx:"消息底下全是「谁能顶上」。",
   a:[{t:"给自己剪个集锦发过去",e:()=>{addFame(11);
        if(rnd()<0.35){ S.pre&&(S.pre.rank=clamp(S.pre.rank+2,0,100));
          return "有个教练回了你一条：「继续打，我们看着。」"; }
        return "石沉大海。但集锦本身涨了点关注。"}},
      {t:"该干嘛干嘛",e:()=>{return "机会不是这么来的。你回去打排位了。"}}]},

  {id:"laptop", w:1, when:()=>true,
   q:()=>`电脑半夜蓝屏了，硬盘可能坏了。`,
   ctx:"修一下要钱，换一台更要钱。",
   a:[{t:"花钱修", cost:35, e:()=>{pay(35);
        return "修好了，就是风扇声更大了。"}},
      {t:"凑合用",e:()=>{addBuff("train",0.85,2,"设备拖后腿");
        return "接下来两周时不时卡一下，手感很受影响。"}}]},

  {id:"coachDM", w:2, when:()=>(S.pre?S.pre.rank>=30:false),
   q:()=>`一个认证是「青训教练」的号加了你，问你想不想来试训。`,
   ctx:"这次头像和认证都对得上。",
   a:[{t:"去",e:()=>{addFat(14);addFame(16);
        if(S.pre) S.pre.tryoutSeen=1;
        return "打了一下午训练赛。教练说保持联系。"}},
      {t:"先问清楚条件",e:()=>{addFame(5);
        return "对方说了些含糊的话。你没去成，但也没损失。"}}]},

  {id:"teamDinner", w:2, when:()=>!!S.team,
   q:()=>`队里聚餐，经理说想让大家放松放松。`,
   ctx:"你本来打算今晚加练的。",
   a:[{t:"去，喝两杯",e:()=>{typeof addTrustAll==="function"&&addTrustAll(7);addFat(-14);
        typeof addSquad==="function"&&addSquad("syn",2.2);
        return "聊开了不少事。回去的路上气氛很好。"}},
      {t:"留下加练",e:()=>{addBuff("train",1.3,1,"独自加练");
        typeof addTrustAll==="function"&&addTrustAll(-4);
        return "你一个人练到很晚。有人觉得你不合群。"}}]},

  {id:"hater", auto:false, when:()=>S.fame>=70,
   q:()=>`有个营销号剪了你的失误集锦，标题很难听。`,
   ctx:()=>`剪的正是你上一场没成的那几个操作。底下已经几千条了。`,
   a:[{t:"回怼",e:()=>{S.fame+=14;addBuff("mood",0.85,2,"心态受影响");
        return "热度上去了，但你自己也难受了两周。"}},
      {t:"不看，专心打",e:()=>{addBuff("train",1.2,2,"用成绩说话");
        return "你把手机扔一边，练得更狠了。"}},
      {t:"找公关处理", cost:40, e:()=>{pay(40);S.fame+=4;
        return "视频很快下架了。钱花得不冤。"}}]},

  {id:"bonus", w:1, when:()=>!!S.team,
   q:()=>`俱乐部发了笔额外奖金——上个赛段的赞助分成。`,
   ctx:"数额不大，但没想到还有这个。",
   a:[{t:"收下",e:()=>{const n=30+Math.floor(rnd()*50);addMoney("other",n);
        return `到账 ${n} 万。`}}]},

  {id:"junior", w:2, when:()=>(S.pre?S.pre.rank>=25:false),
   q:()=>`同分段一个小号加你好友，说很崇拜你，想跟你双排。`,
   ctx:"他打得不太行，但很热情。",
   a:[{t:"带他两把",e:()=>{addFame(7);addFat(5);
        if(rnd()<0.4) return "他把你们的对局发了出去，你涨了点粉。";
        return "输了两把，但他很开心。"}},
      {t:"婉拒",e:()=>{return "你说最近在冲分。他表示理解。"}}]},

  /* ---------- 以下为定向触发：都由刚刚真的发生的事引出来 ---------- */

  {id:"skid", auto:false, when:()=>!!S.team,
   q:()=>`连败之后，经理把你单独叫去办公室。`,
   ctx:()=>`他没发火，只是问你一句：「你觉得问题在哪？」`,
   a:[{t:"是我的问题，我会调整",e:()=>{typeof addStaff==="function"&&addStaff("mgr",4);
        addBuff("train",1.25,2,"憋着一口气");
        return "他点点头，说这话他信。你接下来两周练得很沉。"}},
      {t:"是体系问题，该换打法",e:()=>{typeof addSquad==="function"&&addSquad("tac",3.2);
        typeof addStaff==="function"&&addStaff("coach",-3);
        return "教练组重新写了 BP 思路。战术顺了，但教练记住了这句话。"}},
      {t:"队友跟不上",e:()=>{typeof addTrustAll==="function"&&addTrustAll(-8);
        typeof addStaff==="function"&&addStaff("mgr",2);
        return "经理没接话。第二天更衣室里没人跟你说话。"}}]},

  {id:"bigWin", auto:false, when:()=>!!S.team,
   q:()=>`赢下强队之后，官方采访点名要你。`,
   ctx:"镜头已经架好了，导播在倒计时。",
   a:[{t:"把功劳给队友",e:()=>{typeof addTrustAll==="function"&&addTrustAll(9);addFame(8);
        return "队友在后台听到了。这句话比赢球本身更管用。"}},
      {t:"放狠话，点名下一个对手",e:()=>{addFame(26);
        typeof noteGrudge==="function"&&0;
        return "热搜挂了一天。下一场对面打得格外凶。"}},
      {t:"照稿念，客套两句",e:()=>{addFame(3);
        return "安全，也没人记住。"}}]},

  {id:"patch", auto:false, when:()=>!!S.team,
   q:()=>`新版本上线，你最拿手的那几个英雄被砍了一刀。`,
   ctx:"训练室里所有人都在重新试阵容。",
   a:[{t:"硬练新英雄池", cost:0, e:()=>{addFat(14);
        S.attrs.操作=Math.min(capOf("操作"),S.attrs.操作+0.6);
        addBuff("train",1.2,2,"重新学起");
        return "两周没打好，但手里多了三个能用的。"}},
      {t:"找教练要针对性 BP",e:()=>{typeof addSquad==="function"&&addSquad("tac",3.6);
        typeof addStaff==="function"&&addStaff("coach",2);
        return "教练给你留了保护位。这个版本你不至于难受。"}},
      {t:"不管版本，硬打",e:()=>{addBuff("mood",0.9,2,"逆版本");
        return "你还在打上个版本的游戏。有几场很别扭。"}}]},

  {id:"exMate", auto:false, when:()=>!!S.team,
   q:()=>`一起打了很久的队友被卖了，走之前来找你吃了顿饭。`,
   ctx:"他说下赛季可能就是对面了。",
   a:[{t:"敬他一杯，好聚好散",e:()=>{addFat(-10);addBuff("mood",1.15,2,"心里踏实");
        return "他说你是队里唯一送他的人。"}},
      {t:"问清楚俱乐部是怎么想的",e:()=>{typeof addStaff==="function"&&addStaff("mgr",-3);
        S.scoutHeat=(S.scoutHeat||0)+1;
        return "他透了点底：管理层也在评估你的位置。你多了个心眼。"}}]},

  {id:"airport", w:1, when:()=>S.fame>=140,
   q:()=>`机场有人认出你，要求合影。`,
   ctx:"你正赶着登机，队友已经过安检了。",
   a:[{t:"停下来合影",e:()=>{addFame(9);addFat(3);
        return "对方发了微博，转发不少。"}},
      {t:"边走边说抱歉",e:()=>{addFame(-4);
        return "有人拍了背影，配文说你耍大牌。"}}]},

  {id:"family", w:2, when:()=>true,
   q:()=>`家里打电话，问你过年回不回去。`,
   ctx:"赛程排在那儿，你自己也说不准。",
   a:[{t:"答应回去待两天",e:()=>{addFat(-18);addBuff("mood",1.2,2,"回了趟家");
        return "在家睡了两天，什么都没想。"}},
      {t:"说今年怕是回不去",e:()=>{addBuff("train",1.15,2,"没别的事");
        return "电话那头停了一下，说打好就行。"}}]},

  {id:"sponsor", w:1, when:()=>!!S.team&&S.fame>=90,
   q:()=>`赞助商寄来一箱新外设，希望你直播时用一下。`,
   ctx:"东西不错，但手感和你现在用的不一样。",
   a:[{t:"接了，直播时用",e:()=>{const n=40+Math.floor(rnd()*40);addMoney("other",n);
        addBuff("train",0.92,1,"手感在适应");
        return `到账 ${n} 万。手感别扭了几天。`}},
      {t:"婉拒，手感要紧",e:()=>{typeof addStaff==="function"&&addStaff("mgr",-2);
        return "商务那边不太高兴，但你的手感没受影响。"}}]}
];

/* ---------- 触发与结算 ---------- */
const EV_CAP=2;                                  // 同一个事件一局最多出几次
function evBusy(){ return !!(S.rndEv||S.locker||S.signup||S.rankUp||S.cupMatch||S.tryout||S.deal); }
function evLeft(e){ return ((S.rndSeen||{})[e.id]||0) < (e.max||EV_CAP); }
function evOpen(e){ try{ return !e.when||e.when(); }catch(x){ return false; } }
function setEv(ev){
  S.rndSeen=Object.assign({},S.rndSeen||{},{[ev.id]:((S.rndSeen||{})[ev.id]||0)+1});
  S.rndEv={id:ev.id,q:ev.q(),ctx:(typeof ev.ctx==="function"?ev.ctx():ev.ctx),a:ev.a};
}
/* 环境事件：每周摇一次，只从 auto 池里挑 */
function tryRandomEvent(){
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
function fireEvent(id,p){
  if(evBusy()) return false;
  if(p!==undefined&&rnd()>=p) return false;
  const e=RANDOM_EVENTS.find(x=>x.id===id);
  if(!e||!evLeft(e)||!evOpen(e)) return false;
  setEv(e);
  return true;
}
/* 选之前先拍个快照，选完对比出「到底变了什么」——
   光给一句文字，玩家不知道自己是赚了还是亏了。 */
function snapshot(){
  const o={money:S.money,fame:S.fame,fat:S.fatigue};
  DIMS.forEach(d=>o["a_"+d]=S.attrs[d]);
  if(S.pre) o.rank=S.pre.rank;
  if(typeof avgTrust==="function"&&S.trust) o.trust=avgTrust();
  if(S.squad){ o.syn=S.squad.syn; o.tac=S.squad.tac; }
  o.buffs=(S.tbuff||[]).map(b=>b.k).join(",");
  return o;
}
function diffOf(a,b){
  const out=[];
  const num=(n,x,y,unit,inv)=>{
    const d=(y||0)-(x||0);
    if(Math.abs(d)<0.5) return;
    out.push({n,v:(d>0?"+":"")+d.toFixed(0)+(unit||""),good:inv?d<0:d>0});
  };
  num("资金",a.money,b.money," 万");
  num("名气",a.fame,b.fame);
  num("体力",-a.fat,-b.fat);                 // 存的是疲劳，显示成体力要取反
  if(a.rank!==undefined) num("段位分",a.rank,b.rank);
  if(a.trust!==undefined) num("士气",a.trust,b.trust);
  if(a.syn!==undefined){ num("默契",a.syn,b.syn); num("战术",a.tac,b.tac); }
  DIMS.forEach(d=>num(d,a["a_"+d],b["a_"+d]));
  // 新拿到的临时增益
  const before=a.buffs.split(",").filter(Boolean);
  (S.tbuff||[]).forEach(x=>{
    if(!before.includes(x.k)) out.push({n:x.n,v:x.left+" 周",good:x.v>=1});
  });
  return out;
}
function resolveRandom(i){
  const ev=S.rndEv; if(!ev) return;
  const before=snapshot();
  const txt=ev.a[i].e();
  const after=snapshot();
  S.rndEv=null; S._ev=null;
  if(S.pre&&S.step==="pre") preLog(txt,"info");
  else pushEvent(txt,"info","际遇");
  // 把结果摊开给玩家看
  S.rndResult={choice:ev.a[i].t,txt,diff:diffOf(before,after)};
  render();
}
function randomResultCard(){
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
function randomCard(){
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
  </div></div>`;
}
