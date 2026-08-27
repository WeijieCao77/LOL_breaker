# -*- coding: utf-8 -*-
"""把「年龄/背景随机池/无死线转会窗口/商城装备」接进主模板。"""
import io, os, sys

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


# ---------- 模块占位 ----------
rep("/* __RANKICON_MODULE__ */",
    "/* __RANKICON_MODULE__ */\n\n/* __SHOP_MODULE__ */\n\n/* __ORIGINS_MODULE__ */")

# ---------- 年龄 ----------
rep("const TOTAL_TALENT=20, WEEKS=5, AP=3, SPREAD=8.5;",
    """/* 出道年龄：小的起点低但成长窗口长，大的起点高但更早撞上衰退。
   本作只跑到 2026——17 岁出道那年结束时 22 岁仍在涨，20 岁出道结束时 25 岁已开始掉。 */
const AGES=[
  {a:17,n:"17 岁",d:"手最快的年纪，也最沉不住气",
   mod:{操作:+3,运营:-3,心态:-3,指挥:-4,体质:+2}, grow:1.10, note:"成长最快，收尾时正当打"},
  {a:18,n:"18 岁",d:"最常见的出道年龄", mod:{}, grow:1.00, note:"没有偏科"},
  {a:19,n:"19 岁",d:"多打了一年，脑子清楚一些",
   mod:{操作:-2,运营:+2,心态:+2,指挥:+3,体质:-1}, grow:0.95, note:"起点更高，成长稍慢"},
  {a:20,n:"20 岁",d:"起步晚，但想得明白",
   mod:{操作:-4,运营:+4,心态:+4,指挥:+6,体质:-2}, grow:0.88, note:"开局最强，收尾时已在下滑"}
];
const TOTAL_TALENT=20, WEEKS=5, AP=3, SPREAD=8.5;""")

# ---------- 转会窗口：不再是死线 ----------
rep("""const PRE_DEADLINE=24, PRE_AP=3;   // 24 周是转会窗口关闭，不是「必须打满」
const PRE_INVITE=92;               // 综合评估到这个水平，试训邀请就会来
const PRE_EARLIEST=13;             // 主播杯(第12周)打完之前，没人会给你正式试训
const PRE_WEEKS=PRE_DEADLINE;""",
    """/* 没有死线：一年一个转会窗口，这次没签就接着打，等明年。
   代价是你又老了一岁——巅峰期是有限的，而这个世界只跑到 2026。 */
const PRE_YEAR=20, PRE_AP=3;       // 一个「职业前年度」20 周，年末是转会窗口
const PRE_INVITE=88;               // 综合评估到这个水平，才有俱乐部来谈
const PRE_EARLIEST=13;             // 主播杯打完之前，没人会下判断
const PRE_WEEKS=PRE_YEAR;""")

# 捏人状态
rep("""  S={step:"create",name:"",pos:"mid",origin:"academy",
     talent:{操作:4,运营:4,心态:4,指挥:4,体质:4}};""",
    """  S={step:"create", name:"", pos:"mid", origin:"academy", ageIdx:1,
       bgPick:null, bgOffer:drawBackgrounds(),
       talent:{操作:4,运营:4,心态:4,指挥:4,体质:4}};""")

# ---------- 捏人界面：年龄 + 背景抽卡 ----------
rep("""    <h3 style="margin-top:20px">出身</h3>""",
    """    <h3 style="margin-top:20px">出道年龄</h3>
    <div class="grid g5">${AGES.map((x,i)=>`<button class="opt ${S.ageIdx===i?'on':''}" data-age="${i}">
      <div class="t">${x.n}</div><div class="d">${x.d}<br><span style="color:var(--gold)">${x.note}</span></div>
      </button>`).join("")}</div>
    <h3 style="margin-top:20px">出身</h3>""")

rep("""    <p class="note">你今年 17 岁，还没有战队。""",
    """    <h3 style="margin-top:20px">你是怎么走到这一步的
      <button class="btn ghost sm" id="reroll" style="margin-left:10px">换一批</button></h3>
    <div class="grid g2">${S.bgOffer.map(b=>`
      <button class="opt ${S.bgPick===b.k?'on':''}" data-bg="${b.k}">
        <div class="t">${b.n}</div>
        <div class="d">${b.d}<br><span style="color:var(--gold)">${bgEffects(b).join(" · ")}</span></div>
      </button>`).join("")}</div>
    <p class="note">你现在 ${AGES[S.ageIdx].a-1} 岁，还没有战队。""")

rep("      ${left!==0?`还需分配 ${left} 点`:'开始职业前之路 →'}</button></div>",
    "      ${left!==0?`还需分配 ${left} 点`:(S.bgPick?'开始职业前之路 →':'先选一个背景')}</button></div>",
    must=False)
rep("""    <div class="row"><button class="btn" id="go" ${left!==0?'disabled':''}>""",
    """    <div class="row"><button class="btn" id="go" ${(left!==0||!S.bgPick)?'disabled':''}>""")

# ---------- startPre：应用年龄与背景 ----------
rep("""  const o=ORIGIN[S.origin], attrs={};
  DIMS.forEach(d=>attrs[d]=Math.min(o.base[d]-9,cap(S.talent[d])));   // 职业前底子更薄
  S=Object.assign({},S,{
    step:"pre",attrs,age:17,fame:o.fame,money:0,fatigue:0,""",
    """  const o=ORIGIN[S.origin], A=AGES[S.ageIdx], B=bgOf(S.bgPick);
  const attrs={};
  DIMS.forEach(d=>attrs[d]=Math.min(
    o.base[d]-9+(A.mod[d]||0)+((B.mod&&B.mod[d])||0), cap(S.talent[d])));
  S=Object.assign({},S,{
    step:"pre",attrs,age:A.a-1,fame:Math.max(0,o.fame+(B.fame||0)),money:B.money||0,fatigue:0,
    ageCfg:A,bg:B,preYear:1,""")

rep("""  preLog(`你 17 岁，${ORIGIN[S.origin].n}，当前 <b>${rankFull(S.pre.rank)}</b>。没有战队，没有人认识你。`,"info");""",
    """  initShop();
  if(B.course) S.courses[B.course]=1;
  preLog(`<b>${B.n}</b>。${B.d}`,"big");
  preLog(`你 ${S.age} 岁，${ORIGIN[S.origin].n}，当前 ${rankBadge(S.pre.rank,22)}。没有战队，没有人认识你。`,"info");""")

# ---------- 转会窗口逻辑 ----------
rep("""  // 打够了就提前收到试训邀请，不用干等；打不够就熬到窗口关闭
  if(P.week>=PRE_EARLIEST&&preScore()>=PRE_INVITE){
    preLog(`俱乐部发来<b>正式试训邀请</b>。你不用再等了。`,"big");
    makeOffers(false); return;
  }
  if(P.week>=PRE_DEADLINE){
    preLog(`转会窗口关闭了。<b>剩下的位置不多。</b>`,"bad");
    makeOffers(true); return;
  }
  P.week++; P.ap=PRE_AP; addFat(-9);""",
    """  // 够格就随时有人来谈；不够就打到年末的转会窗口再看
  if(P.week>=PRE_EARLIEST&&preScore()>=PRE_INVITE){
    preLog(`俱乐部发来<b>正式试训邀请</b>。`,"big");
    makeOffers(); return;
  }
  if(P.week>=PRE_YEAR){
    if(preScore()>=PRE_INVITE*0.82){ preLog(`转会窗口开了，有队伍愿意和你谈。`,"good"); makeOffers(); return; }
    preLog(`转会窗口关了，<b>没有一家找你</b>。明年再来。`,"bad");
    preNextYear(); return;
  }
  P.week++; P.ap=PRE_AP; addFat(-9);""")

# 新增：职业前跨年
rep("function makeOffers(forced){",
    """/* 这一年没签成：世界往前走一年，你也老一岁。没有死线，只有代价。 */
function preNextYear(){
  const P=S.pre;
  if(S.si>=SEASONS.length-1){ S.step="end"; S.neverSigned=true; render(); return; }
  S.si++; S.age++; P.preYear=(P.preYear||1)+1;
  P.week=1; P.ap=PRE_AP; P.cityCup=null; P.streamCup=null;
  S.fatigue=0; S.buff={};
  P.rank=Math.max(0,P.rank-4);          // 一年下来手会生一点
  pushEvent(`<b>${SEASONS[S.si].tag} ${SEASONS[S.si].y}</b>：你还没打上职业。${SEASONS[S.si].story}`,"bad","赛季");
  preLog(`— ${SEASONS[S.si].tag} ${SEASONS[S.si].y}，你 ${S.age} 岁了 —`,"hi");
  render();
}
function makeOffers(forced){""")

# 熬到最后才签的判定改掉
rep('  if(score>=70&&!forced) offers.push({k:"sub"', '  if(score>=70) offers.push({k:"sub"')
rep('  if(score>=32&&!forced) offers.push({k:"start"', '  if(score>=32) offers.push({k:"start"')
rep('  if(score>=92&&!forced){\n    const foreign=', '  if(score>=92){\n    const foreign=')

# offer 页：可以拒绝
rep("""      ${P.offers.map((of,i)=>`<button class="opt" data-offer="${i}">""",
    """      ${P.offers.map((of,i)=>`<button class="opt" data-offer="${i}">""")
rep("""    </div>
  </div>`;
}""",
    """    </div>
    <div class="row"><button class="btn ghost" id="decline">都不签，再练一年 →</button></div>
    <p class="note">拒绝不会有惩罚，但你会老一岁——而这个世界只走到 2026。</p>
  </div>`;
}""")

# 里程碑：删掉死线那条
rep("""  {w:PRE_DEADLINE, name:"转会窗口关闭", tag:"死线", open:true, dateOnly:true,
   need:()=>true, needTxt:"最后期限",
   cur:()=>"—",
   desc:"熬到这一天才签，就只剩没人要的位置了",""",
    """  {w:PRE_YEAR, name:"转会窗口", tag:"机会", open:true, dateOnly:true,
   need:()=>true, needTxt:"年度机会",
   cur:()=>"—",
   desc:"年末各队定人。这次没签也不要紧，明年还有——只是你又老了一岁",""")

rep("      <br>转会窗口还有 <b>${PRE_DEADLINE-P.week}</b> 周关闭。</div>",
    "      <br>距离转会窗口还有 <b>${Math.max(0,PRE_YEAR-P.week)}</b> 周。</div>")
rep("      <div><div class=\"k\">阶段</div><div class=\"v\">职业前 <small>窗口剩 ${PRE_DEADLINE-S.pre.week} 周</small></div></div>",
    "      <div><div class=\"k\">阶段</div><div class=\"v\">职业前 <small>${SEASONS[S.si].tag} · 窗口剩 ${Math.max(0,PRE_YEAR-S.pre.week)} 周</small></div></div>")

rep("""    <p class="note">${P.forced
      ? '<b style="color:var(--red)">你熬到了窗口关闭。</b>没有俱乐部主动找过你，桌上只剩这些。'
      : '这段时间你做的每一件事，都变成了现在桌上的选项。<b>选哪条路，决定你未来五年在什么位置起跑。</b>'}</p>""",
    """    <p class="note">这段时间你做的每一件事，都变成了现在桌上的选项。<b>选哪条路，决定你剩下的年份在什么位置起跑。</b></p>""")

# ---------- 训练/成长乘上年龄与背景 ----------
rep("  const coach=(S.buff&&S.buff.coach)?1.22:1;\n  return 3.4*mult(t)*(0.25+0.75*room)*bonus*ageM*coach;",
    """  const coach=(S.buff&&S.buff.coach)?1.22:1;
  const ag=(S.ageCfg&&S.ageCfg.grow)||1;
  const bg=(S.bg&&S.bg.train)||1;
  const cs=(typeof courseTrainMul==="function")?courseTrainMul(d):1;
  return 3.4*mult(t)*(0.25+0.75*room)*bonus*ageM*coach*ag*bg*cs;""")

# 休息效率受背景影响
rep("  else{addFat((S.buff&&S.buff.physio)?-42:-30);S.attrs.心态",
    "  else{addFat(((S.buff&&S.buff.physio)?-42:-30)*((S.bg&&S.bg.rest)||1));S.attrs.心态")

# ---------- 签约年龄 / 信任 / 家用 ----------
rep("    step:\"season\",age:18,world,baseline:P.baseline,", "    step:\"season\",age:S.age+1,world,baseline:P.baseline,")
rep("? {id:S.name||\"你\",cn:\"\",pos:S.pos,age:18,r:S.attrs,me:true} : q);",
    "? {id:S.name||\"你\",cn:\"\",pos:S.pos,age:S.age+1,r:S.attrs,me:true} : q);")
rep("""function endSeason(result,seed){
  payday();""",
    """function endSeason(result,seed){
  payday();
  const up=(S.bg&&S.bg.upkeep)||0;
  if(up){ S.money=Math.max(0,S.money-up);
    pushEvent(`往家里寄了 <b>${up} 万</b>。`,"info","家用"); }""")

# ---------- 直播打赏 ----------
rep("""    S.fame+=pop*m; S.money+=5*m; addFat(4); P.scout+=0.5*m;""",
    """    const gift=streamIncome();
    S.fame+=pop*m; S.money+=gift; addFat(4); P.scout+=0.5*m;
    if(gift>=50&&!P.bigGift){P.bigGift=true;
      preLog(`直播间刷起了礼物，这一场进账 <b>${Math.round(gift)} 万</b>。`,"good");}""")
rep("    S.fame+=4.5*m;S.money+=6*m;addFat(5);}", "    S.fame+=4.5*m;S.money+=streamIncome();addFat(5);}")

# ---------- 装备/语言加成进战力 ----------
rep("    let v=r.操作*0.34+r.运营*0.28+r.心态*0.14+r.体质*0.10;",
    """    let v=r.操作*0.34+r.运营*0.28+r.心态*0.14+r.体质*0.10;
    if(p.me&&typeof gearBonus==="function"){
      v+=gearBonus("操作")*0.34+gearBonus("运营")*0.28+gearBonus("体质")*0.10+langBonus();
    }""")

# ---------- 商城挂载 ----------
rep("  ${moneyCard()}\n  ${eventsCard()}", "  ${gearCard()}\n  ${shopCard()}\n  ${eventsCard()}")
rep("  ${scheduleCard()}\n  ${attrCard()}", "  ${scheduleCard()}\n  ${attrCard()}\n  ${gearCard()}\n  ${shopCard()}")

# ---------- 结局：从未签约 ----------
rep("""function ending(){
  const played=S.career.w+S.career.l, best=S.career.best;""",
    """function ending(){
  if(S.neverSigned) return {n:"没能上岸",
    d:`到 2026 年，你始终没能签下第一份职业合同。排位打到过 ${rankFull(S.pre?S.pre.rank:0)}，直播间也有过人，但那扇门没有为你开。`};
  const played=S.career.w+S.career.l, best=S.career.best;""")

# ---------- 绑定 ----------
rep("  st.querySelectorAll(\"[data-pos]\").forEach",
    """  st.querySelectorAll("[data-age]").forEach(b=>b.onclick=()=>{S.ageIdx=+b.dataset.age;render()});
  st.querySelectorAll("[data-bg]").forEach(b=>b.onclick=()=>{S.bgPick=b.dataset.bg;render()});
  const rr=$("reroll"); if(rr) rr.onclick=()=>{S.bgOffer=drawBackgrounds();S.bgPick=null;render()};
  st.querySelectorAll("[data-gear]").forEach(b=>b.onclick=()=>{
    const a=b.dataset.gear.split(":");buyGear(a[0],+a[1]);});
  st.querySelectorAll("[data-course]").forEach(b=>b.onclick=()=>buyCourse(b.dataset.course));
  st.querySelectorAll("[data-relax]").forEach(b=>b.onclick=()=>buyRelax(b.dataset.relax));
  const dc=$("decline"); if(dc) dc.onclick=()=>{S.step="pre";preNextYear();};
  st.querySelectorAll("[data-pos]").forEach""")

if MISS:
    print("对不上的锚点 %d 处：" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)
if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)
assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patched career_template.html")
