# -*- coding: utf-8 -*-
"""导出 demo 用的精简游戏数据: 2022 四大赛区首发阵容 + 五维评分 + 中文名。"""
import csv, os, json, collections
import base64, io, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv")
SRC = os.path.join(BASE, "oracleselixir", "2022_OE.csv")
POS = ("top", "jng", "mid", "bot", "sup")
POS_CN = {"top": "上单", "jng": "打野", "mid": "中单", "bot": "AD", "sup": "辅助"}
MAJOR = ["LPL", "LCK", "LEC", "LCS"]
# 小赛区: 用于世界赛入围赛名额(PCS/VCS/CBLOL/LJL/LLA/LCO/TCL)
MINOR = ["PCS", "VCS", "CBLOL", "LJL", "LLA", "LCO", "TCL"]
LEAGUES = {k: k for k in MAJOR + MINOR}

# 中文名
cn = {}
for r in csv.DictReader(open(os.path.join(OUT, "players_master.csv"), encoding="utf-8-sig")):
    k = (r.get("player_id") or "").lower()
    if k and r.get("name_cn"):
        cn[k] = r["name_cn"]

# 评分
rate = {r["player_id"]: r for r in csv.DictReader(
    open(os.path.join(OUT, "ratings_v2_final.csv"), encoding="utf-8-sig"))}

# 出场统计: (league, team, pos, player) -> games
cnt = collections.Counter()
teamgames = collections.Counter()
teamwins = collections.Counter()
with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        lg = row.get("league")
        if lg not in LEAGUES:
            continue
        tn = row.get("teamname")
        if not tn or tn == "unknown team":
            continue
        if row.get("position") == "team":
            teamgames[(lg, tn)] += 1
            if row.get("result") == "1":
                teamwins[(lg, tn)] += 1
            continue
        if row.get("position") in POS and row.get("playername"):
            cnt[(lg, tn, row["position"], row["playername"])] += 1

# 每队每位置取出场最多的选手
byteam = collections.defaultdict(dict)
for (lg, tn, pos, nm), g in cnt.items():
    cur = byteam[(lg, tn)].get(pos)
    if cur is None or g > cur[1]:
        byteam[(lg, tn)][pos] = (nm, g)

DIMS = ["操作", "运营", "心态", "指挥", "体质"]

# ---- 队标 ----
# data/logos/ 下有 72 个队标, 但一直没有进过游戏数据: 导出脚本压根没处理它,
# 于是每支队的 logo 都是 undefined, teamLogo() 永远返回空字符串。
# 原图平均 68KB(最大的 3508x2481), 直接内嵌会让单文件涨到 5MB 以上,
# 所以统一缩到 40x40 再转 data URI —— 161KB, 界面上只显示 20-40px, 够用。
def _logo_key(name):
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower()

def load_logos():
    out = {}
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logos")
    if not os.path.isdir(d):
        return out
    try:
        from PIL import Image
    except ImportError:
        print("!! 没装 Pillow, 跳过队标内嵌")
        return out
    for fn in os.listdir(d):
        if not fn.lower().endswith(".png"):
            continue
        try:
            im = Image.open(os.path.join(d, fn)).convert("RGBA")
            im.thumbnail((40, 40), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            out[_logo_key(os.path.splitext(fn)[0])] = (
                "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
        except Exception as e:
            print("!! 队标处理失败", fn, e)
    return out

LOGOS = load_logos()

# 评分是在「同位置 x 同层级」内做的 z 标准化, 跨赛区不可直接比较:
# VCS 的第一名在 VCS 内是顶级 -> 高分, 但真实实力远低于 LPL/LCK 第一。
# 按历史国际赛战绩给赛区强度修正, 把各赛区拉回同一把尺子。
REGION_ADJ = {"LPL": 0, "LCK": 0, "LEC": -4, "LCS": -7,
              "PCS": -9, "VCS": -9, "TCL": -11, "CBLOL": -11,
              "LJL": -12, "LLA": -13, "LCO": -13}
out = {"season": 2022, "major": MAJOR, "minor": MINOR, "leagues": {}}
for lg in LEAGUES:
    teams = []
    for (l, tn), roster in byteam.items():
        if l != lg or len(roster) < 5:
            continue
        tg = teamgames[(lg, tn)]
        if tg < (20 if lg in MAJOR else 14):
            continue
        players = []
        stab_num = 0.0
        for pos in POS:
            nm, g = roster[pos]
            stab_num += g / max(1, tg)          # 该位置首发占比
            rr = rate.get(nm, {})
            players.append({
                "id": nm,
                "cn": cn.get(nm.lower(), ""),
                "pos": pos,
                "posCn": POS_CN[pos],
                "age": int(rr["年龄"]) if rr.get("年龄") else None,
                "r": {d: max(20, min(99, round(float(rr[d]) + REGION_ADJ.get(lg, -10))))
                      if rr.get(d) else 50 + REGION_ADJ.get(lg, -10) for d in DIMS},
                "adapt": round(float(rr["适应力"])) if rr.get("适应力") else 50,
                "ovr": (max(20, min(99, round(float(rr["总评"]) + REGION_ADJ.get(lg, -10))))
                        if rr.get("总评") else 50 + REGION_ADJ.get(lg, -10)),
                # 状态: 当年打成什么样, 与「能力」分开。
                # 用当季胜率相对该联赛均值的偏离来标定——
                # 「今年打得差」不等于「这个人变弱了」。
                "form": None,   # 下面按队伍统一填
            })
        teams.append({
            "_stab": min(1.0, stab_num / 5.0),
            "name": tn,
            "logo": LOGOS.get(_logo_key(tn)),
            "games": tg,
            "wr": round(teamwins[(lg, tn)] / tg, 3),
            "players": players,
            "ovr": round(sum(p["ovr"] for p in players) / 5, 1),
        })
    # ---- 从真实数据反推战队的「默契 / 战术」 ----
    # 思路和拟合「指挥」一样：一支队的实际胜率若高于五名选手个人数值
    # 应有的水平, 说明他们在团队层面(配合与准备)占了便宜, 反之亦然。
    if teams:
        import statistics as _st
        for t in teams:
            t["_base"] = sum(
                p["r"]["操作"] * .34 + p["r"]["运营"] * .28
                + p["r"]["心态"] * .14 + p["r"]["体质"] * .10
                for p in t["players"]) / 5.0
        bs = [t["_base"] for t in teams]
        ws = [t["wr"] for t in teams]
        bmu = sum(bs) / len(bs)
        bsd = _st.pstdev(bs) or 1.0
        wmu = sum(ws) / len(ws)
        wsd = _st.pstdev(ws) or 1.0
        for t in teams:
            zb = (t["_base"] - bmu) / bsd          # 个人数值该有的水平
            zw = (t["wr"] - wmu) / wsd             # 实际打出来的水平
            resid = zw - zb                        # 差额 = 团队层面的加成
            # 残差拆成默契与战术: 默契偏向执行, 战术偏向准备,
            # 用赛季内阵容稳定度把两者分开(阵容越稳 -> 默契占比越高)
            stab = t.get("_stab", 0.5)
            syn = 50 + resid * 9 * (0.5 + stab * 0.5)
            tac = 50 + resid * 9 * (1.0 - stab * 0.5)
            t["syn"] = max(28, min(78, round(syn)))
            t["tac"] = max(28, min(78, round(tac)))
            # ---- 状态 ----
            # 队伍的实际表现相对其个人数值应有的水平 -> 全队状态基准；
            # 再叠加个人当季数据的偏离。能力是生涯水位, 状态是今年。
            tform = 52 + resid * 17
            for p in t["players"]:
                pv = (p["r"]["操作"] * .34 + p["r"]["运营"] * .28
                      + p["r"]["心态"] * .14 + p["r"]["体质"] * .10)
                dev = (pv - t["_base"]) * 1.15        # 队内相对高低
                p["form"] = max(30, min(94, round(tform + dev)))
            t.pop("_base", None); t.pop("_stab", None)

    teams.sort(key=lambda t: -t["ovr"])
    # 小赛区只保留最强的 4 支，够入围赛用即可
    out["leagues"][lg] = teams if lg in MAJOR else teams[:4]

# ---- 传奇复出池 ----
# 只用经过核对的退役名单。不使用 players_master 的 is_retired 批量筛选:
# 那个字段是「截至 2026 已退役」, 会把 2022 仍在役的选手(Peanut/Yagao 等)误判为可复出。
retired_cn = {}
for r in csv.DictReader(open(os.path.join(OUT, "players_master.csv"), encoding="utf-8-sig")):
    k = (r.get("player_id") or "").lower()
    cn = r.get("name_cn") or ""
    # 同名多条时优先保留有中文名的那条(如 Uzi 有选手与解说两条)
    if k and (k not in retired_cn or (cn and not retired_cn[k][0])):
        retired_cn[k] = (cn, (r.get("birthdate") or "")[:4])

# id, 位置, 出生年, 操作 运营 心态 指挥 体质
CURATED = [
    ("Uzi",      "bot", 1997, 64, 57, 58, 66, 46),
    ("Mlxg",     "jng", 1996, 58, 60, 54, 64, 42),
    ("Ning",     "jng", 1998, 60, 55, 52, 58, 47),
    ("Baolan",   "sup", 1999, 52, 60, 55, 60, 52),
    ("Zz1tai",   "top", 1997, 55, 57, 53, 61, 49),
    ("Letme",    "top", 1996, 53, 61, 56, 62, 48),
    ("Condi",    "jng", 1996, 55, 58, 50, 60, 45),
    ("Koro1",    "top", 1994, 54, 59, 55, 63, 44),
    ("Mata",     "sup", 1994, 53, 63, 57, 68, 44),
    ("PraY",     "bot", 1994, 58, 56, 55, 60, 43),
    ("Smeb",     "top", 1995, 59, 55, 52, 58, 45),
    ("Wolf",     "sup", 1996, 52, 59, 54, 62, 46),
    ("Bang",     "bot", 1996, 60, 54, 53, 57, 46),
    ("Looper",   "top", 1993, 53, 56, 52, 59, 42),
    ("Clearlove","jng", 1993, 50, 62, 54, 70, 40),
    ("Rookie",   "mid", 1997, 63, 60, 57, 62, 48),
]
legends = []
for pid, pos, by, a1, a2, a3, a4, a5 in CURATED:
    cn = retired_cn.get(pid.lower(), ("", ""))[0]
    legends.append({
        "id": pid, "cn": cn, "pos": pos, "age": 2022 - by,
        "r": {"操作": a1, "运营": a2, "心态": a3, "指挥": a4, "体质": a5},
    })
out["legends"] = legends

path = os.path.join(OUT, "game_data_2022.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("导出:", path, os.path.getsize(path), "bytes")
print("传奇复出池:", len(out["legends"]))
for x in out["legends"]:
    print(f"    {x['id']:<11}{x['cn'] or '(无中文名)':<10}{x['pos']:<5}{x['age']} 岁")
for lg, ts in out["leagues"].items():
    print(f"  {lg}: {len(ts)} 队")
    for t in ts[:3]:
        print(f"     {t['name']:<26} 总评 {t['ovr']:<6} 真实胜率 {t['wr']}")
