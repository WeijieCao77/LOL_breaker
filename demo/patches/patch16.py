# -*- coding: utf-8 -*-
"""接入「状态」：能力决定天花板，状态决定今年打成什么样。"""
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


rep("/* __RANDOM_MODULE__ */", "/* __RANDOM_MODULE__ */\n\n/* __FORM_MODULE__ */")

# ---------- 状态进 base ----------
rep("""function squadBase(players){
  let s=0,wt=0;
  players.forEach(p=>{
    const r=p.r||p;
    const w=p.me?(S.offerKind==="core"?1.75:1.42):1.0;
    s+=(r.操作*0.34+r.运营*0.28+r.心态*0.14+r.体质*0.10)*w;
    wt+=w;
  });
  return s/wt;
}""", "", must=False)  # squadBase 在 squad.js，这里不改

# cloneWorld 带上 form
rep("""      syn:t.syn===undefined?50:t.syn,     // 从真实战绩反推，见 export_game.py""",
    """      syn:t.syn===undefined?50:t.syn,     // 从真实战绩反推，见 export_game.py""")
rep("""      players:t.players.map(p=>({
        id:p.id,cn:p.cn,pos:p.pos,age:p.age||22,""",
    """      players:t.players.map(p=>({
        id:p.id,cn:p.cn,pos:p.pos,age:p.age||22,
        form:(p.form===undefined||p.form===null)?52:p.form,""")

# ---------- 玩家状态初始化与推进 ----------
rep("  initTrust(); initSquad(); initCapBonus(); initBtk();",
    "  initTrust(); initSquad(); initCapBonus(); initBtk();\n  S.form=52;")
rep("  trustDecay(); squadDecay(); checkBreakthrough();",
    "  trustDecay(); squadDecay(); checkBreakthrough();\n"
    "  if(typeof rollForm==='function') rollForm();\n"
    "  if(typeof rollWorldForm==='function'){ rollWorldForm(); formNews(); }")

# ---------- 状态卡挂到「我的」tab ----------
rep('${T==="me"?attrCard()+gearCard():""}',
    '${T==="me"?attrCard()+(typeof formCard==="function"?formCard():"")+gearCard():""}')
rep('  ${T==="me"?attrCard()+gearCard():""}',
    '  ${T==="me"?attrCard()+(typeof formCard==="function"?formCard():"")+gearCard():""}')

# ---------- HUD 显示状态 ----------
rep("""    <div><div class="k">资金</div><div class="v mono">${Math.round(S.money)}<small>万</small></div></div>
    <div><div class="k">体能</div>""",
    """    <div><div class="k">状态</div><div class="v" style="font-size:13px">${
      typeof formTier==="function"&&S.form!==undefined?formTier(myForm()).n:"—"}</div></div>
    <div><div class="k">资金</div><div class="v mono">${Math.round(S.money)}<small>万</small></div></div>
    <div><div class="k">体能</div>""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch16 ok")
