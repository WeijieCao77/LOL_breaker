# -*- coding: utf-8 -*-
"""接入随机事件与临时增益。"""
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


rep("/* __SQUAD_MODULE__ */", "/* __SQUAD_MODULE__ */\n\n/* __RANDOM_MODULE__ */")

# ---------- 临时增益接入训练与排位 ----------
rep("  const coach=(S.buff&&S.buff.coach)?1.22:1;",
    "  const coach=(S.buff&&S.buff.coach)?1.22:1;\n"
    "  const tb=(typeof buffVal==='function')?buffVal('train')*buffVal('mood'):1;")
rep("  return 1.30*mult(t)*(0.20+0.80*room)*bonus*ageM*coach*ag*bg*cs;",
    "  return 1.30*mult(t)*(0.20+0.80*room)*bonus*ageM*coach*ag*bg*cs*tb;")
# 心情也轻微影响排位
rep("""function soloWinP(){
  const d=soloSkill()-rankReq(S.pre.rank);""",
    """function soloWinP(){
  const md=(typeof buffVal==="function")?(buffVal("mood")-1)*8:0;
  const d=soloSkill()-rankReq(S.pre.rank)+md;""")

# ---------- 每周推进时走一次事件与增益计时 ----------
rep("  P.week++; P.ap=PRE_AP; addFat(-9);\n  simWorldPre();",
    "  P.week++; P.ap=PRE_AP; addFat(-9);\n  if(typeof tickBuffs==='function') tickBuffs();\n"
    "  simWorldPre();\n  if(typeof tryRandomEvent==='function'&&rnd()<0.30) tryRandomEvent();")
rep("  S.week++; S.ap=AP; S.step=\"season\"; S.match=null; addFat(-10); render();",
    "  S.week++; S.ap=AP; S.step=\"season\"; S.match=null; addFat(-10);\n"
    "  if(typeof tickBuffs==='function') tickBuffs();\n"
    "  if(typeof tryRandomEvent==='function'&&rnd()<0.28) tryRandomEvent();\n  render();")

# ---------- 弹窗与增益条 ----------
rep("  ${S.signup?signupCard():''}${S.rankUp?rankUpCard():''}",
    "  ${S.signup?signupCard():''}${S.rankUp?rankUpCard():''}${S.rndEv?randomCard():''}")
rep("  ${S.locker?lockerCard():\"\"}\n  ${tabBar(TABS_SEASON)}",
    "  ${S.locker?lockerCard():\"\"}${S.rndEv?randomCard():\"\"}\n  ${tabBar(TABS_SEASON)}")
rep("""  if(T!=="act") return `${S.locker?lockerCard():""}""",
    """  if(T!=="act") return `${S.locker?lockerCard():""}${S.rndEv?randomCard():""}""")
# 增益条挂在属性卡下面
rep("""    <p class="note">竖线是当前瓶颈""",
    """    ${typeof buffChips==="function"?buffChips():""}
    <p class="note">竖线是当前瓶颈""")

# ---------- 绑定 ----------
rep('  st.querySelectorAll("[data-locker]").forEach',
    '  st.querySelectorAll("[data-rnd]").forEach(b=>b.onclick=()=>resolveRandom(+b.dataset.rnd));\n'
    '  st.querySelectorAll("[data-locker]").forEach')

# 有弹窗时不能直接推进
rep('  const pn=$("prenext"); if(pn) pn.onclick=preNextWeek;',
    '  const pn=$("prenext"); if(pn&&!S.rndEv) pn.onclick=preNextWeek;')

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch12 ok")
