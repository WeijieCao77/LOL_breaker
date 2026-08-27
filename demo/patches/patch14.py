# -*- coding: utf-8 -*-
"""1. 主界面常驻「现在是什么时候」——赛季 + 阶段 + 周
   2. 日志不再按半年切段，改成连续的一条时间线，每条都带阶段戳
      （S13 MSI / S14 夏季赛 W3 / 休赛期），玩家随时知道自己在哪。"""
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


# ---------- 统一的「现在」 ----------
rep("/* ---------- 事件系统 ---------- */",
"""/* ---------- 现在是什么时候 ----------
   一个地方定义，HUD、事件戳、日志都用它。
   玩家任何时候都该知道：哪个赛季、哪个阶段、还剩多久。 */
function nowPhase(){
  const sea=SEASONS[S.si]||SEASONS[0];
  if(S.step==="pre"||S.step==="offer")
    return {tag:sea.tag,phase:"职业前",detail:`第 ${S.pre?S.pre.week:1}/${PRE_YEAR} 周`,
            urgent:S.pre&&S.pre.week>PRE_YEAR-4};
  if(S.intl){
    const n=S.intl.type==="msi"?"MSI":"世界赛";
    const st=S.intl.stage==="playin"?"入围赛":S.intl.stage==="groups"?"小组赛":
             S.intl.stage==="swiss"?"瑞士轮":
             (S.intl.knockRound>=3?"决赛":S.intl.knockRound===2?"半决赛":"八强");
    return {tag:sea.tag,phase:n,detail:st,urgent:true};
  }
  if(S.playoff) return {tag:sea.tag,phase:SPLITS[S.split||0]+"季后赛",
                        detail:`第 ${S.playoff.round} 轮`,urgent:true};
  if(S.step==="offseason") return {tag:sea.tag,phase:"休赛期",detail:"转会与备战",urgent:false};
  if(S.step==="end") return {tag:sea.tag,phase:"生涯结束",detail:"",urgent:false};
  return {tag:sea.tag,phase:SPLITS[S.split||0],detail:`第 ${S.week}/${WEEKS} 周`,
          urgent:S.week>=WEEKS-1};
}
function nowLabel(){ const n=nowPhase(); return `${n.tag} ${n.phase}${n.detail?" "+n.detail:""}`; }
/* 事件戳：短一点，够定位就行 */
function nowStamp(){
  const n=nowPhase();
  if(n.phase==="职业前") return `${n.tag} 职前W${S.pre?S.pre.week:1}`;
  if(n.phase==="MSI"||n.phase==="世界赛") return `${n.tag} ${n.phase}`;
  if(n.phase==="休赛期") return `${n.tag} 休赛期`;
  if(n.phase.includes("季后赛")) return `${n.tag} ${n.phase}`;
  return `${n.tag} ${n.phase[0]}${S.week||1}`;
}

/* ---------- 事件系统 ---------- */""")

# ---------- 事件戳换成 nowStamp ----------
rep("""function pushEvent(text,tone,tag){
  S.events.push({s:SEASONS[S.si].tag,w:S.week,text,tone:tone||"info",tag:tag||"联赛"});""",
    """function pushEvent(text,tone,tag){
  S.events.push({s:(typeof nowStamp==="function")?nowStamp():SEASONS[S.si].tag,
                 w:S.week,text,tone:tone||"info",tag:tag||"联赛"});""")
rep("""<span class="tx">${e.text}<span class="tm">${e.s} W${e.w}</span></span>""",
    """<span class="tx">${e.text}<span class="tm">${e.s}</span></span>""")

# ---------- 职业前日志也进主时间线 ----------
rep("""function preLog(t,tone){ S.pre.log.push({t,tone:tone||"info",w:S.pre.week});""",
    """function preLog(t,tone){ S.pre.log.push({t,tone:tone||"info",w:S.pre.week,
    stamp:(typeof nowStamp==="function")?nowStamp():""});""")
rep("""      <span class="tg">W${l.w}</span><span class="tx">${l.t}</span></div>`).join("")}""",
    """      <span class="tg">${l.stamp||("W"+l.w)}</span><span class="tx">${l.t}</span></div>`).join("")}""")
# 职业前的日志标题不再写「这半年」
rep('<div class="card"><h2>这半年</h2>', '<div class="card"><h2>生涯日志<em>${nowLabel()}</em></h2>')

# ---------- HUD：把「现在」放在最显眼的位置 ----------
rep("""      <div><div class="k">阶段</div><div class="v">职业前 <small>${(SEASONS[S.si]||SEASONS[0]).tag} · 窗口剩 ${Math.max(0,PRE_YEAR-S.pre.week)} 周</small></div></div>""",
    """      <div class="hud-now ${nowPhase().urgent?'urgent':''}"><div class="k">现在</div>
        <div class="v">${nowPhase().tag} 职业前 <small>${nowPhase().detail} · 窗口剩 ${Math.max(0,PRE_YEAR-S.pre.week)} 周</small></div></div>""")
rep("""    <div><div class="k">赛季</div><div class="v">${sea.tag} <small>${SPLITS[S.split||0]}</small></div></div>""",
    """    <div class="hud-now ${nowPhase().urgent?'urgent':''}"><div class="k">现在</div>
      <div class="v">${nowPhase().tag} ${nowPhase().phase} <small>${nowPhase().detail}</small></div></div>""")

# ---------- 大事记标题带上当前时间 ----------
rep("""  return `<div class="card"><h2>大事记<em>${S.events.length} 条</em></h2>""",
    """  return `<div class="card"><h2>大事记<em>${nowLabel()} · 共 ${S.events.length} 条</em></h2>""")

# ---------- 跨年不再是「重新开始」，而是同一条线继续 ----------
rep("""  preLog(`— ${SEASONS[S.si].tag} ${SEASONS[S.si].y}，你 ${S.age} 岁了 —`,"hi");""",
    """  preLog(`<b>${SEASONS[S.si].tag} ${SEASONS[S.si].y} 赛季开始</b>，你 ${S.age} 岁了。
    上一年没能签约，这一年从头再来——但世界已经往前走了一年。`,"hi");""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch14 ok")
