import { checkAch } from "./achieve";
import { addStaff, syncRelations } from "./clout";
import { DIMS, addFans, addFat, avg, capOf, clamp, makeRookie, myRoster, myTeam, pushEvent, q1, render, tacOf, teamTenure } from "./main";
import { rnd } from "./rng";
import { queueFollowUp } from "./press";
import { diffOf, pay, snapshot } from "./random";
import { addMoney } from "./shop";
import { addSquad, disruptSynergy } from "./squad";
import { S } from "./state";
import { addTraitPt, traitMul } from "./trait";

/* ================= 队友信任度 · 更衣室 · 合同与经济 ================= */

/* ---------- 队友信任度 ---------- */
/* 每个队友对你有 0~100 的信任。信任影响全队发挥，也决定更衣室事件走向。 */
export function initTrust(){
  S.trust={};
  // 战术素养的继承之一：打过成建制比赛的新人，队友一开始就多给几分信任（素养 40 ＝ +3）
  const tb=Math.round(Math.min(40,tacOf())*0.075);
  myRoster().forEach(p=>{ if(!p.me) S.trust[p.id]=42+Math.floor(rnd()*16)+tb; });
}
export function trustOf(id){ return S.trust&&S.trust[id]!==undefined?S.trust[id]:50; }
export function avgTrust(){
  const v=Object.values(S.trust||{});
  return v.length?avg(v):50;
}
export function addTrust(id,n){
  if(!S.trust) return;
  if(S.trust[id]===undefined) return;
  // 人物特质改的是「涨得快不快」，掉的时候不打折——粘合剂不该连挨骂都少挨
  if(n>0&&true) n*=traitMul("trust");
  S.trust[id]=q1(clamp(S.trust[id]+n,0,100));   // q1：掐掉浮点尾巴，别让它爬上界面
}
export function addTrustAll(n){ Object.keys(S.trust||{}).forEach(k=>addTrust(k,n)); }
/* 每个赛段结束，信任向 50 回归一截：关系是要一直维护的，不是攒满就一劳永逸 */
export function trustDecay(){
  Object.keys(S.trust||{}).forEach(k=>{
    const v=S.trust[k];
    S.trust[k]=q1(clamp(v+(50-v)*0.28,0,100));
  });
}
/* 信任对战力的修正：更衣室散了，五个人打不出五个人的东西 */
/* 士气乘数（2026-09-05 玩家实锤「青训 85 比 LPL 一线还高」：原来只有你的队有士气项、AI 队永远 ×1.0，
   信任 88 就白拿 +10%）。现在幅度减半（88 → ×1.05），AI 队按近期战绩也有士气（powerCore 的 formMorale） */
export function trustMod(){ return 1+(avgTrust()-50)/760; }

/* 换人后补上新队友的信任（新人不认识你） */
export function syncTrust(){
  if(!S.trust) return;
  const ids=myRoster().filter(p=>!p.me).map(p=>p.id);
  // 新队友从中性起步（46–53），不再自带 −士气：AI 队有了战绩士气之后，转会即扣分让联赛冠军 1.73 掉到 1.35（2026-09-05 批测）
  ids.forEach(id=>{ if(S.trust[id]===undefined) S.trust[id]=46+Math.floor(rnd()*8); });
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
export function checkMateExit(){
  if(!S.career||!S.team||!S.trust) return;
  const t=myTeam();
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
  const nr: any=makeRookie(gone.pos, base-4, S.homeLeague||"LPL");
  nr.lg=lg; nr.form=50;
  t.players[idx]=nr;
  delete S.trust[gone.id];
  syncTrust();
  syncRelations();
  // 士气：一个人被你逼走，剩下的人不会当没看见
  addTrustAll(-9);
  { addStaff("coach",-6); addStaff("mgr",-4); }
  pushEvent(`<b>${gone.id} 走了。</b>俱乐部说是「双方友好协商」，
    但队里都知道是怎么回事。<br>
    位置交给新秀 <b>${nr.id}</b>。<span style="color:var(--ink-3)">
    剩下几个人的信任各掉了 9 点——他们看着你把一个人挤走了。</span>`,"bad","更衣室");
  // 默契崩：这是「队伍士气因为你的选择变化」最实的那一下
  disruptSynergy(1.6, `<b>${gone.id}</b> 离队`);
  S.mateWarn=null;
  S.rosterSig=myRoster().map(x=>x.id).sort().join("|");
}

/* ---------- 更衣室事件 ---------- */
export const LOCKER=[
  {id:"blame", rec:0, when:()=>S.record.l>=2&&rnd()<0.5,
   q:t=>`输球后复盘，<b>${t.id}</b> 说那波团是你先开的。`,
   ctx:"所有人都在看你怎么回。",
   /* 玩家 2026-09-06 点名：每个选项都得有对应的好处和坏处，不能有纯亏的 */
   a:[{t:"认下来，这波我的问题", g:"warm",e:(t)=>{addTrustAll(6);S.attrs.心态=Math.min(capOf("心态"),S.attrs.心态+0.8);addFans(-3);
        return "你把锅接了。更衣室安静下来，气氛缓和——弹幕里倒是有人开始说你「就是背锅的」。"}},
      {t:"数据摆出来，不是我的问题", g:"hard",e:(t)=>{addTrust(t.id,-12);addTrustAll(-3);addStaff("coach",6);
        return `你把回放调出来逐帧过。${t.id} 没再说话，但脸色不好看。教练在旁边点了点头——他要的就是敢看数据的人。`}},
      {t:"当场吵回去", g:"hard",e:(t)=>{addTrust(t.id,-20);addTrustAll(-6);addFans(9);S.heat=(S.heat||0)+12;S.attrs.心态=Math.min(capOf("心态"),S.attrs.心态+0.4);
        return "更衣室炸了。第二天这段被爆料出去，上了热搜——人气和热度都涨了，你也硬气了一点。"}}]},

  {id:"resource", rec:2, when:()=>rnd()<0.4,
   q:t=>`<b>${t.id}</b> 想要更多资源，说这个版本该走他这边。`,
   ctx:"教练把决定权交给了你。",
   /* 玩家点名：原文「我打辅助位」像是要转去打辅助——意思其实是少吃资源、打功能型 */
   a:[{t:"资源给他，我少吃点、打功能型", g:"warm",e:(t)=>{addTrust(t.id,14);addTrustAll(4);if(S.form!==undefined) S.form=q1(clamp(S.form-4,25,95));
        return `${t.id} 拿到了资源，也记住了这份人情。你这个版本先把工具人做好——手感会闷一阵。`}},
      {t:"资源还是给我，我能打出来", g:"hard",e:(t)=>{addTrust(t.id,-9);if(S.form!==undefined) S.form=q1(clamp(S.form+5,25,95));S.attrs.操作=Math.min(capOf("操作"),S.attrs.操作+0.5);
        return `你留下了资源。${t.id} 没多说，但训练赛里少了几次配合。资源在手，你的手感和对线确实更顺了。`}},
      {t:"看局势分，不预设",e:(t)=>{addTrust(t.id,3);addTrustAll(2);addSquad("tac",-2);
        return "折中方案，没人特别满意，也没人不满意。打法没定下来，训练赛里各打各的。"}}]},

  {id:"rookie", rec:0, when:()=>(teamTenure())>=3&&myRoster().some(p=>!p.me&&p.rookie)&&rnd()<0.5,
   q:t=>`新秀 <b>${t.id}</b> 连着几把打崩，训练室里一个人坐着。`,
   ctx:"你也从那个位置过来过。",
   a:[{t:"陪他加练两个小时", g:"warm",e:(t)=>{addTrust(t.id,18);addTrustAll(3);addFat(10);
        DIMS.forEach(d=>{ if(d!=="操作") t.r[d]=clamp(t.r[d]+1.2,20,99); });
        checkAch("mentor");
        return `${t.id} 的状态回来了一些。他记住了这件事。`}},
      {t:"让他自己扛过去", g:"show",e:(t)=>{addTrust(t.id,-6);addFat(-6);
        return "职业圈本来就是这样。他没说什么。你把这两个小时留给了自己。"}}]},

  {id:"veteran", rec:0, when:()=>(teamTenure())>=3&&myRoster().some(p=>!p.me&&p.age>=27)&&rnd()<0.45,
   q:t=>`老将 <b>${t.id}</b> 私下问你，是不是该退了。`,
   ctx:"他的操作确实在掉，但他还是队里最懂运营的人。",
   a:[{t:"你还能打，队里需要你", g:"warm",e:(t)=>{addTrust(t.id,16);addTrustAll(4);addStaff("coach",-4);
        t.r.指挥=clamp(t.r.指挥+2.5,20,99);
        return `${t.id} 点了点头。那个赛季他的指挥变得更果断了——教练组本来想换人，对你这句话有点意见。`}},
      {t:"实话说，你该考虑转型", g:"hard",e:(t)=>{addTrust(t.id,-10);addStaff("coach",6);S.attrs.指挥=Math.min(capOf("指挥"),S.attrs.指挥+0.6);
        return "他沉默了很久，说谢谢你的诚实。之后训练赛里开麦的人变成了你，教练也记下了这一点。"}}]},

  {id:"media", rec:0, when:()=>S.fans>=100&&rnd()<0.35,
   q:t=>`媒体想做你的专访，队里其他人一个都没约。`,
   ctx:"流量都在你身上，这未必是好事。",
   a:[{t:"接，顺便多提队友", g:"warm",e:(t)=>{addFans(12);addMoney("other",14);addTrustAll(5);addFat(6);
        return "采访里你把功劳分了出去。队友看到了。拍了一下午，晚上的训练没赶上。"}},
      {t:"接，好好聊自己", g:"show",e:(t)=>{addFans(22);addMoney("other",20);addTrustAll(-7);
        return "热度起来了。更衣室里有人觉得你飘了。"}},
      {t:"推掉，专心训练", g:"grind",e:(t)=>{addFans(-4);addTrustAll(4);
        DIMS.forEach(()=>{}); return "你没去。教练组对此表示满意。"}}]}
];

export function tryLockerEvent(){
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
export function resolveLocker(i){
  const {ev,target}=S.locker;
  addTraitPt(ev.a[i].g);   // 这一次选择也算进你是什么样的人
  /* 玩家原话：「选择后不告诉我有什么改变」——效果全是暗改。
     现在和际遇一样：快照前后差异，弹结果卡摊开给你看。 */
  const before=snapshot();
  const t0=(target)?trustOf(target.id):null;
  const txt=ev.a[i].e(target);
  pushEvent(`更衣室：${txt}`,"info","更衣室");
  if(before&&true){
    S.rndResult={choice:ev.a[i].t,txt,diff:diffOf(before,snapshot())};
  }
  /* 更衣室的选择要留回声（接进事件链）：对这个人好不好，他过几周会记得。 */
  if(target&&t0!==null&&true){
    const dt=trustOf(target.id)-t0;
    if(dt>=2&&rnd()<0.5)  queueFollowUp("lockerEcho",2,{who:target.id,good:true});
    if(dt<=-2&&rnd()<0.5) queueFollowUp("lockerEcho",2,{who:target.id,good:false});
  }
  S.locker=null; render();
}

/* ---------- 合同与经济 ---------- */
/* 2026-08-31 经济重锚：收入侧全面缩水，支出跟着 ÷2——买得起，但要取舍 */
export const SPEND=[
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
export function salaryOf(){
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
export function payday(){
  const pay=salaryOf();
  addMoney("salary",pay);
  pushEvent(`赛段结算：薪资到账 <b>${pay} 万</b>（当前人气 ${Math.round(S.fans)}）。`,"info","合同");
}
/* 合同：两个赛季一签，到期不再暗箱判「留/走」，而是走一条你看得见、由你拍板的流程：
   · 队伍愿意留你 → 递一份「续约报价」，你签 / 拒（拒 → 转自由市场）
   · 队伍放你走   → 明确告知 + 原因，转自由市场（不再瞬移到随机弱队）
   返回 "renew"（已挂起 S.pendingRenew）或 "cut"（队伍放走）；未到期返回 null。 */
export function contractCheck(){
  S.contract=S.contract||{years:2,left:2};
  S.contract.left--;
  if(S.contract.left>0) return null;
  const ovr=avg(DIMS.map(d=>S.attrs[d]));
  const mates=myRoster().filter(p=>!p.me);
  const teamAvg=mates.length?avg(mates.map(p=>avg(DIMS.map(d=>p.r[d])))):ovr;
  const trust=avgTrust();
  // 今年拿了任意冠军（联赛/MSI/世界赛）= 铁续约——修「夺冠却被裁」（玩家 TOP 夺冠被裁实锤）
  const wonTitle = ((S.career&&S.career.lgYears)||[]).includes(S.si)
                || ((S.career&&S.career.msiYears)||[]).includes(S.si)
                || ((S.career&&S.career.worldsYears)||[]).includes(S.si);
  const wantRenew = wonTitle || (ovr>=teamAvg-6 && trust>=35);
  if(wantRenew){
    // 续约不是重签一份一样的合同：打得好、拿了冠军，年薪和违约金都往上走
    const raise=clamp(1.15+(ovr-teamAvg)*0.02+(wonTitle?0.15:0),1.05,1.9);
    const old=S.contract;
    S.pendingRenew={
      team:S.team, years:2,
      salary: old.salary!==undefined?Math.round(old.salary*raise):undefined,
      buyout: old.buyout!==undefined?Math.round(old.buyout*raise):undefined,
      tier:old.tier, grade:old.grade, clubTier:old.clubTier,
      wonTitle, oldSalary:old.salary, oldBuyout:old.buyout
    };
    return "renew";
  }
  // 队伍不再续约：原因写清楚，成为自由身转自由市场
  S.freeAgent = true;
  S.cutReason = trust<35
    ? "更衣室对你的信任跌破了底线，管理层不再给合同。"
    : "你的水平已经明显跟不上这支队，他们决定不续约。";
  return "cut";
}
