/* ================= 随机事件 =================
   有好有坏，由你的选择决定走向。
   刻意做得「不致命」——最多是两周的临时增益或者一笔小钱，
   不会一次事件定生死。它们负责的是质感，不是数值。 */

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
function buffChips(){
  if(!S.tbuff||!S.tbuff.length) return "";
  return `<div class="buffs">${S.tbuff.map(b=>
    `<span class="buff ${b.v>=1?'good':'bad'}">${b.n}<i>${b.left}周</i></span>`).join("")}</div>`;
}

/* ---------- 事件池 ----------
   when: 触发条件；weight: 相对权重
   选项的 e() 返回一句结果文字。                          */
const RANDOM_EVENTS=[
  {id:"edgLose", w:3, when:()=>true,
   q:()=>{ const t=["EDG","RNG","JDG","BLG","TES","LNG"][Math.floor(rnd()*6)];
           S._ev={t}; return `你从小看的 <b>${S._ev.t}</b> today 又输了，还是那种该赢的局。`; },
   ctx:"你盯着结算界面看了很久。",
   a:[{t:"憋着一股劲，加练",e:()=>{addBuff("train",1.5,2,"憋着劲");addFat(6);
        return "接下来两周你练得比谁都狠。"}},
      {t:"发条动态骂两句",e:()=>{S.fame+=6;addTrustAll&&0;
        return "转发不少，也有人说你不懂别乱说。"}},
      {t:"关掉，睡了",e:()=>{addFat(-8);
        return "第二天状态还行。有些事跟你没关系。"}}]},

  {id:"scam", w:2, when:()=>S.money>=60,
   q:()=>`有人私信你，说能内推进某青训营，先交 <b>50 万</b>「考察费」。`,
   ctx:"对方头像是个战队 logo，但你查不到这个人。",
   a:[{t:"交钱试试",e:()=>{ if(rnd()<0.72){ S.money-=50;
          return "对方收了钱就把你拉黑了。这五十万买了个教训。"; }
        S.money-=50; S.pre&&(S.pre.scoutHint=1); addFame(14);
        return "居然是真的，你被安排去看了一场训练赛，认识了两个人。"}},
      {t:"不理",e:()=>{return "你没回。第二天那个号就注销了。"}},
      {t:"挂到网上",e:()=>{S.fame+=9;
        return "帖子火了，不少人说自己也被骗过。"}}]},

  {id:"wrist", w:2, when:()=>S.fatigue>=55,
   q:()=>`手腕开始疼。你已经连着几周高强度了。`,
   ctx:"忍一忍也能打，但你知道这东西会积累。",
   a:[{t:"去医院看看",e:()=>{S.money-=25;addFat(-30);addBuff("train",0.8,1,"休养中");
        return "医生说没大事，让你少练两天。"}},
      {t:"贴个膏药接着练",e:()=>{addFat(10);
        if(rnd()<0.3){ S.attrs.体质=Math.max(20,S.attrs.体质-1.5);
          return "疼了一整周。你的体质悄悄掉了一点。"; }
        return "扛过去了，这次运气不错。"}}]},

  {id:"streamGift", w:2, when:()=>S.fame>=40,
   q:()=>`直播间来了个大哥，一口气刷了一堆礼物。`,
   ctx:"他要求你连麦陪他打两把。",
   a:[{t:"陪打",e:()=>{S.money+=45;addFat(8);addFame(4);
        return "他玩得很开心，还说下次再来。"}},
      {t:"婉拒，正常直播",e:()=>{S.money+=12;addFame(6);
        return "弹幕觉得你挺有原则的。"}}]},

  {id:"oldFriend", w:2, when:()=>true,
   q:()=>`初中同学约你出去吃饭，说好久没见了。`,
   ctx:"你已经三个月没出过门。",
   a:[{t:"去",e:()=>{addFat(-22);S.money-=8;addBuff("mood",1.2,2,"心情不错");
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
   a:[{t:"花钱修",e:()=>{S.money-=35;
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

  {id:"hater", w:2, when:()=>S.fame>=70,
   q:()=>`有个营销号剪了你的失误集锦，标题很难听。`,
   ctx:"底下已经几千条了。",
   a:[{t:"回怼",e:()=>{S.fame+=14;addBuff("mood",0.85,2,"心态受影响");
        return "热度上去了，但你自己也难受了两周。"}},
      {t:"不看，专心打",e:()=>{addBuff("train",1.2,2,"用成绩说话");
        return "你把手机扔一边，练得更狠了。"}},
      {t:"找公关处理",e:()=>{S.money-=40;S.fame+=4;
        return "视频很快下架了。钱花得不冤。"}}]},

  {id:"bonus", w:1, when:()=>!!S.team,
   q:()=>`俱乐部发了笔额外奖金——上个赛段的赞助分成。`,
   ctx:"数额不大，但没想到还有这个。",
   a:[{t:"收下",e:()=>{const n=30+Math.floor(rnd()*50);S.money+=n;
        return `到账 ${n} 万。`}}]},

  {id:"junior", w:2, when:()=>(S.pre?S.pre.rank>=25:false),
   q:()=>`同分段一个小号加你好友，说很崇拜你，想跟你双排。`,
   ctx:"他打得不太行，但很热情。",
   a:[{t:"带他两把",e:()=>{addFame(7);addFat(5);
        if(rnd()<0.4) return "他把你们的对局发了出去，你涨了点粉。";
        return "输了两把，但他很开心。"}},
      {t:"婉拒",e:()=>{return "你说最近在冲分。他表示理解。"}}]}
];

/* ---------- 触发与结算 ---------- */
function tryRandomEvent(){
  if(S.rndEv||S.locker||S.signup||S.rankUp) return false;
  const seen=S.rndSeen||{};
  const pool=RANDOM_EVENTS.filter(e=>{
    if((seen[e.id]||0)>=2) return false;      // 同一个事件一局最多两次
    try{ return e.when(); }catch(x){ return false; }
  });
  if(!pool.length) return false;
  const tot=pool.reduce((a,e)=>a+e.w,0);
  let r=rnd()*tot;
  const ev=pool.find(e=>(r-=e.w)<=0)||pool[0];
  S.rndSeen=Object.assign({},seen,{[ev.id]:(seen[ev.id]||0)+1});
  S.rndEv={id:ev.id,q:ev.q(),ctx:ev.ctx,a:ev.a};
  return true;
}
function resolveRandom(i){
  const ev=S.rndEv; if(!ev) return;
  const txt=ev.a[i].e();
  S.rndEv=null; S._ev=null;
  if(S.pre&&S.step==="pre") preLog(txt,"info");
  else pushEvent(txt,"info","际遇");
  render();
}
function randomCard(){
  const e=S.rndEv; if(!e) return "";
  return `<div class="card"><h2>际遇</h2>
    <div class="node"><div class="q">${e.q}</div><div class="ctx">${e.ctx}</div>
    <div class="grid g2">${e.a.map((x,i)=>`<button class="opt" data-rnd="${i}">
      <div class="t">${x.t}</div></button>`).join("")}</div></div></div>`;
}
