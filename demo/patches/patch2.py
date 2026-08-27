# -*- coding: utf-8 -*-
"""接入成就系统：在各关键节点埋 checkAch。"""
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


rep("/* __ORIGINS_MODULE__ */", "/* __ORIGINS_MODULE__ */\n\n/* __ACHIEVE_MODULE__ */")

# 初始化
rep("  initShop();\n  if(B.course) S.courses[B.course]=1;",
    "  initShop(); initAch();\n  if(B.course) S.courses[B.course]=1;")

# 签约
rep('  pushEvent(`<b>${S.name||"你"}</b> 正式签约 <b>${of.team}</b>（${of.t}）。职业生涯从这里开始。`,"big","签约");',
    '  pushEvent(`<b>${S.name||"你"}</b> 正式签约 <b>${of.team}</b>（${of.t}）。职业生涯从这里开始。`,"big","签约");\n'
    '  checkAch("sign");')

# 转正
rep('    pushEvent(`训练赛数据压过 <b>${inc.id}</b>，教练组决定让你首发。<b>你终于上场了。</b>`,"big","转正");',
    '    pushEvent(`训练赛数据压过 <b>${inc.id}</b>，教练组决定让你首发。<b>你终于上场了。</b>`,"big","转正");\n'
    '    checkAch("promote");')

# 排位 / 训练 / 直播 / 装备 / 课程
rep('    if(P.rank>=95&&!P.top10){P.top10=true;',
    '    checkAch("rank");\n    if(P.rank>=95&&!P.top10){P.top10=true;')
rep("  S.attrs[d]=Math.min(cap(S.talent[d]),S.attrs[d]+gain(d));\n  addFat(9); S.ap--; render();",
    "  S.attrs[d]=Math.min(cap(S.talent[d]),S.attrs[d]+gain(d));\n  addFat(9); S.ap--; checkAch(\"train\"); render();")

# 比赛结束：组装 ctx
rep("  simWorld(); m.done=true;\n  if(!won) tryLockerEvent();\n  render();",
    """  // 成就上下文
  const ctx={won, bo5:m.need>=3, myScore:m.sc[0], oppScore:m.sc[1],
    gap:+(myPw-opPw).toFixed(2), intl:!!S.intl,
    oppLeague:(typeof leagueOf==="function")?leagueOf(m.oppName):"LPL",
    laneWon:!!(star&&avg(DIMS.map(d=>S.attrs[d]))>=ovrOf(star)),
    nodeFails:m.nodeFails||0,
    lostFirstTwo:m.need>=3&&m.firstTwoLost};
  checkAch("match",ctx);
  if(won) checkAch("win",ctx);
  if(won&&ctx.intl&&ctx.oppLeague==="LCK") checkAch("beatlck",ctx);
  simWorld(); m.done=true;
  if(!won) tryLockerEvent();
  render();""")

# 记录节点失败次数 & 前两局是否丢掉
rep("""  m.swing+=(ok?1:-1)*opt.risk*6.0;""",
    """  m.swing+=(ok?1:-1)*opt.risk*6.0;
  if(!ok) m.nodeFails=(m.nodeFails||0)+1;""")
rep("""  m.game++; m.swing*=0.4; nextGame();""",
    """  if(m.game===2&&m.sc[1]===2) m.firstTwoLost=true;
  m.game++; m.swing*=0.4; nextGame();""")

# 逆风翻盘计数
rep('  S.attrs.心态=Math.min(cap(S.talent.心态),S.attrs.心态+(won?0.5:1.1));',
    '  S.attrs.心态=Math.min(cap(S.talent.心态),S.attrs.心态+(won?0.5:1.1));\n'
    '  if(won&&myPw-opPw<-2) S.comebacks=(S.comebacks||0)+1;')

# 季后赛 / 联赛冠军 / 国际赛
rep("  S.playoffSeed=seed;\n  S.playoff={round:1,seed,alive:true,beaten:[S.team]};",
    "  S.playoffSeed=seed;\n  checkAch(\"playoff\");\n  S.playoff={round:1,seed,alive:true,beaten:[S.team]};")
rep('    S.career.leagueTitles=(S.career.leagueTitles||0)+1;',
    '    S.career.leagueTitles=(S.career.leagueTitles||0)+1;\n    checkAch("lgtitle");')

# 直播成就
rep("    S.fame+=pop*m; S.money+=gift; addFat(4); P.scout+=0.5*m;",
    "    S.fame+=pop*m; S.money+=gift; addFat(4); P.scout+=0.5*m; checkAch(\"stream\");")

# 成就面板挂到赛季页与职业前
rep("  ${gearCard()}\n  ${shopCard()}\n  ${eventsCard()}",
    "  ${gearCard()}\n  ${shopCard()}\n  ${achCard()}\n  ${eventsCard()}")

# 结局页也展示成就
rep("""  <div class="card"><h2>五年后的世界</h2>""",
    """  ${achCard()}
  <div class="card"><h2>五年后的世界</h2>""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch2 ok")
