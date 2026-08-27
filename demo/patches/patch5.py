# -*- coding: utf-8 -*-
"""行动点 3→5、战队维度接入、对手综合实力可见、实力差距门槛。"""
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


rep("/* __ACHIEVE_MODULE__ */", "/* __ACHIEVE_MODULE__ */\n\n/* __SQUAD_MODULE__ */")

# ---------- 行动点 3 -> 5 ----------
rep("const TOTAL_TALENT=20, WEEKS=5, AP=3, SPREAD=8.5;",
    "const TOTAL_TALENT=20, WEEKS=5, AP=5, SPREAD=8.5;")
rep("const PRE_YEAR=20, PRE_AP=3;", "const PRE_YEAR=20, PRE_AP=5;")
# 行动点变多，单次收益要压一压，否则成长速度翻倍
rep("  return 3.4*mult(t)*(0.25+0.75*room)*bonus*ageM*coach*ag*bg*cs;",
    "  return 2.5*mult(t)*(0.25+0.75*room)*bonus*ageM*coach*ag*bg*cs;")
rep("  return clamp((skill-36)*0.20*wall+0.8,0.3,8);",
    "  return clamp((skill-36)*0.15*wall+0.6,0.25,6);")

# ---------- 战队状态接入战力 ----------
rep("  const tm=(typeof trustMod===\"function\"&&S.trust)?trustMod():1;",
    "  const tm=(typeof trustMod===\"function\"&&S.trust)?trustMod():1;\n"
    "  const sq=(typeof squadMod===\"function\"&&players.some(x=>x.me))?squadMod():1;")
rep("  return (s/wt+dynastyBonus(players))*(1+(cmd-55)/520)*(1-clamp(fatigue,0,100)*0.0022)*tm;",
    "  return (s/wt+dynastyBonus(players))*(1+(cmd-55)/520)*(1-clamp(fatigue,0,100)*0.0022)*tm*sq;")

# 签约时初始化，赛段结束时衰减
rep("  initTrust();", "  initTrust(); initSquad();")
rep("  trustDecay();\n  const cut=contractCheck();",
    "  trustDecay(); squadDecay();\n  const cut=contractCheck();")

# ---------- 战队行动挂到本周面板 ----------
rep("""      <button class="act" data-do="rest" ${S.ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">休息</div><div class="d">清疲劳，护状态</div></button>
    </div>""",
    """      <button class="act" data-do="rest" ${S.ap<=0?'disabled style="opacity:.34"':''}>
        <div class="t">休息</div><div class="d">清疲劳，护状态</div></button>
    </div>
    ${squadActs()}""")

# ---------- 战队实力面板放进「队伍」tab ----------
# 两处（viewSeason 的提前返回 + 主体）都要换
_a='${T==="team"?teamCard()+rivalCard()+standingsCard():""}'
_b='${T==="team"?squadCard()+teamCard()+rivalCard()+standingsCard():""}'
if _a in s:
    s = s.replace(_a, _b)
else:
    MISS.append(_a[:60])

# ---------- 下一场：显示双方综合实力与差距判断 ----------
rep("""  const myPw=power(myRoster(),S.fatigue,sea.fav)+versionFit(), opPw=power(opp.players,0,sea.fav);
  const star=opp.players.slice().sort((a,b)=>ovrOf(b)-ovrOf(a))[0];
  const rival=opp.players.find(q=>q.pos===S.pos);
  const st=S.standings.LPL[on]||{w:0,l:0};
  const diff=myPw-opPw;""",
    """  const myPw=myPower(), opPw=teamPowerOf(on);
  const star=opp.players.slice().sort((a,b)=>ovrOf(b)-ovrOf(a))[0];
  const rival=opp.players.find(q=>q.pos===S.pos);
  const st=(S.standings[S.homeLeague||"LPL"]||{})[on]||{w:0,l:0};
  const diff=myPw-opPw;
  const V=gapVerdict(diff);""")

rep("""      <div class="sd"><div class="nm">${teamLogo(S.team,28)}${S.team}${formBar(S.team)}</div>
        <div class="pw">战力 ${myPw.toFixed(1)}</div></div>
      <div class="mid">VS</div>
      <div class="sd"><div class="nm">${teamLogo(on,28)}${on}${formBar(on)}</div>
        <div class="pw">战力 ${opPw.toFixed(1)}</div></div>""",
    """      <div class="sd"><div class="nm">${teamLogo(S.team,28)}${S.team}${formBar(S.team)}</div>
        <div class="pw">综合实力 <b>${myPw.toFixed(1)}</b></div></div>
      <div class="mid">VS</div>
      <div class="sd"><div class="nm">${teamLogo(on,28)}${on}${formBar(on)}</div>
        <div class="pw">综合实力 <b>${opPw.toFixed(1)}</b></div></div>""")

rep("""      <span class="chipx">${diff>3?'<b style="color:var(--win)">优势明显</b>':diff>-3?'<b>势均力敌</b>':'<b style="color:var(--loss)">硬仗</b>'}</span>
    </div></div>`;""",
    """    </div>
    <div class="gapbar ${V.k}">
      <div class="gv">${V.t}<span class="gd mono">${diff>=0?"+":""}${diff.toFixed(1)}</span></div>
      <div class="gt">${V.d}</div>
    </div></div>`;""")

# ---------- 胜率封顶 ----------
rep("""  const p=1/(1+Math.exp(-(my-op)/SPREAD));
  const win=rnd()<p;""",
    """  let p=1/(1+Math.exp(-(my-op)/SPREAD));
  p=clampWinProb(p, power(myRoster(),S.fatigue,sea.fav)+versionFit()-op);
  const win=rnd()<p;""")

# ---------- 绑定 ----------
rep('  st.querySelectorAll("[data-do]").forEach',
    '  st.querySelectorAll("[data-squad]").forEach(b=>b.onclick=()=>doSquad(b.dataset.squad));\n'
    '  st.querySelectorAll("[data-do]").forEach')

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch5 ok")
