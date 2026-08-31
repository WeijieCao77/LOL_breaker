/* ================= 人物特质：事件把你变成什么样的人 =================

   玩家原话：「事件要对人物产生效果，要让玩家感受到变化」。

   原来事件的后果是 fans+11、fat+6、两周的训练 buff——这些数字太小、太短、
   太散，玩家点完就忘了，等于什么也没发生。真正让人感受到变化的，
   是**你成了另一种人**，而且这件事回不去。

   所以：每个事件选项带一个气质标签，选择会累积。累到线上，
   你获得一个**永久特质**——用一整屏告诉你「你成了这样的人」，
   然后它真的改数值（涨粉、信任、训练、疲劳、逆风心态），
   而且写在属性卡上一直跟着你。

   四条气质轴，对应四种人：
     硬 —— 对抗、强硬、不服软
     暖 —— 顾队友、认错、陪着人
     苦 —— 埋头练、拒绝诱惑
     秀 —— 上镜、商务、把自己推出去

   刻意做成**有得有失**：刺头涨粉快但队友难带，粘合剂队友好带但没人记得住你。
   没有一个是纯赚的——否则它就不是性格，是奖励。                        */

const TRAIT_AXES={ hard:"硬", warm:"暖", grind:"苦", show:"秀" };
const TRAIT_NEED=5;          // 同一条轴选够几次，就成了那样的人
/* 互为反面的两组：你不可能既是刺头又是老好人，也不可能既埋头又天天上镜。
   先成型的那个把对面挡掉——性格是排他的，不是可以集齐的收藏品。 */
const TRAIT_OPP={ edge:"glue", glue:"edge", grinder:"star", star:"grinder" };

const TRAITS=[
  {k:"edge", axis:"hard", n:"刺头",
   d:"你从不咽下那口气。镜头喜欢你，更衣室不一定。",
   e:{fan:1.18, trust:0.80, clutch:2.2},
   txt:"涨粉 +18%　·　队友信任涨幅 −20%　·　逆风时更稳（战力 +2.2）"},

  {k:"glue", axis:"warm", n:"更衣室粘合剂",
   d:"锅你先接，功劳你先让。队伍因为你转得顺，但没人把你当故事讲。",
   e:{trust:1.35, fan:0.90},
   txt:"队友信任涨幅 +35%　·　涨粉 −10%"},
  {k:"grinder", axis:"grind", n:"劳模",
   d:"别人在应酬的时候你在训练室。练得比谁都多，也累得比谁都久。",
   e:{train:1.14, rest:0.88},
   txt:"训练收益 +14%　·　休息回体能 −12%"},

  {k:"star", axis:"show", n:"话题人物",
   d:"你知道怎么让人讨论你。流量是真的，教练的白眼也是真的。",
   e:{fan:1.28, coachPer:-2},
   txt:"涨粉 +28%　·　每赛段教练信任 −2"}
];

function traitHas(k){ return !!(S.traits && S.traits.indexOf(k)>=0); }
function traitList(){ return (S.traits||[]).map(k=>TRAITS.find(t=>t.k===k)).filter(Boolean); }
/* 把所有已有特质在某一项上的效果乘起来。没有特质就是 1（或 0，加法项） */
function traitMul(key, add){
  let v = add ? 0 : 1;
  traitList().forEach(t=>{
    const x=t.e[key];
    if(x===undefined) return;
    if(add) v+=x; else v*=x;
  });
  return v;
}
/* 事件选项带的气质标签——选一次记一笔 */
function addTraitPt(g){
  if(!g||!TRAIT_AXES[g]) return;
  S.traitPts=S.traitPts||{};
  S.traitPts[g]=(S.traitPts[g]||0)+1;
  const t=TRAITS.find(x=>x.axis===g);
  if(t && traitHas(TRAIT_OPP[t.k])) return;      // 反面已经成型了，这条路走不通
  if(t && !traitHas(t.k) && S.traitPts[g]>=TRAIT_NEED){
    S.traits=(S.traits||[]).concat(t.k);
    S.traitUp=t;                       // 交给界面用一整屏告诉玩家
    pushEvent(`<b>你成了「${t.n}」。</b>${t.d}<br>
      <span style="color:var(--ink-3)">${t.txt}</span>`,"big","人物");
  }
}
/* 离下一个特质还差几次——摆在属性卡上，让玩家看得见自己正在变成谁 */
function traitProgress(){
  const out=[];
  Object.keys(TRAIT_AXES).forEach(g=>{
    const t=TRAITS.find(x=>x.axis===g);
    if(!t||traitHas(t.k)||traitHas(TRAIT_OPP[t.k])) return;
    const p=(S.traitPts&&S.traitPts[g])||0;
    if(p>0) out.push({n:t.n, axis:TRAIT_AXES[g], p, need:TRAIT_NEED});
  });
  return out.sort((a,b)=>b.p-a.p);
}

/* ---------- 界面 ---------- */
/* 获得特质那一刻：一整屏。这是「感受到变化」的那一下，不能塞在事件流里划过去。 */
function traitUpCard(){
  const t=S.traitUp; if(!t) return "";
  return `<div class="rankup"><div class="ru-inner" style="max-width:480px">
    <div class="ru-eyebrow">你成了这样的人</div>
    <div class="ru-tier" style="font-size:30px;margin:6px 0 10px">${t.n}</div>
    <div class="ru-txt">${t.d}</div>
    <div class="ver" style="margin-top:14px;text-align:center">${t.txt}</div>
    <p class="note" style="text-align:center;margin-top:12px">
      这是这些年你一次次选出来的。<b>它不会消失。</b></p>
    <div class="row" style="justify-content:center">
      <button class="btn" id="traitok">知道了</button>
    </div>
  </div></div>`;
}
/* 属性卡上的一条：已经成为什么样的人，以及正在变成谁 */
function traitBar(){
  const has=traitList(), pg=traitProgress();
  if(!has.length && !pg.length) return "";
  return `<div class="traits">
    ${has.map(t=>`<span class="trait on" title="${t.d}　${t.txt}">${t.n}</span>`).join("")}
    ${pg.slice(0,2).map(p=>`<span class="trait" title="再选 ${p.need-p.p} 次「${p.axis}」的选项，你就是这样的人了">
      ${p.n} <i>${p.p}/${p.need}</i></span>`).join("")}
  </div>`;
}
