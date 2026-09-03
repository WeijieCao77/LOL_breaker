/* ================= 队友信任度 · 更衣室 · 合同与经济 ================= */

/* ---------- 队友信任度 ---------- */
/* 每个队友对你有 0~100 的信任。信任影响全队发挥，也决定更衣室事件走向。 */
function initTrust(){
  S.trust={};
  // 战术素养的继承之一：打过成建制比赛的新人，队友一开始就多给几分信任（素养 40 ＝ +3）
  const tb=(typeof tacOf==="function")?Math.round(Math.min(40,tacOf())*0.075):0;
  myRoster().forEach(p=>{ if(!p.me) S.trust[p.id]=42+Math.floor(rnd()*16)+tb; });
}
function trustOf(id){ return S.trust&&S.trust[id]!==undefined?S.trust[id]:50; }
function avgTrust(){
  const v=Object.values(S.trust||{});
  return v.length?avg(v):50;
}
function addTrust(id,n){
  if(!S.trust) return;
  if(S.trust[id]===undefined) return;
  // 人物特质改的是「涨得快不快」，掉的时候不打折——粘合剂不该连挨骂都少挨
  if(n>0&&typeof traitMul==="function") n*=traitMul("trust");
  S.trust[id]=q1(clamp(S.trust[id]+n,0,100));   // q1：掐掉浮点尾巴，别让它爬上界面
}
function addTrustAll(n){ Object.keys(S.trust||{}).forEach(k=>addTrust(k,n)); }
/* 每个赛段结束，信任向 50 回归一截：关系是要一直维护的，不是攒满就一劳永逸 */
function trustDecay(){
  Object.keys(S.trust||{}).forEach(k=>{
    const v=S.trust[k];
    S.trust[k]=q1(clamp(v+(50-v)*0.28,0,100));
  });
}
/* 信任对战力的修正：更衣室散了，五个人打不出五个人的东西 */
function trustMod(){ return 1+(avgTrust()-50)/380; }

/* 换人后补上新队友的信任（新人不认识你） */
function syncTrust(){
  if(!S.trust) return;
  const ids=myRoster().filter(p=>!p.me).map(p=>p.id);
  ids.forEach(id=>{ if(S.trust[id]===undefined) S.trust[id]=38+Math.floor(rnd()*10); });
  Object.keys(S.trust).forEach(k=>{ if(!ids.includes(k)) delete S.trust[k]; });
}

/* ---------- 队友会因为你的选择离队 ----------

   玩家原话：「事件也会影响世界，比如队友离队，那战队的士气肯定会
   因为你的选择出现变化」。

   更衣室里那些选择原来只改一个数字——他对你的信任——改完就沉底了，
   世界里什么也没发生。现在它有出口：信任跌到底的人，赛段结束会走。
   走了之后默契崩、剩下的人跟着凉一截、位置换成新秀、队伍战力真的变。
   于是「当场吵回去」不再是一句台词，是你亲手把一个人赶出了队。

   刻意留了一步预警：先给一次「他已经不跟你说话了」，还有一个赛段可以挽回。
   人走得突然是运气，人走得有征兆才是后果。                            */
function checkMateExit(){
  if(!S.career||!S.team||!S.trust) return;
  const t=(typeof myTeam==="function")?myTeam():null;
  if(!t||!t.players) return;
  const mates=t.players.filter(p=>!p.me);
  if(mates.length<=1) return;                       // 队里不能只剩你一个
  const low=mates.filter(p=>trustOf(p.id)<=18);
  if(!low.length){ S.mateWarn=null; return; }
  // 一次只走一个：一个赛段崩掉半支队是灾难，不是叙事
  const gone=low.reduce((a,b)=>trustOf(a.id)<=trustOf(b.id)?a:b);
  if(S.mateWarn!==gone.id){
    S.mateWarn=gone.id;
    pushEvent(`<b>${gone.id}</b>${gone.cn?`（${gone.cn}）`:""} 在更衣室里已经不跟你说话了。<br>
      <span style="color:var(--ink-3)">信任 ${Math.round(trustOf(gone.id))}/100。
      再这样下去，他不会留到下个赛段——现在修还来得及。</span>`,"bad","更衣室");
    return;                                          // 先给一次预警
  }
  // 预警过了还是这个数，那就真的走了
  const lg=S.homeLeague||"LPL";
  const base=(S.baseline&&S.baseline[lg])||50;
  const idx=t.players.indexOf(gone);
  const nr=makeRookie(gone.pos, base-4);
  nr.lg=lg; nr.form=50;
  t.players[idx]=nr;
  delete S.trust[gone.id];
  if(typeof syncTrust==="function") syncTrust();
  if(typeof syncRelations==="function") syncRelations();
  // 士气：一个人被你逼走，剩下的人不会当没看见
  addTrustAll(-9);
  if(typeof addStaff==="function"){ addStaff("coach",-6); addStaff("mgr",-4); }
  pushEvent(`<b>${gone.id} 走了。</b>俱乐部说是「双方友好协商」，
    但队里都知道是怎么回事。<br>
    位置交给新秀 <b>${nr.id}</b>。<span style="color:var(--ink-3)">
    剩下几个人的信任各掉了 9 点——他们看着你把一个人挤走了。</span>`,"bad","更衣室");
  // 默契崩：这是「队伍士气因为你的选择变化」最实的那一下
  if(typeof disruptSynergy==="function") disruptSynergy(1.6, `<b>${gone.id}</b> 离队`);
  S.mateWarn=null;
  S.rosterSig=(typeof myRoster==="function")?myRoster().map(x=>x.id).sort().join("|"):S.rosterSig;
}

/* ---------- 更衣室事件 ---------- */
const LOCKER=[
  {id:"blame", rec:0, when:()=>S.record.l>=2&&rnd()<0.5,
   q:t=>`输球后复盘，<b>${t.id}</b> 说那波团是你先开的。`,
   ctx:"所有人都在看你怎么回。",
   a:[{t:"认下来，这波我的问题", g:"warm",e:(t)=>{addTrustAll(6);S.attrs.心态=Math.min(capOf("心态"),S.attrs.心态+0.8);
        return "你把锅接了。更衣室安静下来，气氛缓和。"}},
      {t:"数据摆出来，不是我的问题", g:"hard",e:(t)=>{addTrust(t.id,-12);addTrustAll(-3);
        return `你把回放调出来逐帧过。${t.id} 没再说话，但脸色不好看。`}},
      {t:"当场吵回去", g:"hard",e:(t)=>{addTrust(t.id,-20);addTrustAll(-6);addFans(3);
        return "更衣室炸了。第二天这段被爆料出去，上了热搜。"}}]},

  {id:"resource", rec:2, when:()=>rnd()<0.4,
   q:t=>`<b>${t.id}</b> 想要更多资源，说这个版本该走他这边。`,
   ctx:"教练把决定权交给了你。",
   a:[{t:"让给他，我打辅助位", g:"warm",e:(t)=>{addTrust(t.id,14);addTrustAll(4);
        return `${t.id} 拿到了资源，也记住了这份人情。`}},
      {t:"资源还是给我，我能打出来", g:"hard",e:(t)=>{addTrust(t.id,-9);
        return `你留下了资源。${t.id} 没多说，但训练赛里少了几次配合。`}},
      {t:"看局势分，不预设",e:(t)=>{addTrust(t.id,3);addTrustAll(2);
        return "折中方案，没人特别满意，也没人不满意。"}}]},

  {id:"rookie", rec:0, when:()=>(typeof teamTenure==="function"?teamTenure():99)>=3&&myRoster().some(p=>!p.me&&p.rookie)&&rnd()<0.5,
   q:t=>`新秀 <b>${t.id}</b> 连着几把打崩，训练室里一个人坐着。`,
   ctx:"你也从那个位置过来过。",
   a:[{t:"陪他加练两个小时", g:"warm",e:(t)=>{addTrust(t.id,18);addTrustAll(3);addFat(10);
        DIMS.forEach(d=>{ if(d!=="操作") t.r[d]=clamp(t.r[d]+1.2,20,99); });
        if(typeof checkAch==="function") checkAch("mentor");
        return `${t.id} 的状态回来了一些。他记住了这件事。`}},
      {t:"让他自己扛过去", g:"show",e:(t)=>{addTrust(t.id,-6);
        return "职业圈本来就是这样。他没说什么。"}}]},

  {id:"veteran", rec:0, when:()=>(typeof teamTenure==="function"?teamTenure():99)>=3&&myRoster().some(p=>!p.me&&p.age>=27)&&rnd()<0.45,
   q:t=>`老将 <b>${t.id}</b> 私下问你，是不是该退了。`,
   ctx:"他的操作确实在掉，但他还是队里最懂运营的人。",
   a:[{t:"你还能打，队里需要你", g:"warm",e:(t)=>{addTrust(t.id,16);addTrustAll(4);
        t.r.指挥=clamp(t.r.指挥+2.5,20,99);
        return `${t.id} 点了点头。那个赛季他的指挥变得更果断了。`}},
      {t:"实话说，你该考虑转型", g:"hard",e:(t)=>{addTrust(t.id,-10);
        return "他沉默了很久，说谢谢你的诚实。"}}]},

  {id:"media", rec:0, when:()=>S.fans>=100&&rnd()<0.35,
   q:t=>`媒体想做你的专访，队里其他人一个都没约。`,
   ctx:"流量都在你身上，这未必是好事。",
   a:[{t:"接，顺便多提队友", g:"warm",e:(t)=>{addFans(12);addMoney("other",14);addTrustAll(5);
        return "采访里你把功劳分了出去。队友看到了。"}},
      {t:"接，好好聊自己", g:"show",e:(t)=>{addFans(22);addMoney("other",20);addTrustAll(-7);
        return "热度起来了。更衣室里有人觉得你飘了。"}},
      {t:"推掉，专心训练", g:"grind",e:(t)=>{addFans(-4);addTrustAll(4);
        DIMS.forEach(()=>{}); return "你没去。教练组对此表示满意。"}}]}
];

function tryLockerEvent(){
  if(S.locker) return false;
  const mates=myRoster().filter(p=>!p.me);
  if(!mates.length) return false;
  const pool=LOCKER.filter(e=>!(S.lockerSeen||[]).includes(e.id+S.si+S.split)&&e.when());
  if(!pool.length) return false;
  const ev=pool[Math.floor(rnd()*pool.length)];
  let target=mates[Math.floor(rnd()*mates.length)];
  if(ev.id==="rookie") target=mates.find(p=>p.rookie)||target;
  if(ev.id==="veteran") target=mates.find(p=>p.age>=27)||target;
  S.locker={ev,target};
  S.lockerSeen=(S.lockerSeen||[]).concat([ev.id+S.si+S.split]);
  return true;
}
function resolveLocker(i){
  const {ev,target}=S.locker;
  if(typeof addTraitPt==="function") addTraitPt(ev.a[i].g);   // 这一次选择也算进你是什么样的人
  /* 玩家原话：「选择后不告诉我有什么改变」——效果全是暗改。
     现在和际遇一样：快照前后差异，弹结果卡摊开给你看。 */
  const before=(typeof snapshot==="function")?snapshot():null;
  const t0=(typeof trustOf==="function"&&target)?trustOf(target.id):null;
  const txt=ev.a[i].e(target);
  pushEvent(`更衣室：${txt}`,"info","更衣室");
  if(before&&typeof diffOf==="function"){
    S.rndResult={choice:ev.a[i].t,txt,diff:diffOf(before,snapshot())};
  }
  /* 更衣室的选择要留回声（接进事件链）：对这个人好不好，他过几周会记得。 */
  if(typeof queueFollowUp==="function"&&target&&t0!==null&&typeof trustOf==="function"){
    const dt=trustOf(target.id)-t0;
    if(dt>=2&&rnd()<0.5)  queueFollowUp("lockerEcho",2,{who:target.id,good:true});
    if(dt<=-2&&rnd()<0.5) queueFollowUp("lockerEcho",2,{who:target.id,good:false});
  }
  S.locker=null; render();
}

/* ---------- 合同与经济 ---------- */
/* 2026-08-31 经济重锚：收入侧全面缩水，支出跟着 ÷2——买得起，但要取舍 */
const SPEND=[
  {k:"coach",n:"请私教",cost:60,d:"下个赛段训练收益提升",
   run:()=>{S.buff.coach=1;}},
  {k:"physio",n:"理疗师",cost:42,d:"疲劳恢复更快，状态更稳",
   run:()=>{S.buff.physio=1;addFat(-25);}},
  {k:"team",n:"团队建设",cost:55,d:"全队信任提升",
   run:()=>{addTrustAll(16);}},
  {k:"pr",n:"舆论公关",cost:35,d:"压下负面，人气回升",
   run:()=>{addFans(14);}}
];
/* 薪资 = 谈出来的年薪 + 人气与荣誉带来的浮动。
   合同里那个数字必须真的算数，否则谈判就是假的。 */
function salaryOf(){
  const c=S.contract||{};
  // 粉丝的尺度在「名气拆成粉丝＋热度」之后变了：同一个测试口径下
  // 老的名气中位 1092、新的粉丝中位 4871，系数不跟着调就等于每赛段白发几百万。
  // 0.045 是标定出来的——让薪资浮动的中位贡献仍然是 ~218 万，和改之前一致。
  // 封顶也补上：粉丝没有上界，薪资浮动不能跟着没有上界。
  // 2026-08-31 经济重锚：浮动收窄到原来的约 1/4——
  // 名气与荣誉的钱主要走合同谈判和奖金，不再靠每赛段自动加薪。
  const bonus=Math.round(Math.min(S.fans,6000)*0.012)+(S.career.leagueTitles||0)*6
    +((S.career.msi||0)+(S.career.worlds||0))*14;
  if(c.salary!==undefined) return Math.round(c.salary+bonus);
  // 老存档或没走谈判流程的情况，退回旧算法
  const kindMul={sub:1.25,start:1.0,core:0.85,foreign:1.15}[S.offerKind]||1;
  return Math.round((26+bonus)*kindMul);
}
function payday(){
  const pay=salaryOf();
  if(typeof addMoney==="function") addMoney("salary",pay); else S.money+=pay;
  pushEvent(`赛段结算：薪资到账 <b>${pay} 万</b>（当前人气 ${Math.round(S.fans)}）。`,"info","合同");
}
/* 合同：两个赛季一签，到期看表现续约或走人 */
function contractCheck(){
  S.contract=S.contract||{years:2,left:2};
  S.contract.left--;
  if(S.contract.left>0) return null;
  const ovr=avg(DIMS.map(d=>S.attrs[d]));
  const teamAvg=avg(myRoster().filter(p=>!p.me).map(p=>avg(DIMS.map(d=>p.r[d]))));
  const keep = ovr>=teamAvg-6 && avgTrust()>=35;
  if(keep){
    // 续约不是重签一份一样的合同：打得好，年薪和违约金都往上走
    const raise=clamp(1.15+(ovr-teamAvg)*0.02,1.05,1.7);
    const old=S.contract.salary;
    S.contract={
      years:2, left:2,
      salary: old!==undefined?Math.round(old*raise):undefined,
      sign: 0,
      buyout: S.contract.buyout!==undefined?Math.round(S.contract.buyout*raise):undefined,
      team:S.team, tier:S.contract.tier, grade:S.contract.grade,
      clubTier:S.contract.clubTier
    };
    pushEvent(`<b>${S.team}</b> 与你续约两个赛段，薪资涨到 <b>${salaryOf()} 万</b>${
      S.contract.buyout?`，违约金提到 <b>${S.contract.buyout} 万</b>`:""}。`,"good","合同");
    return null;
  }
  S.contract={years:2,left:2};
  return "cut";
}
