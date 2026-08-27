# -*- coding: utf-8 -*-
"""三处改动：
   1. 段位徽章换成官方图（不再手绘）
   2. 「关注度」并入「名气」——两个维度靠同样的行为增长，玩家分不清区别
   3. 出身/背景选择不再摆出数值，选完给一张综合面板
"""
import io, os

BASE = os.path.dirname(os.path.abspath(__file__))
MISS = []


def load(f):
    return io.open(os.path.join(BASE, f), encoding="utf-8").read()


def save(f, s):
    io.open(os.path.join(BASE, f), "w", encoding="utf-8").write(s)


def rep(s, a, b, must=True):
    if a not in s:
        if must:
            MISS.append(a[:90].replace("\n", " / "))
        return s
    return s.replace(a, b, 1)


# ---------------- 1) 官方段位徽章 ----------------
ri = load("rankicon.js")
i = ri.index("function rankIcon(")
j = ri.index("/* 徽章 + 文字 */")
ri = ri[:i] + '''/* 段位 -> 官方徽章文件名 */
function tierArtKey(v){
  let i=0; RANKS.forEach((x,k)=>{ if(v>=x.at) i=k; });
  return ["gold","platinum","diamond","master","grandmaster","challenger","challenger","challenger"][i]||"gold";
}
function rankIcon(v,size){
  size=size||44;
  const src=RANK_ART[tierArtKey(v)];
  if(!src) return "";
  return `<img class="rankicon" src="${src}" width="${size}" height="${size}" alt="${rankFull(v)}">`;
}
''' + ri[j:]
save("rankicon.js", ri)

# ---------------- 2) 合并 关注度 -> 名气 ----------------
s = load("career_template.html")
orig = s

# preScore 去掉 scout
s = rep(s, """function preScore(){
  const P=S.pre;
  return P.rank*0.62+P.scout*0.55+S.fame*0.16+(P.cityCup||0)*5+(P.streamCup||0)*5;
}""",
"""/* 只有一个「外界评价」维度：段位 + 名气 + 赛事成绩。
   原来还有个「星探关注度」，但它和名气靠同样的行为增长，玩家分不清区别——已合并。 */
function preScore(){
  const P=S.pre;
  return P.rank*0.88+S.fame*0.34+(P.cityCup||0)*9+(P.streamCup||0)*9;
}""")

# 排位/直播不再加 scout，改为加名气
s = rep(s, "    P.scout+=g*0.55;", "    S.fame+=g*0.42;      // 冲分本身就会带来关注")
s = rep(s, "addFat(4); P.scout+=0.5*m; checkAch(\"stream\");", "addFat(4); checkAch(\"stream\");")
s = rep(s, "  S.pre.scout+=r.win*4.5; S.fame+=r.win*6;", "  S.fame+=r.win*11;")
s = rep(s, "  S.pre.scout+=r.win*3.5; S.fame+=r.win*9;", "  S.fame+=r.win*13;")
s = rep(s, "  S.pre.scout=S.pre.rank*0.28;\n", "")

# 里程碑里两条隐性条件改成看名气
s = rep(s, "   need:()=>S.pre.scout>=22, needTxt:\"—\",", "   need:()=>preScore()>=34, needTxt:\"—\",")
s = rep(s, "   need:()=>S.pre.scout>=45, needTxt:\"—\",", "   need:()=>preScore()>=62, needTxt:\"—\",")

# scoutTier 改成基于综合评价
s = rep(s, """function scoutTier(){
  const v=S.pre.scout;
  return v<14?"无人问津":v<26?"偶尔有人提起":v<40?"圈子里有你的名字"
       :v<56?"有俱乐部在看":v<72?"有人开始打听你":"电话快打进来了";
}""",
"""/* 俱乐部怎么看你——由段位、名气与赛事成绩共同决定，不再是单独一条数值 */
function scoutTier(){
  const r=preScore()/PRE_INVITE;
  return r<0.2?"没人知道你是谁":r<0.4?"偶尔有人提起":r<0.6?"圈子里有你的名字"
       :r<0.82?"有俱乐部在打听":r<1?"已经有人在联系你了":"随时可以谈签约";
}""")

# HUD 里的「关注度」删掉
s = rep(s, """      <div><div class="k">关注度</div><div class="v" style="font-size:13px">${scoutTier()}</div></div>\n""", "")
s = rep(s, "      外界关注 <b>${scoutTier()}</b>　·　名气 <b>${fameTier()}</b><br>",
           "      名气 <b>${fameTier()}</b>　·　俱乐部评价 <b>${scoutTier()}</b><br>")

# ---------------- 3) 出身/背景不剧透数值 ----------------
s = rep(s, """        <div class="d">${b.d}<br><span style="color:var(--gold)">${bgEffects(b).join(" · ")}</span></div>""",
           """        <div class="d">${b.d}</div>""")
s = rep(s, """      <div class="d">${o.d}<br><span style="color:var(--gold)">${o.perk}</span></div>""",
           """      <div class="d">${o.d}</div>""", must=False)
s = rep(s, """<div class="d">${x.d}<br><span style="color:var(--gold)">${x.note}</span></div>""",
           """<div class="d">${x.d}</div>""")

# 选完给一张综合面板
s = rep(s, """    <div class="row"><button class="btn" id="go" ${(left!==0||!S.bgPick)?'disabled':''}>""",
"""    ${S.bgPick?summaryCard():""}
    <div class="row"><button class="btn" id="go" ${(left!==0||!S.bgPick)?'disabled':''}>""")

s = rep(s, "function viewCreate(){",
"""/* 三项都选完之后，才把最终的起点摊开给玩家看一次 */
function summaryCard(){
  const o=ORIGIN[S.origin], A=AGES[S.ageIdx], B=bgOf(S.bgPick);
  const attrs={};
  DIMS.forEach(d=>attrs[d]=Math.min(o.base[d]-9+(A.mod[d]||0)+((B.mod&&B.mod[d])||0),cap(S.talent[d])));
  const money=B.money||0, fame=Math.max(0,o.fame+(B.fame||0));
  const extra=[];
  if(B.train) extra.push(`训练效率 +${Math.round((B.train-1)*100)}%`);
  if(B.rest) extra.push(`恢复更快`);
  if(B.upkeep) extra.push(`每赛段要往家里寄 ${B.upkeep} 万`);
  if(B.trust) extra.push(`队友初始印象 ${B.trust>0?"偏好":"偏差"}`);
  if(B.course) extra.push(`已经会${COURSES.find(c=>c.k===B.course).n.replace("课","")}`);
  return `<div class="card" style="border-color:var(--gold)">
    <h2>你的起点<em>${A.n} · ${o.n} · ${B.n}</em></h2>
    <div class="attrs">${DIMS.map(d=>`
      <div class="at"><div class="lb">${d}</div>
        <div class="track"><div class="fill" style="width:${clamp(attrs[d],0,100)}%"></div>
          <div class="capline" style="left:${clamp(cap(S.talent[d]),0,100)}%"></div></div>
        <div class="vn mono"><b>${attrs[d].toFixed(0)}</b> /${cap(S.talent[d])}</div></div>`).join("")}
    </div>
    <p class="note">起始资金 <b>${money} 万</b>　·　名气 <b>${fameTier(fame)}</b>${
      extra.length?`<br>${extra.join("　·　")}`:""}</p>
    <p class="note" style="color:var(--ink-3)">竖线是天赋瓶颈。剩下的，靠你自己打出来。</p>
  </div>`;
}
function viewCreate(){""")

# ---------------- 4) 段位晋级弹窗 ----------------
s = rep(s, """    if(afterT!==beforeT) preLog(`排位打上 <b>${afterF}</b>。开始有人在弹幕里问你是谁。`,"good");""",
"""    if(afterT!==beforeT){
      preLog(`排位打上 <b>${afterF}</b>。`,"good");
      S.rankUp={from:beforeT,to:afterT,v:P.rank};      // 触发晋级弹窗
    }""")

s = rep(s, "function viewPre(){", """/* 大段位晋级：给一个有仪式感的弹窗，而不是日志里一行字 */
const RANKUP_TXT={
  "铂金":"你不再是那个随便谁都能打的路人了。",
  "钻石":"这个分段开始有认真打的人。你也得认真了。",
  "大师":"到这里，对面每一个都是奔着职业去的。",
  "宗师":"排行榜上开始出现你见过的名字。",
  "王者":"你站到了这个服务器的顶端。剩下的问题是——有没有人愿意给你一个位置。",
  "国服前 100":"每一把都有人在录你的视频。",
  "国服前 10":"职业队的球探不可能看不见你了。"
};
function rankUpCard(){
  const u=S.rankUp; if(!u) return "";
  return `<div class="rankup">
    <div class="ru-inner">
      <div class="ru-icon">${rankIcon(u.v,120)}</div>
      <div class="ru-eyebrow">段位提升</div>
      <div class="ru-tier">${u.from} → <b>${u.to}</b></div>
      <div class="ru-txt">${RANKUP_TXT[u.to]||"你又往上走了一步。"}</div>
      <button class="btn" id="rankupok">继续</button>
    </div></div>`;
}
function viewPre(){""")

s = rep(s, "  ${scheduleCard()}\n  ${attrCard()}",
           "  ${S.rankUp?rankUpCard():''}\n  ${scheduleCard()}\n  ${attrCard()}")

s = rep(s, '  const rr=$("reroll"); if(rr) rr.onclick=()=>{S.bgOffer=drawBackgrounds();S.bgPick=null;render()};',
"""  const rr=$("reroll"); if(rr) rr.onclick=()=>{S.bgOffer=drawBackgrounds();S.bgPick=null;render()};
  const ru=$("rankupok"); if(ru) ru.onclick=()=>{S.rankUp=null;render()};""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
save("career_template.html", s)
print("patch3 ok")
