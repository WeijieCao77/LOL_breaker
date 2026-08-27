# -*- coding: utf-8 -*-
"""撞到瓶颈不该是死路。每一维都给出明确的突破条件，
   其中三条是纯机械的——只要你肯这么练就一定能拿到，不看运气。"""
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


# ---------- 突破条件表 ----------
rep("/* 每个赛段检查一次「环境带来的成长」 */",
"""/* ---------- 突破路径 ----------
   每一维都有明确的破法。前三条是机械的：肯这么练就一定拿得到。
   后两条要靠经历——但也写在明面上，不藏着。 */
const BREAK_PATHS={
  操作:{ how:"连续 2 周把至少 3 个行动点全投在操作上",
        auto:true, gain:2.0,
        prog:()=>`${clamp(S.btk&&S.btk.opStreak||0,0,2)}/2 周`,
        done:()=>(S.btk&&S.btk.opStreak||0)>=2 },
  运营:{ how:"一个赛段里做满 4 次战术复盘",
        auto:true, gain:2.0,
        prog:()=>`${clamp(S.btk&&S.btk.vod||0,0,4)}/4 次`,
        done:()=>(S.btk&&S.btk.vod||0)>=4 },
  体质:{ how:"一个赛段里休息满 4 次，并且这个赛段一场不缺",
        auto:true, gain:1.6,
        prog:()=>`${clamp(S.btk&&S.btk.rest||0,0,4)}/4 次`,
        done:()=>(S.btk&&S.btk.rest||0)>=4 },
  心态:{ how:"在落后的局面里赢下 3 场，或者拿一次冠军",
        auto:false, gain:0,
        prog:()=>`翻盘 ${clamp(S.comebacks||0,0,3)}/3`,
        done:()=>false },
  指挥:{ how:"和 27 岁以上的老将同队、待在强队，或者打进国际赛",
        auto:false, gain:0,
        prog:()=>{ const v=myRoster&&S.team?myRoster().find(x=>!x.me&&x.age>=27):null;
                   return v?`队里有 ${v.id}`:"队里没有老将"; },
        done:()=>false }
};
/* 机械条件的计数器 */
function initBtk(){ S.btk={opStreak:0,opThisWeek:0,vod:0,rest:0}; }
function btkNote(d,n){ S.btk=S.btk||{opStreak:0,opThisWeek:0,vod:0,rest:0};
  if(d==="op") S.btk.opThisWeek+=n;
  else S.btk[d]=(S.btk[d]||0)+n; }
/* 每周结算：操作的连续周数要在周末判定 */
function btkWeekEnd(){
  S.btk=S.btk||{opStreak:0,opThisWeek:0,vod:0,rest:0};
  if(S.btk.opThisWeek>=3) S.btk.opStreak++;
  else S.btk.opStreak=0;
  S.btk.opThisWeek=0;
  const P=BREAK_PATHS.操作;
  if(P.done()){ breakthrough("操作",P.gain,"连着两周只练操作，手感磨出来了。");
    S.btk.opStreak=0; }
}
/* 每赛段结算：运营与体质 */
function btkSplitEnd(){
  S.btk=S.btk||{opStreak:0,opThisWeek:0,vod:0,rest:0};
  if(BREAK_PATHS.运营.done()) breakthrough("运营",BREAK_PATHS.运营.gain,"整个赛段泡在录像里，你看比赛的方式变了。");
  if(BREAK_PATHS.体质.done()&&S.record.w+S.record.l>=WEEKS)
    breakthrough("体质",BREAK_PATHS.体质.gain,"这个赛段你把作息守住了，身体给了回报。");
  S.btk.vod=0; S.btk.rest=0;
}

/* 每个赛段检查一次「环境带来的成长」 */""")

# ---------- 计数接入 ----------
rep("""function doTrain(d){
  if(S.ap<=0||S.attrs[d]>=capOf(d))return;""",
    """function doTrain(d){
  if(S.ap<=0||S.attrs[d]>=capOf(d))return;
  if(d==="操作"&&typeof btkNote==="function") btkNote("op",1);""")
rep("""  else{addFat(((S.buff&&S.buff.physio)?-42:-30)*((S.bg&&S.bg.rest)||1));""",
    """  else{ if(typeof btkNote==="function") btkNote("rest",1);
    addFat(((S.buff&&S.buff.physio)?-42:-30)*((S.bg&&S.bg.rest)||1));""")
rep("  initTrust(); initSquad(); initCapBonus();",
    "  initTrust(); initSquad(); initCapBonus(); initBtk();")
rep("""  S.week++; S.ap=AP; S.step="season"; S.match=null; addFat(-10);""",
    """  S.week++; S.ap=AP; S.step="season"; S.match=null; addFat(-10);
  if(typeof btkWeekEnd==="function") btkWeekEnd();""")
rep("  trustDecay(); squadDecay(); checkBreakthrough();",
    "  trustDecay(); squadDecay(); checkBreakthrough();\n"
    "  if(typeof btkSplitEnd==='function') btkSplitEnd();")

# ---------- 属性卡：撞瓶颈就显示破法 ----------
rep("""    ${typeof buffChips==="function"?buffChips():""}""",
    """    ${(()=>{
      const hit=DIMS.filter(d=>S.attrs[d]>=capOf(d)-0.05);
      if(!hit.length||typeof BREAK_PATHS==="undefined") return "";
      return `<div class="breaks"><div class="bh">已经撞到瓶颈的维度 · 怎么破</div>${
        hit.map(d=>{const P=BREAK_PATHS[d];
          const full=((S.capBonus&&S.capBonus[d])||0)>=CAP_MAX_BONUS;
          return `<div class="brk ${full?'maxed':P.auto?'auto':'situ'}">
            <span class="bd">${d}</span>
            <span class="bw">${full?"这一维已经推到极限了，天赋决定的终点就在这里。":P.how}</span>
            <span class="bp mono">${full?"MAX":P.prog()}</span></div>`}).join("")}
        <div class="bn">带 <b>·</b> 的是机械条件——肯这么练就一定拿得到，不看运气。</div></div>`;
    })()}
    ${typeof buffChips==="function"?buffChips():""}""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch13 ok")
