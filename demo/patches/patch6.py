# -*- coding: utf-8 -*-
"""职业前也要能看见职业赛：世界从 S12 第一周就在转，
   只是那时候你还在网吧打排位。"""
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


# ---------- 职业前就把世界建起来 ----------
rep("""  initShop(); initAch();""",
    """  initShop(); initAch();
  // 世界从现在就开始转——你打排位的每一周，职业赛都在打
  S.world=cloneWorld();
  S.baseline=leagueBaseline(S.world);
  S.standings={};
  Object.keys(S.world).forEach(lg=>{
    S.standings[lg]={};
    S.world[lg].forEach(t=>S.standings[lg][t.name]={w:0,l:0});
  });""")

# 每周推进世界
rep("""  P.week++; P.ap=PRE_AP; addFat(-9);
  // 提前预告""",
    """  P.week++; P.ap=PRE_AP; addFat(-9);
  simWorldPre();
  // 提前预告""")

# 跨年时重置各赛区积分榜 + 播报上一年的冠军
rep("""  P.rank=Math.max(0,P.rank-4);          // 一年下来手会生一点""",
    """  P.rank=Math.max(0,P.rank-4);          // 一年下来手会生一点
  proSeasonWrap();""")

# ---------- 世界模拟（职业前版） ----------
rep("/* ---------- 事件系统 ---------- */",
    """/* 职业前的世界推进：你没在打，但联赛在打。 */
function simWorldPre(){
  if(!S.world||!S.standings) return;
  Object.keys(S.world).forEach(lg=>{
    const ts=S.world[lg].slice();
    for(let i=ts.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[ts[i],ts[j]]=[ts[j],ts[i]];}
    for(let i=0;i+1<ts.length;i+=2){
      const a=ts[i],b=ts[i+1];
      const p=1/(1+Math.exp(-(power(a.players)-power(b.players))/SPREAD));
      const aw=rnd()<p;
      S.standings[lg][a.name][aw?"w":"l"]++;
      S.standings[lg][b.name][aw?"l":"w"]++;
      if(lg==="LPL"&&rnd()<0.06){
        pushEvent(`<b>${aw?a.name:b.name}</b> 击败 ${aw?b.name:a.name}。`,"info","联赛");
      }
    }
  });
  // 偶尔来一条职业圈新闻，让世界有存在感
  if(rnd()<0.22) proNews();
}
function proNews(){
  const lg=["LPL","LCK","LEC","LCS"][Math.floor(rnd()*4)];
  const rk=Object.entries(S.standings[lg]||{})
    .map(([n,r])=>({n,...r,p:(r.w+r.l)?r.w/(r.w+r.l):0})).sort((a,b)=>b.p-a.p);
  if(!rk.length) return;
  const top=rk[0], bot=rk[rk.length-1];
  const pool=[
    ()=>`<b>${top.n}</b> 以 ${top.w}−${top.l} 领跑 ${lg}。`,
    ()=>`<b>${bot.n}</b> 跌到 ${lg} 垫底，传出换人消息。`,
    ()=>{const t=S.world[lg][Math.floor(rnd()*S.world[lg].length)];
         const q=t.players[Math.floor(rnd()*t.players.length)];
         return `${lg} 周最佳：<b>${q.id}</b>${q.cn?`（${q.cn}）`:""}（${t.name}）。`},
    ()=>`${lg} 官方公布下赛季赛制调整，讨论度不低。`,
    ()=>{const t=S.world[lg][Math.floor(rnd()*S.world[lg].length)];
         return `<b>${t.name}</b> 宣布启用青训选手，位置暂时保密。`}
  ];
  pushEvent(pool[Math.floor(rnd()*pool.length)](),"info","职业圈");
}
/* 职业前跨年：结算各赛区冠军，然后清空积分榜 */
function proSeasonWrap(){
  if(!S.standings) return;
  ["LPL","LCK","LEC","LCS"].forEach(lg=>{
    const rk=Object.entries(S.standings[lg]||{})
      .map(([n,r])=>({n,...r,p:(r.w+r.l)?r.w/(r.w+r.l):0})).sort((a,b)=>b.p-a.p);
    if(rk.length) pushEvent(`${SEASONS[Math.max(0,S.si-1)].tag} <b>${lg}</b> 年度第一：<b>${rk[0].n}</b>（${rk[0].w}−${rk[0].l}）。`,
      lg==="LCK"?"bad":"info","赛季");
  });
  Object.keys(S.world).forEach(lg=>{
    S.world[lg].forEach(t=>S.standings[lg][t.name]={w:0,l:0});
  });
}

/* ---------- 事件系统 ---------- */""")

# ---------- 职业前加「联赛」tab ----------
rep("""const TABS_PRE=[
  {k:"act",  n:"本周"},
  {k:"sched",n:"赛程"},
  {k:"shop", n:"商城"},
  {k:"ach",  n:"成就"},
  {k:"log",  n:"日志"}
];""",
    """const TABS_PRE=[
  {k:"act",  n:"本周"},
  {k:"sched",n:"赛程"},
  {k:"pro",  n:"联赛"},
  {k:"shop", n:"商城"},
  {k:"ach",  n:"成就"},
  {k:"log",  n:"日志"}
];""")

rep("""  ${T==="sched"?scheduleCard():""}""",
    """  ${T==="sched"?scheduleCard():""}
  ${T==="pro"?proCard()+eventsCard():""}""")

# 职业前的联赛面板（可切赛区）
rep("function scheduleCard(){",
    """/* 职业前的联赛面板：你打不上，但你能看着。 */
function proCard(){
  const lgs=["LPL","LCK","LEC","LCS"];
  const cur=lgs.includes(S.proLg)?S.proLg:"LPL";
  const rk=Object.entries((S.standings||{})[cur]||{})
    .map(([n,r])=>({n,...r,p:(r.w+r.l)?r.w/(r.w+r.l):0}))
    .sort((a,b)=>b.p-a.p||b.w-a.w);
  return `<div class="card"><h2>职业联赛<em>${SEASONS[S.si].tag} ${SEASONS[S.si].y} · 第 ${S.pre.week} 周</em></h2>
    <div class="filt">${lgs.map(l=>
      `<button data-prolg="${l}" class="${l===cur?'on':''}">${l}</button>`).join("")}</div>
    <div class="tw"><table><thead><tr><th>#</th><th>战队</th><th class="n">战绩</th><th class="n">胜率</th></tr></thead>
    <tbody>${rk.map((r,i)=>`<tr class="${i===0?'me':''}">
      <td class="n">${i+1}</td><td>${teamLogo(r.n,18)}${r.n}</td>
      <td class="n">${r.w}−${r.l}</td><td class="n">${(r.p*100).toFixed(0)}%</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note">你还在打排位，但这些队每周都在打。<b>总有一天你要坐到那张桌子上。</b></p></div>`;
}
function scheduleCard(){""")

# 绑定赛区切换
rep('  st.querySelectorAll("[data-tab]").forEach',
    '  st.querySelectorAll("[data-prolg]").forEach(b=>b.onclick=()=>{S.proLg=b.dataset.prolg;render()});\n'
    '  st.querySelectorAll("[data-tab]").forEach')

# 签约时不要用职业前那套积分榜，startSeason 会重建——确保不冲突
rep("""function acceptOffer(i){
  const P=S.pre, of=P.offers[i];""",
    """function acceptOffer(i){
  const P=S.pre, of=P.offers[i];
  S.proLg=null;""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch6 ok")
