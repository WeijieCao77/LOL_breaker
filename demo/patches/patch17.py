# -*- coding: utf-8 -*-
"""成就扩充到 55 条，并补齐它们需要的追踪变量与触发点。
   目标：核心路线 2 小时，打透要换 build/换出身/换 offer，凑到 3 小时。"""
import io, os

BASE = os.path.dirname(os.path.abspath(__file__))
MISS = []

# ---------- achieve.js：合并扩充条目 ----------
p = os.path.join(BASE, "achieve.js")
s = io.open(p, encoding="utf-8").read()
orig = s
if "ACH_MORE" not in s:
    s = s.replace("function checkAch(on,ctx){",
"""/* 扩充条目在 achieve_more.js，构建时拼进来 */
if(typeof ACH_MORE!=="undefined") ACHIEVEMENTS.push(...ACH_MORE);

function checkAch(on,ctx){""")
    # 解锁成就后再查一次「收尾」类
    s = s.replace("""    S.achLog=(S.achLog||[]).concat([{id:a.id,n:a.n,s:SEASONS[S.si]?SEASONS[S.si].tag:""}]);""",
"""    S.achLog=(S.achLog||[]).concat([{id:a.id,n:a.n,s:SEASONS[S.si]?SEASONS[S.si].tag:""}]);
    if(on!=="ach") setTimeout?0:0;   // 占位，避免递归
    if(on!=="ach") queueAchCheck=true;""")
    s = s.replace("function checkAch(on,ctx){\n  if(!S.ach) initAch();",
"""let queueAchCheck=false;
function checkAch(on,ctx){
  if(!S.ach) initAch();""")
    s += """

/* 解锁之后再查一遍「解锁 N 项」这类成就 */
const _origCheckAch=checkAch;
checkAch=function(on,ctx){
  _origCheckAch(on,ctx);
  if(queueAchCheck){ queueAchCheck=false; _origCheckAch("ach",{}); }
};
"""
    io.open(p, "w", encoding="utf-8").write(s)
else:
    MISS.append("achieve.js 已合并过")

# ---------- career_template.html：追踪变量与触发 ----------
p = os.path.join(BASE, "career_template.html")
s = io.open(p, encoding="utf-8").read()
orig = s


def rep(a, b):
    global s, MISS
    if a not in s:
        MISS.append(a[:90].replace("\n", " / "))
        return
    s = s.replace(a, b, 1)


# 初始化追踪字段
rep("  initStaff(); initRelations();",
    """  initStaff(); initRelations();
  S.winStreak=0; S.sweepStreak=0; S.lckBeaten=[]; S.retireSeen=0;
  S.benchedSplits=0; S.everCut=false; S.cameFromPlayin=false;
  S.career.msiYears=[]; S.career.worldsYears=[]; S.career.lgYears=[]; S.career.lgStreak=0;""")

# 连胜 / 横扫 / 击败 LCK / 遇到传奇
rep("""  // 你自己的大事
  const me=S.name||"你", star=m.opp.players.filter(q=>q.pos===S.pos)[0];""",
"""  // ---- 成就追踪 ----
  S.winStreak=won?(S.winStreak||0)+1:0;
  const swept=won&&m.sc[1]===0;
  S.sweepStreak=swept?(S.sweepStreak||0)+1:0;
  const metLegend=(m.opp.players||[]).some(q=>q.comeback);
  if(won&&S.intl&&typeof leagueOf==="function"&&leagueOf(m.oppName)==="LCK"){
    S.lckBeaten=S.lckBeaten||[];
    if(!S.lckBeaten.includes(m.oppName)) S.lckBeaten.push(m.oppName);
  }
  checkAch("match",{won,metLegend});
  if(won) checkAch("win",{won,metLegend});

  // 你自己的大事
  const me=S.name||"你", star=m.opp.players.filter(q=>q.pos===S.pos)[0];""")

# 联赛冠军：记年份与连霸
rep("""    checkAch("lgtitle");""",
    """    S.career.lgYears=(S.career.lgYears||[]).concat([S.si]);
    S.career.lgStreak=(S.career.lgStreak||0)+1;
    checkAch("lgtitle");""")
rep("""  S.playoff=null;
  if(S.split===0){""",
    """  if(result!=="champion") S.career.lgStreak=0;
  checkAch("splitend");
  checkAch("money");
  S.playoff=null;
  if(S.split===0){""")

# 替补赛段计数
rep("""function benchWeek(){""",
    """function benchWeek(){
  S.benchedThisSplit=true;""")
rep("  if(S.split===0) S.seasonAttr0=Object.assign({},S.attrs);",
    """  if(S.benchedThisSplit){ S.benchedSplits=(S.benchedSplits||0)+1; S.benchedThisSplit=false; }
  if(S.split===0) S.seasonAttr0=Object.assign({},S.attrs);""")

# 被裁标记
rep("    pushEvent(`<b>${old}</b> 没有和你续约。你最后签到了 <b>${S.team}</b>——从头再来。`,\"bad\",\"合同\");",
    "    S.everCut=true;\n"
    "    pushEvent(`<b>${old}</b> 没有和你续约。你最后签到了 <b>${S.team}</b>——从头再来。`,\"bad\",\"合同\");")

# 退役见证
rep("""          team.players[i]=nr;
          team.syn=clamp((team.syn===undefined?50:team.syn)-7,20,90);   // 换人要重新磨""",
    """          team.players[i]=nr;
          S.retireSeen=(S.retireSeen||0)+1; checkAch("retire");
          team.syn=clamp((team.syn===undefined?50:team.syn)-7,20,90);   // 换人要重新磨""")

# 训练 / 突破 / 课程 / 排位 触发
rep("  S.attrs[d]=Math.min(capOf(d),S.attrs[d]+gain(d));",
    "  S.attrs[d]=Math.min(capOf(d),S.attrs[d]+gain(d));\n  checkAch(\"train\");")
rep("""    "big","突破");""",
    """    "big","突破");
  checkAch("break"); if(key===undefined) checkAch("breakauto");""")
rep("""    P.lastQ={w,l,p};""", """    P.lastQ={w,l,p}; checkAch("rank");""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch17 ok")
