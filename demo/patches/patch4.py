# -*- coding: utf-8 -*-
"""把堆在一页的卡片拆成 tab。弹窗（更衣室 / 段位晋级）不受 tab 影响。"""
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
            MISS.append(a[:100].replace("\n", " / "))
        return
    s = s.replace(a, b, 1)


# ---------- tab 基础设施 ----------
rep("function viewPre(){", """/* ---------- 分栏 ---------- */
const TABS_PRE=[
  {k:"act",  n:"本周"},
  {k:"sched",n:"赛程"},
  {k:"shop", n:"商城"},
  {k:"ach",  n:"成就"},
  {k:"log",  n:"日志"}
];
const TABS_SEASON=[
  {k:"act",  n:"本周"},
  {k:"me",   n:"我的"},
  {k:"team", n:"队伍"},
  {k:"shop", n:"商城"},
  {k:"news", n:"动态"},
  {k:"ach",  n:"成就"}
];
function tabBar(list){
  const cur=curTab(list);
  return `<div class="tabs">${list.map(t=>
    `<button class="tab ${t.k===cur?'on':''}" data-tab="${t.k}">${t.n}${
      t.k==="ach"?`<span class="tcount">${ACHIEVEMENTS.filter(a=>hasAch(a.id)).length}</span>`:""}</button>`
  ).join("")}</div>`;
}
function curTab(list){
  const has=list.some(t=>t.k===S.tab);
  return has?S.tab:list[0].k;
}

function viewPre(){""")

# ---------- 职业前分栏 ----------
rep("""  ${S.rankUp?rankUpCard():''}
  ${scheduleCard()}
  ${attrCard()}
  ${gearCard()}
  ${shopCard()}
  <div class="card"><h2>这半年</h2>""",
    """  ${S.rankUp?rankUpCard():''}
  ${tabBar(TABS_PRE)}
  ${T==="sched"?scheduleCard():""}
  ${T==="shop"?attrCard()+gearCard()+shopCard():""}
  ${T==="ach"?achCard():""}
  ${T!=="log"?"":`<div class="card"><h2>这半年</h2>""")

rep("""    <div class="feed">${P.log.slice(-24).reverse().map(l=>`<div class="ev ${l.tone}">
      <span class="tg">W${l.w}</span><span class="tx">${l.t}</span></div>`).join("")}</div></div>`;
}""",
    """    <div class="feed">${P.log.slice(-40).reverse().map(l=>`<div class="ev ${l.tone}">
      <span class="tg">W${l.w}</span><span class="tx">${l.t}</span></div>`).join("")}</div></div>`}
  ${T==="act"?actPanelPre():""}`;
}""")

# 把「本周」面板抽成函数
rep("""function viewPre(){
  const P=S.pre, pct=clamp(P.rank,0,100);
  const nextR=RANKS.find(r=>r.at>P.rank);
  return `
  <div class="card">""",
    """function actPanelPre(){
  const P=S.pre;
  const nextR=RANKS.find(r=>r.at>P.rank);
  return `
  <div class="card">""")

rep("""    <div class="row"><button class="btn" id="prenext" ${P.ap>0?'disabled':''}>
      ${P.ap>0?`还剩 ${P.ap} 个行动点`:`进入第 ${P.week+1} 周 →`}</button></div>
  </div>""",
    """    <div class="row"><button class="btn" id="prenext" ${P.ap>0?'disabled':''}>
      ${P.ap>0?`还剩 ${P.ap} 个行动点`:`进入第 ${P.week+1} 周 →`}</button></div>
  </div>`;
}
function viewPre(){
  const P=S.pre, T=curTab(TABS_PRE);
  return `""")

# ---------- 赛季分栏 ----------
rep("""  ${S.locker?lockerCard():""}
  ${nextMatchCard()}
  ${attrCard()}
  ${teamCard()}
  ${rivalCard()}
  ${gearCard()}
  ${shopCard()}
  ${achCard()}
  ${eventsCard()}
  <div class="two">${standingsCard()}${newsCard()}</div>`;""",
    """  ${S.locker?lockerCard():""}
  ${tabBar(TABS_SEASON)}
  ${T==="act"?nextMatchCard():""}
  ${T==="me"?attrCard()+gearCard():""}
  ${T==="team"?teamCard()+rivalCard()+standingsCard():""}
  ${T==="shop"?shopCard():""}
  ${T==="news"?eventsCard()+newsCard():""}
  ${T==="ach"?achCard():""}`;""")

rep("""function viewSeason(){
  const sea=SEASONS[S.si];""",
    """function viewSeason(){
  const sea=SEASONS[S.si], T=curTab(TABS_SEASON);
  if(T!=="act") return `${S.locker?lockerCard():""}
    ${tabBar(TABS_SEASON)}
    ${T==="me"?attrCard()+gearCard():""}
    ${T==="team"?teamCard()+rivalCard()+standingsCard():""}
    ${T==="shop"?shopCard():""}
    ${T==="news"?eventsCard()+newsCard():""}
    ${T==="ach"?achCard():""}`;""")

# 绑定
rep('  st.querySelectorAll("[data-locker]").forEach',
    """  st.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;render()});
  st.querySelectorAll("[data-locker]").forEach""")

# 阶段切换时回到「本周」
rep('  S.week=1; S.ap=AP; S.record={w:0,l:0}; S.step="season";',
    '  S.week=1; S.ap=AP; S.record={w:0,l:0}; S.step="season"; S.tab="act";')

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch4 ok")
