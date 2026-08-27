# -*- coding: utf-8 -*-
"""1. 出身与背景合并成一次选择：每张背景卡自带出身，抽 4 张且保证两种出身都有
   2. 所有 buff 文案隐藏——效果照常生效，但不写在脸上
   3. 起点面板从捏人页拿掉，改成点「开始」后的确认弹窗"""
import io, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
MISS = []

# 每个背景归属哪种出身（合并后由背景卡直接决定）
ORIGIN_OF = {
    "netbar": "academy", "rich": "academy", "town": "academy", "sport": "academy",
    "brother": "academy", "soloq": "academy", "cut": "academy", "kr": "academy",
    "captain": "academy", "injury": "academy",
    "single": "streamer", "late": "streamer", "rehab": "streamer", "boost": "streamer",
    "hotel": "streamer", "sidekick": "streamer", "idol": "streamer", "army": "streamer",
}

# ---------- origins.js ----------
p = os.path.join(BASE, "origins.js")
s = io.open(p, encoding="utf-8").read()
orig = s

# 给每条背景打上出身
def tag_origin(m):
    k = m.group(1)
    o = ORIGIN_OF.get(k, "academy")
    return '{k:"%s", origin:"%s", n:"%s"' % (k, o, m.group(2))


s = re.sub(r'\{k:"(\w+)",\s*n:"([^"]+)"', tag_origin, s)

# 抽 4 张，且保证两种出身都出现——不能让玩家被随机剥夺选择
s = s.replace("""function drawBackgrounds(){
  const pool=BACKGROUNDS.slice();
  const out=[];
  while(out.length<4&&pool.length){          // 4 张排版才整齐，也给足选择空间
    out.push(pool.splice(Math.floor(rnd()*pool.length),1)[0]);
  }
  return out;
}""",
"""function drawBackgrounds(){
  // 抽 4 张，并保证主播/青训两条路都至少有一张——
  // 出身已经并进背景卡里，随机不该把一整条路直接抽没。
  const pick=(arr)=>arr.splice(Math.floor(rnd()*arr.length),1)[0];
  const aca=BACKGROUNDS.filter(b=>b.origin==="academy");
  const str=BACKGROUNDS.filter(b=>b.origin==="streamer");
  const out=[pick(aca),pick(str)];
  const rest=aca.concat(str);
  while(out.length<4&&rest.length) out.push(pick(rest));
  for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}""")
if s != orig:
    io.open(p, "w", encoding="utf-8").write(s)
else:
    MISS.append("origins.js 没改动")

# ---------- career_template.html ----------
p = os.path.join(BASE, "career_template.html")
s = io.open(p, encoding="utf-8").read()
orig = s


def rep(a, b):
    global s, MISS
    if a not in s:
        MISS.append("tpl :: " + a[:90].replace("\n", " / "))
        return
    s = s.replace(a, b, 1)


# 出身与背景合并为一个区块
rep("""    <h3 style="margin-top:20px">出身</h3>
    <div class="grid g2">${Object.entries(ORIGIN).map(([k,o])=>`
      <button class="opt ${S.origin===k?'on':''}" data-org="${k}">
      <div class="t">${o.n}</div><div class="d">${o.d}<br><span style="color:var(--gold)">${o.perk}</span></div>
      </button>`).join("")}</div>
    <h3 style="margin-top:20px">你是怎么走到这一步的
      <button class="btn ghost sm" id="reroll" style="margin-left:10px">换一批</button></h3>
    <div class="grid g2">${S.bgOffer.map(b=>`
      <button class="opt ${S.bgPick===b.k?'on':''}" data-bg="${b.k}">
        <div class="t">${b.n}</div>
        <div class="d">${b.d}</div>
      </button>`).join("")}</div>""",
"""    <h3 style="margin-top:20px">出身
      <button class="btn ghost sm" id="reroll" style="margin-left:10px">换一批</button></h3>
    <div class="grid g2">${S.bgOffer.map(b=>`
      <button class="opt ${S.bgPick===b.k?'on':''}" data-bg="${b.k}">
        <div class="t">${b.n}<span class="tag">${ORIGIN[b.origin].n}</span></div>
        <div class="d">${b.d}</div>
      </button>`).join("")}</div>""")

# 选背景时同时定下出身
rep("""st.querySelectorAll("[data-bg]").forEach(b=>b.onclick=()=>{S.bgPick=b.dataset.bg;render()});""",
    """st.querySelectorAll("[data-bg]").forEach(b=>b.onclick=()=>{
    S.bgPick=b.dataset.bg;
    const bb=bgOf(S.bgPick); if(bb&&bb.origin) S.origin=bb.origin;   // 出身随背景走
    render()});""")

# 起点面板改成确认弹窗
rep("""  return `<div class="card" style="border-color:var(--gold)">
    <h2>你的起点<em>${A.n} · ${o.n} · ${B.n}</em></h2>""",
    """  return `<div class="rankup"><div class="ru-inner" style="max-width:560px;text-align:left">
    <div class="ru-eyebrow" style="text-align:center">你的起点</div>
    <div class="ru-tier" style="font-size:20px;text-align:center;margin-bottom:16px">${A.n} · ${o.n} · ${B.n}</div>""")
rep("""    <p class="note">竖线是天赋瓶颈。剩下的，靠你自己打出来。</p>
  </div>`;
}""",
    """    <p class="note">竖线是天赋瓶颈。剩下的，靠你自己打出来。</p>
    <div class="row" style="justify-content:center;margin-top:18px">
      <button class="btn" id="startgo">开始职业前之路 →</button>
    </div>
  </div></div>`;
}""")
rep("""    ${S.bgPick?summaryCard():""}\n""", "")
rep("""      ${left!==0?`还需分配 ${left} 点`:(S.bgPick?'开始职业前之路 →':'先选一个背景')}</button></div>""",
    """      ${left!==0?`还需分配 ${left} 点`:(S.bgPick?'确认，看看我的起点 →':'先选一个出身')}</button></div>""")
rep("""  const go=$("go"); if(go) go.onclick=()=>{S.name=(nm&&nm.value.trim())||"无名";startPre()};""",
    """  const go=$("go"); if(go) go.onclick=()=>{
    S.name=(nm&&nm.value.trim())||"无名"; S.showStart=true; render(); };
  const sg=$("startgo"); if(sg) sg.onclick=()=>{ S.showStart=false; startPre(); };""")
rep("""function viewCreate(){""",
    """function viewCreate(){
  if(S.showStart) return summaryCard();""")

io.open(p, "w", encoding="utf-8").write(s)

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)
assert s != orig
print("patch15 ok")
