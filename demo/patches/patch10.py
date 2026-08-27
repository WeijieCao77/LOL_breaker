# -*- coding: utf-8 -*-
"""综合实力改成 base × 权重，并让每支 NPC 战队用它自己的默契/战术
   （这两个值是从 2022 真实战绩反推出来的）。"""
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


# ---------- cloneWorld 带上战队自己的默契/战术 ----------
rep("""    w[lg]=DATA.leagues[lg].map(t=>({
      name:t.name,""",
    """    w[lg]=DATA.leagues[lg].map(t=>({
      name:t.name,
      syn:t.syn===undefined?50:t.syn,     // 从真实战绩反推，见 export_game.py
      tac:t.tac===undefined?50:t.tac,""")

# ---------- power 接受「战队对象」或「选手数组」 ----------
rep("""function power(players,fatigue=0,verFav=null){""",
"""/* 综合实力 = base × 默契 × 战术 × 士气 × 指挥 × 体能
   传战队对象时用它自己的默契/战术；传数组时按中性 50 处理。 */
function power(teamOrPlayers,fatigue=0,verFav=null){
  const team=(teamOrPlayers&&teamOrPlayers.players)?teamOrPlayers:null;
  const players=team?team.players:teamOrPlayers;
  return powerCore(players,fatigue,verFav,team);
}
function powerCore(players,fatigue=0,verFav=null,team=null){""")

# 权重来源：自己的队用 S.squad，NPC 用队伍自己的字段
rep("""  const tm=(typeof trustMod==="function"&&S.trust)?trustMod():1;
  const sq=(typeof squadMod==="function"&&players.some(x=>x.me))?squadMod():1;""",
"""  const mine=players.some(x=>x.me);
  const tm=(mine&&typeof trustMod==="function"&&S.trust)?trustMod():1;
  // 默契与战术：自己的队看 S.squad，别人的队看它自己的（真实战绩反推）
  const syn=mine?(typeof squadOf==="function"?squadOf("syn"):50):(team&&team.syn!==undefined?team.syn:50);
  const tac=mine?(typeof squadOf==="function"?squadOf("tac"):50):(team&&team.tac!==undefined?team.tac:50);
  const sq=(1+(syn-50)/950)*(1+(tac-50)/1100);""")

# ---------- 所有 t.players 的调用改成传整支队 ----------
for a, b in [
    ("power(t.players,0,sea.fav)", "power(t,0,sea.fav)"),
    ("power(t.players)", "power(t)"),
    ("power(opp.players,0,sea.fav)", "power(opp,0,sea.fav)"),
    ("power(a.players,0,sea.fav)", "power(a,0,sea.fav)"),
    ("power(b.players,0,sea.fav)", "power(b,0,sea.fav)"),
    ("power(a.players)", "power(a)"),
    ("power(b.players)", "power(b)"),
    ("power(team.players)", "power(team)"),
]:
    s = s.replace(a, b)

# ---------- NPC 换血也砸默契 ----------
rep("""          team.players[i]=nr;""",
    """          team.players[i]=nr;
          team.syn=clamp((team.syn===undefined?50:team.syn)-7,20,90);   // 换人要重新磨""")
rep("""        a.players[ia]=pb; b.players[ib]=pa;""",
    """        a.players[ia]=pb; b.players[ib]=pa;
        a.syn=clamp((a.syn===undefined?50:a.syn)-8,20,90);
        b.syn=clamp((b.syn===undefined?50:b.syn)-8,20,90);""")
# 没换人的队，默契慢慢回升（阵容稳定就是优势）
rep("""  // —— 复出：传奇池 + 本局内退役的选手 ——""",
    """  // 阵容没动的队，默契自然回升——稳定本身就是一种实力
  Object.keys(S.world).forEach(lg=>S.world[lg].forEach(t=>{
    if(t.syn===undefined) t.syn=50;
    if(t.tac===undefined) t.tac=50;
    t.syn=clamp(t.syn+(t.syn<56?2.2:0.8),20,90);
    t.tac=clamp(t.tac+(t.tac<56?1.6:0.6),20,90);
  }));

  // —— 复出：传奇池 + 本局内退役的选手 ——""")

# ---------- 每次渲染检查阵容变动 ----------
rep("""function render(){
  hud();""",
    """function render(){
  if(typeof watchRoster==="function") watchRoster();
  hud();""")
# 玩家加盟本身就是一次阵容变动
rep("  initTrust(); initSquad(); initCapBonus();",
    """  initTrust(); initSquad(); initCapBonus();
  S.rosterSig=myRoster().map(x=>x.id).sort().join("|");
  // 你自己就是那个「强援」：base 上去了，但五个人要重新磨
  disruptSynergy(1,`<b>${S.name||"你"}</b> 加盟`);""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch10 ok | power(队伍) 调用", s.count("power(t,"), "+", s.count("power(opp,"), "处")
