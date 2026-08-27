# -*- coding: utf-8 -*-
"""排位改成真有输赢：实力决定你能卡在哪一档。
   实力远低于门槛 -> 怎么打都上不去；实力刚好卡线 -> 有涨有掉。
   另外把能力值放回主界面——不然训练完看不见效果。"""
import io, os

BASE = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(BASE, "career_template.html")
s = io.open(p, encoding="utf-8").read()
orig = s
MISS = []


def rep(a, b, must=True):
    global s
    if a not in s:
        if must:
            MISS.append(a[:110].replace("\n", " / "))
        return
    s = s.replace(a, b, 1)


# ---------- 排位模型 ----------
rep("""function rankGain(){
  const skill=S.attrs.操作*0.5+S.attrs.运营*0.3+S.attrs.心态*0.2;
  const wall=Math.pow(1-clamp(S.pre.rank/106,0,0.94),1.7);   // 越高越难爬，高分段明显吃力
  return clamp((skill-36)*0.15*wall+0.6,0.25,6);
}""",
"""/* 排位实力：单排能不能赢，主要看操作和运营，心态决定逆风局。 */
function soloSkill(){
  return S.attrs.操作*0.50+S.attrs.运营*0.30+S.attrs.心态*0.20
       + (typeof gearBonus==="function"?(gearBonus("操作")*0.5+gearBonus("运营")*0.3):0);
}
/* 当前分数位置对应的实力门槛——从黄金的 33 到国服前十的 96 */
function rankReq(v){ return 33+clamp(v,0,100)*0.63; }
/* 打一把的胜率：实力压过门槛就赢多输少，差得远就基本打不动 */
function soloWinP(){
  const d=soloSkill()-rankReq(S.pre.rank);
  return clamp(1/(1+Math.exp(-d/5.2)),0.06,0.94);
}
/* 一次「打排位」= 3 把，赢了涨输了掉 */
function rankStep(){ return clamp(2.6-S.pre.rank*0.012,1.1,2.6); }""")

# ---------- 打排位：有输有赢 ----------
rep("""  if(k==="rank"){
    const g=rankGain(), beforeT=rankName(P.rank), beforeF=rankFull(P.rank);
    P.rank=clamp(P.rank+g,0,100); addFat(8);
    const afterT=rankName(P.rank), afterF=rankFull(P.rank);
    addFame(g*0.42);     // 冲分本身就会带来关注""",
"""  if(k==="rank"){
    const beforeT=rankName(P.rank), beforeF=rankFull(P.rank);
    const p=soloWinP(), step=rankStep();
    let w=0,l=0;
    for(let i=0;i<3;i++){
      if(rnd()<p){ w++; P.rank=clamp(P.rank+step,0,100); }
      else { l++; P.rank=clamp(P.rank-step*0.82,0,100); }
    }
    addFat(8);
    const afterT=rankName(P.rank), afterF=rankFull(P.rank);
    addFame(w*0.5);      // 赢下来的分才带来关注
    P.lastQ={w,l,p};""")

rep("""    if(afterT!==beforeT){
      preLog(`排位打上 <b>${afterF}</b>。`,"good");
      S.rankUp={from:beforeT,to:afterT,v:P.rank};      // 触发晋级弹窗
    }
    else if(afterF!==beforeF) preLog(`排位 ${beforeF} → <b>${afterF}</b>。`,"info");""",
"""    const up=RANKS.findIndex(r=>r.n===afterT)>RANKS.findIndex(r=>r.n===beforeT);
    if(afterT!==beforeT&&up){
      preLog(`${w} 胜 ${l} 负，<b>打上 ${afterF}</b>。`,"good");
      S.rankUp={from:beforeT,to:afterT,v:P.rank};      // 触发晋级弹窗
    } else if(afterT!==beforeT){
      preLog(`${w} 胜 ${l} 负，<b>掉回 ${afterF}</b>。`,"bad");
    } else if(afterF!==beforeF){
      preLog(`${w} 胜 ${l} 负，${beforeF} → <b>${afterF}</b>。`,w>l?"good":w<l?"bad":"info");
    } else {
      preLog(`${w} 胜 ${l} 负，还在 ${afterF} 原地踏步。`,"info");
    }""")

# ---------- 本周面板：显示排位实力与门槛 ----------
rep("""      <button class="act" data-pre="rank" ${P.ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">打排位</div><div class="d">冲分，让人看见你</div></button>""",
"""      <button class="act" data-pre="rank" ${P.ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">打排位</div><div class="d">${(()=>{const p=soloWinP();
          return p>=0.66?"这个分段你打得动":p>=0.5?"五五开，能上但不稳":
                 p>=0.34?"打得挺吃力，容易掉":"实力不够，硬打只会掉分"})()}</div></button>""")

# 段位那行补上「你的排位实力 vs 门槛」
rep("""      ${rankBadge(P.rank,40)}${nextR?`　→　下一档 ${nextR.n}`:`　→　已经到顶`}<br>""",
"""      ${rankBadge(P.rank,40)}${nextR?`　→　下一档 ${nextR.n}`:`　→　已经到顶`}<br>
      排位实力 <b>${soloSkill().toFixed(0)}</b>　·　当前分段门槛 <b>${rankReq(P.rank).toFixed(0)}</b>${
        nextR?`　·　${nextR.n}门槛 <b>${rankReq(nextR.at).toFixed(0)}</b>`:""}<br>
      <span style="color:${soloWinP()>=0.5?'var(--cyan)':'var(--red)'}">${
        soloSkill()>=rankReq(P.rank)+6?"这个分段对你没什么难度，往上冲。":
        soloSkill()>=rankReq(P.rank)-2?"卡在门槛附近，有涨有掉——再练一点就稳了。":
        "实力还撑不住这个分段，硬打会掉分。先去练。"}</span><br>""")

# ---------- 能力值放回本周面板 ----------
rep("""  ${T==="sched"?scheduleCard():""}""",
    """  ${T==="act"?attrCard():""}
  ${T==="sched"?scheduleCard():""}""")
rep("""  ${T==="act"?nextMatchCard():""}""",
    """  ${T==="act"?nextMatchCard()+attrCard():""}""")
# 商城 tab 里就别重复放属性卡了
rep('${T==="shop"?attrCard()+gearCard()+shopCard():""}',
    '${T==="shop"?gearCard()+shopCard():""}')

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch7 ok")
