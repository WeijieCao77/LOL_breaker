# -*- coding: utf-8 -*-
"""天赋瓶颈可以被经历顶开：
   夺冠、进强队、跟老将同队、打国际赛……这些都会把某一维的天花板往上推。
   但推得有限（每维最多 +14），天赋依然决定你能走多远。"""
import io, os, re

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


# ---------- 瓶颈突破机制 ----------
rep("const cap=t=>38+t*5;   // 天赋1->43(职业及格线)  天赋10->88(历史级)",
"""const cap=t=>38+t*5;   // 天赋1->43(职业及格线)  天赋10->88(历史级)
const CAP_MAX_BONUS=14;   // 经历最多能把天花板顶高这么多——天赋依然是主导

/* 实际瓶颈 = 天赋上限 + 经历顶开的部分 */
function capOf(d){
  return cap(S.talent[d])+((S.capBonus&&S.capBonus[d])||0);
}
function initCapBonus(){ S.capBonus={}; DIMS.forEach(d=>S.capBonus[d]=0); }
/* 顶开瓶颈：同一个来源只算一次 */
function breakthrough(d,n,reason,key){
  if(!S.capBonus) initCapBonus();
  if(key){ S.capSeen=S.capSeen||{}; if(S.capSeen[key]) return; S.capSeen[key]=1; }
  const before=S.capBonus[d];
  S.capBonus[d]=clamp(before+n,0,CAP_MAX_BONUS);
  const got=(S.capBonus[d]-before).toFixed(1);
  if(+got<=0) return;
  pushEvent(`<b>瓶颈松动</b>　${reason}<br>
    <span style="color:var(--cyan)">${d}上限 ${cap(S.talent[d])+before} → ${cap(S.talent[d])+S.capBonus[d]}</span>`,
    "big","突破");
}
/* 每个赛段检查一次「环境带来的成长」 */
function checkBreakthrough(){
  if(!S.team) return;
  const mates=myRoster().filter(x=>!x.me);
  const teamPw=power(myRoster(),0);
  // 待在强队：耳濡目染，指挥与运营的天花板会松
  if(teamPw>=60){ breakthrough("指挥",1.6,`在 <b>${S.team}</b> 这样的队里待着，你看事情的方式变了。`);
                  breakthrough("运营",1.2,`高强度的训练赛把你的判断磨快了。`); }
  // 队里有老将：有人手把手教
  const vet=mates.find(x=>x.age>=27);
  if(vet) breakthrough("指挥",2.4,`<b>${vet.id}</b> 在复盘里把他这些年的东西讲给了你。`,"vet"+vet.id);
  // 更衣室氛围好：心态托底
  if(typeof avgTrust==="function"&&avgTrust()>=68)
    breakthrough("心态",1.4,`这支队伍让你打得很放松。`);
  // 打满一个赛段不缺阵
  if(S.record.w+S.record.l>=WEEKS) breakthrough("体质",1.0,`一个赛段打满，身体扛住了。`);
}""")

# 全局把 cap(S.talent[x]) 换成 capOf(x)
s = re.sub(r"cap\(S\.talent\.(操作|运营|心态|指挥|体质)\)", lambda m: 'capOf("%s")' % m.group(1), s)
s = re.sub(r"cap\(S\.talent\[(d|dim|x)\]\)", lambda m: "capOf(%s)" % m.group(1), s)

# ---------- 触发点 ----------
# 签约时初始化
rep("  initTrust(); initSquad();", "  initTrust(); initSquad(); initCapBonus();")
# 赛段结束检查环境成长
rep("  trustDecay(); squadDecay();", "  trustDecay(); squadDecay(); checkBreakthrough();")
# 联赛夺冠
rep('    checkAch("lgtitle");',
    '    checkAch("lgtitle");\n    breakthrough("心态",3.2,"捧过一次奖杯之后，大场面对你来说不一样了。");')
# 逆风翻盘累计
rep("  if(won&&myPw-opPw<-2) S.comebacks=(S.comebacks||0)+1;   // 逆风翻盘计数",
    "  if(won&&myPw-opPw<-2){ S.comebacks=(S.comebacks||0)+1;   // 逆风翻盘计数\n"
    "    if(S.comebacks===3) breakthrough(\"心态\",3.0,\"你已经在落后的局面里赢过三次。队友开始相信你不会崩。\",\"cb3\"); }")

# ---------- 属性卡显示突破 ----------
rep("""      const c=capOf(d),v=S.attrs[d],d0=(S.seasonAttr0||{})[d]??v,g=v-d0;""",
    """      const c=capOf(d),v=S.attrs[d],d0=(S.seasonAttr0||{})[d]??v,g=v-d0;
      const cb=(S.capBonus&&S.capBonus[d])||0;""")
rep("""        <div class="vn mono"><b>${v.toFixed(1)}</b>${Math.abs(g)>=0.05?` <span class="${g>0?'up':'dn'}">${g>0?'+':''}${g.toFixed(1)}</span>`:""}</div>""",
    """        <div class="vn mono"><b>${v.toFixed(1)}</b><span style="color:var(--ink-3)">/${c.toFixed(0)}</span>${
          cb>=0.1?`<span style="color:var(--gold)" title="经历顶开的天花板">↑${cb.toFixed(0)}</span>`:""}${
          Math.abs(g)>=0.05?` <span class="${g>0?'up':'dn'}">${g>0?'+':''}${g.toFixed(1)}</span>`:""}</div>""")
rep("""    <p class="note">竖线是天赋瓶颈，绿数字是本赛季成长。""",
    """    <p class="note">竖线是当前瓶颈，<b style="color:var(--gold)">↑</b> 是被经历顶开的部分（夺冠、进强队、跟老将同队都会让它松动）。绿数字是本赛季成长。""")

if MISS:
    print("对不上的锚点 %d 处:" % len(MISS))
    for m in MISS:
        print("  -", m)
    raise SystemExit(1)

assert s != orig
io.open(p, "w", encoding="utf-8").write(s)
print("patch8 ok  |  capOf 替换", s.count("capOf("), "处")
