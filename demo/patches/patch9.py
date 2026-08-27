# -*- coding: utf-8 -*-
"""1. 晋级弹窗只在首次到达该段位时弹（现在会掉分，否则反复横跳会刷屏）
   2. 城市争霸赛 / 主播杯改成主动报名：要交报名费，赢了有奖金"""
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


# ---------- 1) 晋级弹窗只弹一次 ----------
rep("""    if(afterT!==beforeT&&up){
      preLog(`${w} 胜 ${l} 负，<b>打上 ${afterF}</b>。`,"good");
      S.rankUp={from:beforeT,to:afterT,v:P.rank};      // 触发晋级弹窗
    }""",
"""    if(afterT!==beforeT&&up){
      preLog(`${w} 胜 ${l} 负，<b>打上 ${afterF}</b>。`,"good");
      // 只有第一次摸到这个段位才弹窗——不然在门槛上来回跳会刷屏
      P.seenTier=P.seenTier||{};
      if(!P.seenTier[afterT]){ P.seenTier[afterT]=1; S.rankUp={from:beforeT,to:afterT,v:P.rank}; }
    }""")

# ---------- 2) 赛事改成主动报名 ----------
rep("""  {w:6, name:"城市争霸赛", tag:"赛事", open:true,""",
    """  {w:6, name:"城市争霸赛", tag:"赛事", open:true, signup:"city", fee:35, prize:[0,25,70,180,420],""")
rep("""  {w:12, name:"主播杯", tag:"赛事", open:true, vague:true,""",
    """  {w:12, name:"主播杯", tag:"赛事", open:true, vague:true, signup:"stream", fee:60, prize:[0,60,180,520],""")

# 到日子不再自动开打，而是弹一个报名窗
rep("""  const hit=PRE_MILESTONES.find(m=>m.w===P.week);
  if(hit){ hit.need()?hit.run():hit.fail(); }""",
"""  const hit=PRE_MILESTONES.find(m=>m.w===P.week);
  if(hit&&hit.signup){
    if(!hit.need()){ hit.fail(); }
    else { S.signup=hit; render(); return; }     // 交给玩家决定报不报
  } else if(hit){ hit.need()?hit.run():hit.fail(); }""")

# 报名弹窗
rep("function rankUpCard(){",
"""/* 赛事报名：要花钱，也可能白花。 */
function signupCard(){
  const m=S.signup; if(!m) return "";
  const afford=S.money>=m.fee;
  return `<div class="rankup"><div class="ru-inner" style="max-width:460px">
    <div class="ru-eyebrow">报名</div>
    <div class="ru-tier" style="font-size:22px"><b>${m.name}</b></div>
    <div class="ru-txt">${m.desc}<br><br>
      报名费 <b style="color:var(--gold)">${m.fee} 万</b>，你现在有 ${Math.round(S.money)} 万。<br>
      奖金按名次发，走得越远拿得越多；打得好还能涨名气。<br>
      <span style="color:var(--ink-3)">不报也可以——省下钱和体力，但这一年就没这个机会了。</span></div>
    <div class="row" style="justify-content:center">
      <button class="btn" id="signyes" ${afford?"":"disabled"}>${afford?"交钱，报名":"钱不够"}</button>
      <button class="btn ghost" id="signno">这次算了</button>
    </div></div></div>`;
}
function rankUpCard(){""")

# 报名 / 放弃
rep("  const ru=$(\"rankupok\"); if(ru) ru.onclick=()=>{S.rankUp=null;render()};",
"""  const ru=$("rankupok"); if(ru) ru.onclick=()=>{S.rankUp=null;render()};
  const sy=$("signyes"); if(sy) sy.onclick=()=>{
    const m=S.signup; S.signup=null;
    S.money-=m.fee; preLog(`交了 <b>${m.fee} 万</b>报名费，${m.name}走起。`,"info");
    m.run(); advancePreWeek();
  };
  const sn=$("signno"); if(sn) sn.onclick=()=>{
    const m=S.signup; S.signup=null;
    preLog(`没报 ${m.name}。省下的钱和体力，用在别处。`,"info");
    advancePreWeek();
  };""")

# 把「推进一周」抽出来，报名结束后接着走
rep("""  if(P.week>=PRE_YEAR){""",
"""  advancePreWeek(); return;
}
/* 报名弹窗处理完之后，继续把这一周走完 */
function advancePreWeek(){
  const P=S.pre;
  if(P.week>=PRE_YEAR){""")

# 弹窗挂到界面（优先级高于 tab）
rep("  ${S.rankUp?rankUpCard():''}", "  ${S.signup?signupCard():''}${S.rankUp?rankUpCard():''}")

# ---------- 赛事奖金 ----------
rep("""function runCityCup(){
  const r=amateurRun("城市争霸赛",4,S.attrs.操作*0.5+6);
  S.pre.cityCup=r.win;
  addFame(r.win*11);""",
"""function runCityCup(){
  const r=amateurRun("城市争霸赛",4,S.attrs.操作*0.5+6);
  S.pre.cityCup=r.win;
  addFame(r.win*13);
  const M=PRE_MILESTONES.find(x=>x.signup==="city");
  const prize=(M.prize||[])[r.win]||0;
  if(prize){ S.money+=prize; preLog(`奖金到账 <b>${prize} 万</b>。`,"good"); }""")
rep("""function runStreamCup(){
  const r=amateurRun("主播杯",3,S.attrs.操作*0.46+10);
  S.pre.streamCup=r.win;
  addFame(r.win*13);""",
"""function runStreamCup(){
  const r=amateurRun("主播杯",3,S.attrs.操作*0.46+10);
  S.pre.streamCup=r.win;
  addFame(r.win*17);
  const M=PRE_MILESTONES.find(x=>x.signup==="stream");
  const prize=(M.prize||[])[r.win]||0;
  if(prize){ S.money+=prize; preLog(`奖金到账 <b>${prize} 万</b>。`,"good"); }""")

# 预告板显示报名费与奖金
rep("""      <td class="n">${m.needTxt}</td>""",
    """      <td class="n">${m.needTxt}${m.fee?`<br><span style="color:var(--gold);font-size:11px">报名费 ${m.fee} 万</span>`:""}</td>""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch9 ok")
