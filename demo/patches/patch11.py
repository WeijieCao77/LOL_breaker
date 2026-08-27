# -*- coding: utf-8 -*-
"""1. HUD 常驻显示资金
   2. 没队伍的时候，战队相关界面也要能看见——只是锁着，
      鼠标放上去说清楚要怎么解锁。看得见的目标才是目标。"""
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


# ---------- HUD 加资金 ----------
rep("""      <div><div class="k">体能</div><div class="v mono">${100-Math.round(S.fatigue)}<small>/100</small></div></div>`;
    return;""",
    """      <div><div class="k">资金</div><div class="v mono">${Math.round(S.money)}<small>万</small></div></div>
      <div><div class="k">体能</div><div class="v mono">${100-Math.round(S.fatigue)}<small>/100</small></div></div>`;
    return;""")
rep("""    <div><div class="k">体能</div><div class="v mono">${100-Math.round(S.fatigue)}<small>/100</small></div></div>`;""",
    """    <div><div class="k">资金</div><div class="v mono">${Math.round(S.money)}<small>万</small></div></div>
    <div><div class="k">体能</div><div class="v mono">${100-Math.round(S.fatigue)}<small>/100</small></div></div>`;""")

# ---------- 锁定态的通用写法 ----------
rep("function proCard(){",
"""/* 锁着的功能也要摆出来——看得见的目标才是目标 */
function lockedAct(name,desc,how){
  return `<button class="act locked" disabled title="${how}">
    <div class="t">🔒 ${name}</div><div class="d">${desc}</div>
    <div class="lockhint">${how}</div></button>`;
}
function lockedCard(title,how,body){
  return `<div class="card locked-card"><h2>${title}<em>未解锁</em></h2>
    <div class="lockbody">${body}</div>
    <p class="note lockhow">🔒 ${how}</p></div>`;
}
function proCard(){""")

# ---------- 职业前也显示战队行动（锁定） ----------
rep("""      <button class="act" data-pre="rest" ${P.ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">休息</div><div class="d">清疲劳</div></button>
    </div>""",
    """      <button class="act" data-pre="rest" ${P.ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">休息</div><div class="d">清疲劳</div></button>
    </div>
    <h3 style="font-size:13px;color:var(--ink-3);margin:16px 0 8px">战队<span class="tag">未解锁</span></h3>
    <div class="grid g5">
      ${lockedAct("训练赛","和别的队打，最接近实战","签约职业战队后解锁")}
      ${lockedAct("战术复盘","逐帧过录像，把问题挖出来","签约职业战队后解锁")}
      ${lockedAct("战队合练","专项练配合，团战执行会顺很多","签约职业战队后解锁")}
      ${lockedAct("队友双排","排位里带一带，练默契也拉近关系","签约职业战队后解锁")}
    </div>""")

# ---------- 职业前的 tab 里加「战队」（锁定） ----------
rep("""const TABS_PRE=[
  {k:"act",  n:"本周"},
  {k:"sched",n:"赛程"},
  {k:"pro",  n:"联赛"},""",
    """const TABS_PRE=[
  {k:"act",  n:"本周"},
  {k:"sched",n:"赛程"},
  {k:"squad",n:"战队"},
  {k:"pro",  n:"联赛"},""")

rep("""  ${T==="pro"?proCard()+eventsCard():""}""",
    """  ${T==="squad"?lockedCard("战队实力","签约职业战队后解锁。在那之前，你只有自己。",
      `<p>加入战队后，这里会显示：</p>
       <div class="attrs" style="opacity:.4;pointer-events:none">
         <div class="at"><div class="lb">base</div><div class="track"><div class="fill" style="width:52%"></div></div><div class="vn mono">五人个人数值</div></div>
         <div class="at"><div class="lb">默契</div><div class="track"><div class="fill" style="width:44%"></div></div><div class="vn mono">配合得怎么样</div></div>
         <div class="at"><div class="lb">战术</div><div class="track"><div class="fill" style="width:46%"></div></div><div class="vn mono">准备得充不充分</div></div>
         <div class="at"><div class="lb">士气</div><div class="track"><div class="fill" style="width:50%"></div></div><div class="vn mono">更衣室气氛</div></div>
       </div>
       <p class="note" style="margin-top:14px">综合实力 = base × 默契 × 战术 × 士气 × 指挥 × 体能。<br>
         你的个人数值只是 base 的一部分——五个人怎么变成一支队，是另一半。</p>`)
    +lockedCard("队友","签约职业战队后解锁。",
      `<p class="note" style="margin:0">每个队友对你有独立的信任度，会因为你的选择涨落，也会影响全队发挥。</p>`):""}
  ${T==="pro"?proCard()+eventsCard():""}""")

# ---------- 商城 tab 在没队伍时也提示哪些是锁的 ----------
rep("""  ${T==="shop"?gearCard()+shopCard():""}""",
    """  ${T==="shop"?gearCard()+shopCard()
      +lockedCard("俱乐部资源","签约职业战队后解锁。",
        `<p class="note" style="margin:0">私教、理疗师、团队建设、舆论公关——
          进队之后才用得上，也才付得起。</p>`):""}""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch11 ok")
