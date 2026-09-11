# -*- coding: utf-8 -*-
"""S6 纪元（2016 开局）的世界快照 -> data/csv/game_data_2016.json

    python data/build_era_2016.py

⚠⚠ 这份名单和数值是**手写的脚手架，不是爬来的**。⚠⚠
写它的环境连不上 Leaguepedia / Oracle's Elixir / Google Drive（代理只放行 GitHub），
所以 2016 的真实数据拿不到。头部战队的阵容基本可靠，中下游和小赛区把握不高，
战力评级（tier）全部是估的。**上线前必须用真实数据过一遍。**

怎么校对：下面 ROSTERS 就是全部的输入，改完重跑这个脚本即可。
每支队一行：("队名", 真实赛季胜率, [(ID, 位置, tier, 年龄), ...])
  · 胜率  —— 那一年常规赛的真实胜率，进战力（powerCore 的 wrAdj），这一项最影响格局
  · tier  —— 联赛内的相对档次，只有**相对大小**有意义：
              anchorLeague 会把每个联赛的均值钉到该纪元的赛区锚点（eras.ts 的 ANCHOR_S6），
              所以绝对值不用纠结，排序对就行。
              90=世界级 · 80=赛区顶尖 · 70=一线首发 · 60=中游 · 50=下游
  · 位置  —— top / jng / mid / bot / sup

标注 [估] 的是我把握不高、大概率要改的。
"""
import json, os, hashlib

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv"); os.makedirs(OUT, exist_ok=True)

DIMS = ["操作", "运营", "心态", "指挥", "体质"]
# 位置风格：在 tier 的基础上做维度重分配（总和≈0，不改均值）
POS_STYLE = {
    "top": {"操作": 1, "体质": 2, "运营": -1, "指挥": -2},
    "jng": {"运营": 2, "指挥": 2, "操作": -2, "体质": -2},
    "mid": {"操作": 2, "运营": 1, "体质": -2, "心态": -1},
    "bot": {"操作": 3, "体质": -1, "指挥": -2},
    "sup": {"指挥": 3, "运营": 1, "操作": -4},
}
POS_CN = {"top": "上单", "jng": "打野", "mid": "中单", "bot": "AD", "sup": "辅助"}

# ============================ 名单表（改这里） ============================
ROSTERS = {
"LCK": [
    ("SK Telecom T1", 0.75, [("Duke","top",78,21),("Bengi","jng",80,24),("Faker","mid",95,20),("Bang","bot",86,20),("Wolf","sup",84,22)]),
    ("ROX Tigers",    0.74, [("Smeb","top",90,22),("Peanut","jng",86,19),("Kuro","mid",78,21),("PraY","bot",88,22),("GorillA","sup",86,22)]),
    ("Samsung Galaxy",0.58, [("CuVee","top",80,20),("Ambition","jng",82,24),("Crown","mid",82,20),("Ruler","bot",80,18),("CoreJJ","sup",78,21)]),
    ("KT Rolster",    0.60, [("Ssumday","top",82,20),("Score","jng",80,25),("Nagne","mid",72,22),("Arrow","bot",76,22),("Hachani","sup",70,24)]),
    ("Jin Air Green Wings", 0.48, [("TrAce","top",70,23),("Chaser","jng",72,22),("Kuzan","mid",68,20),("Sky","bot",66,21),("Chei","sup",64,20)]),
    ("Afreeca Freecs",0.46, [("Sonstar","top",66,21),("Spirit","jng",74,22),("Mickey","mid",70,20),("Kramer","bot",72,21),("Snowflower","sup",68,25)]),   # [估] 上单
    ("Longzhu Gaming",0.40, [("Expession","top",68,22),("Crash","jng",66,19),("Fly","mid",72,21),("Emperor","bot",70,21),("Pure","sup",60,20)]),   # [估] 辅助
    ("MVP",           0.38, [("ADD","top",64,21),("Beyond","jng",66,20),("Ian","mid",62,20),("MaHa","bot",64,21),("Max","sup",60,22)]),
    ("CJ Entus",      0.34, [("Untara","top",62,20),("Bubbling","jng",60,21),("Sky","mid",60,23),("Sanha","bot",62,17),("Madlife","sup",70,24)]),
    ("Kongdoo Monster",0.27,[("Roach","top",58,21),("Punch","jng",56,22),("Edge","mid",56,21),("Secret","bot",58,20),("Sancho","sup",54,22)]),   # [估] 整队
],
"LPL": [
    ("Edward Gaming",      0.76, [("Koro1","top",78,23),("Clearlove","jng",84,23),("Scout","mid",78,19),("Deft","bot",86,20),("Meiko","sup",82,19)]),
    ("Royal Never Give Up",0.70, [("Looper","top",76,23),("Mlxg","jng",80,20),("Xiaohu","mid",78,19),("Uzi","bot",90,19),("Ming","sup",76,19)]),
    ("Qiao Gu Reapers",    0.62, [("V","top",72,21),("Swift","jng",74,22),("Doinb","mid",76,19),("Peco","bot",70,20),("Road","sup",68,20)]),
    ("Snake Esports",      0.58, [("Flandre","top",78,19),("Beast","jng",70,22),("sofM","mid",72,20),("kRYST4L","bot",74,21),("Ceng","sup",66,21)]),  # [估] sofM 当年打野/中单存疑
    ("Invictus Gaming",    0.54, [("Zzitai","top",70,21),("Kid","jng",68,21),("Rookie","mid",84,20),("Kitties","bot",68,21),("Yuzhe","sup",64,21)]),  # [估] 下路组合
    ("Team WE",            0.52, [("Aluka","top",68,22),("Condi","jng",74,20),("xiye","mid",74,19),("Mystic","bot",78,21),("Ben","sup",66,22)]),
    ("LGD Gaming",         0.44, [("Marin","top",80,23),("TBQ","jng",64,21),("GODV","mid",72,20),("imp","bot",78,21),("Pyl","sup",68,24)]),
    ("Vici Gaming",        0.42, [("Loong","top",62,21),("LoveLing","jng",62,20),("Easyhoon","mid",76,23),("Endless","bot",64,21),("Ley","sup",60,21)]),  # [估] 整队
    ("Newbee",             0.36, [("Cool","top",58,22),("Rat","jng",58,21),("Ivan","mid",60,20),("Sunny","bot",58,20),("Mor","sup",56,21)]),            # [估] 整队（名字待查）
    ("Masters3",           0.32, [("Fire","top",56,21),("Xiaopingguo","jng",58,20),("Mole","mid",56,20),("Time","bot",56,20),("Sipp","sup",54,21)]),    # [估] 整队（名字待查）
    ("Energy Pacemaker",   0.30, [("Nesta","top",54,21),("Karin","jng",54,21),("Blueberry","mid",54,20),("Ley2","bot",54,20),("Kaka","sup",52,21)]),    # [估] 整队（名字待查）
    ("Saint Gaming",       0.26, [("Tuo","top",52,21),("Wenwen","jng",52,20),("Yuki","mid",52,20),("Aster","bot",52,20),("Nine","sup",50,21)]),         # [估] 整队（名字待查）
],
"LMS": [
    ("Flash Wolves",   0.72, [("MMD","top",74,20),("Karsa","jng",84,19),("Maple","mid",82,20),("NL","bot",76,22),("SwordArT","sup",80,20)]),
    ("ahq e-Sports",   0.64, [("Ziv","top",78,21),("Mountain","jng",70,22),("Westdoor","mid",74,23),("AN","bot",68,20),("Albis","sup",66,21)]),
    ("J Team",         0.50, [("Rins","top",64,20),("Refra1n","jng",62,21),("FoFo","mid",70,17),("Wako","bot",62,20),("Jay","sup",60,21)]),      # [估]
    ("Machi Esports",  0.42, [("Hanabi","top",64,18),("Kongyue","jng",58,21),("M1ssion","mid",58,20),("Bebe","bot",68,24),("Koala","sup",60,23)]),  # [估]
    ("Hong Kong Esports",0.36,[("Dinter","top",56,21),("Crash2","jng",54,21),("Unified","mid",60,20),("Raiden","bot",56,20),("Kaiwing","sup",58,20)]),  # [估]
    ("eXtreme Gamers", 0.30, [("Kuma","top",52,21),("Bruce","jng",52,20),("Sofresh","mid",52,21),("Uniboy","bot",52,19),("Void","sup",50,21)]),   # [估]
],
"LEC": [   # 2016 年叫 EU LCS，这里沿用引擎的赛区代号
    ("G2 Esports",        0.70, [("Kikis","top",70,22),("Trick","jng",78,20),("Perkz","mid",80,18),("Emperor","bot",70,21),("Hybrid","sup",66,23)]),
    ("H2K Gaming",        0.66, [("Odoamne","top",74,21),("Jankos","jng",80,20),("Ryu","mid",74,23),("FORG1VEN","bot",78,22),("VandeR","sup",70,24)]),
    ("Fnatic",            0.54, [("Gamsu","top",68,21),("Spirit","jng",70,22),("Febiven","mid",76,19),("Rekkles","bot",82,19),("YellOwStaR","sup",72,26)]),
    ("Origen",            0.48, [("sOAZ","top",72,24),("Amazing","jng",66,22),("xPeke","mid",70,24),("Zven","bot",78,19),("Mithy","sup",74,22)]),
    ("Splyce",            0.50, [("Wunder","top",70,17),("Trashy","jng",62,20),("Sencux","mid",64,19),("Kobbe","bot",68,19),("Mikyx","sup",68,17)]),
    ("Unicorns of Love",  0.44, [("Vizicsacsi","top",68,22),("Move","jng",62,21),("Exileh","mid",62,20),("Veritas","bot",62,20),("Hylissang","sup",70,21)]),
    ("Team Vitality",     0.42, [("Cabochard","top",68,20),("Shook","jng",60,22),("Nukeduck","mid",68,21),("Hjarnan","bot",66,22),("Kasing","sup",64,22)]),
    ("Giants Gaming",     0.30, [("Werlyb","top",56,23),("Atila","jng",54,21),("Betsy","mid",56,21),("Adryh","bot",56,22),("Hustlin","sup",54,22)]),  # [估]
],
"LCS": [   # 2016 NA LCS
    ("Team SoloMid",      0.72, [("Hauntzer","top",72,21),("Svenskeren","jng",70,21),("Bjergsen","mid",84,20),("Doublelift","bot",80,22),("Biofrost","sup",68,19)]),
    ("Counter Logic Gaming",0.62,[("Darshan","top",72,21),("Xmithie","jng",70,24),("Huhi","mid",64,21),("Stixxay","bot",70,19),("aphromoo","sup",76,24)]),
    ("Immortals",         0.66, [("Huni","top",76,19),("Reignover","jng",76,22),("Pobelter","mid",68,21),("WildTurtle","bot",68,21),("Adrian","sup",66,21)]),
    ("Cloud9",            0.58, [("Impact","top",76,21),("Meteos","jng",68,22),("Jensen","mid",76,20),("Sneaky","bot",74,21),("Hai","sup",66,22)]),
    ("Team Liquid",       0.48, [("Lourlo","top",60,20),("Dardoch","jng",68,18),("Fenix","mid",66,22),("Piglet","bot",74,22),("Matt","sup",60,22)]),
    ("NRG Esports",       0.42, [("Quas","top",62,22),("Santorin","jng",62,20),("GBM","mid",64,22),("Ohq","bot",64,22),("KonKwon","sup",58,21)]),
    ("Echo Fox",          0.36, [("kfo","top",56,21),("Hard","jng",54,21),("Froggen","mid",72,23),("Keith","bot",58,19),("Big","sup",54,21)]),
    ("Phoenix1",          0.32, [("Zig","top",54,21),("Inori","jng",58,19),("Pirean","mid",56,21),("Arrow","bot",64,22),("Adrian2","sup",56,21)]),   # [估]
],
}

# 小赛区：2016 的名单我完全没有把握，用中性占位名，等真实数据替换。
# 队名用当年确实存在的组织，选手名一律占位（不冒充真人）。
MINOR = {
    "VCS":  ["GIGABYTE Marines", "Saigon Jokers", "Young Generation", "Cantho Cherry"],
    "LJL":  ["Rampage", "DetonatioN FocusMe", "Unsold Stuff Gaming", "Ozone Rampage"],
    "LLA":  ["Lyon Gaming", "Gaming Gaming", "Just Toys Havoks", "Zaga Talent"],
    "CBLOL":["INTZ e-Sports", "paiN Gaming", "Keyd Stars", "RED Canids"],
    "TCL":  ["SuperMassive", "Dark Passage", "Beşiktaş", "Galatasaray"],
}
MINOR_TIERS = [58, 54, 50, 47]     # 每个赛区四支队的档次
# ==========================================================================


def rng_for(seed_text):
    """按名字生成稳定的小抖动——同一份表每次跑出来的 JSON 完全一样"""
    h = hashlib.sha256(seed_text.encode("utf-8")).digest()
    return [(b / 255.0 - 0.5) * 2 for b in h[:8]]


def make_player(pid, pos, tier, age, team):
    jitter = rng_for(team + "/" + pid)
    style = POS_STYLE.get(pos, {})
    r = {}
    for i, d in enumerate(DIMS):
        v = tier + style.get(d, 0) + jitter[i] * 2.5
        r[d] = round(max(35, min(95, v)))
    ovr = round(sum(r.values()) / len(DIMS))
    return {"id": pid, "cn": "", "pos": pos, "posCn": POS_CN.get(pos, pos),
            "age": age, "r": r, "adapt": 50, "ovr": ovr, "form": 50}


def make_team(name, wr, players):
    ps = [make_player(pid, pos, tier, age, name) for (pid, pos, tier, age) in players]
    ovr = round(sum(p["ovr"] for p in ps) / len(ps), 1)
    # 默契 / 战术：强队更成型，和胜率挂钩（引擎里 syn/tac 的中位在 50 上下）
    syn = round(38 + (wr - 0.5) * 40)
    return {"name": name, "logo": None, "games": 60, "wr": round(wr, 3),
            "players": ps, "ovr": ovr, "syn": syn, "tac": syn + 4}


def main():
    leagues = {}
    for lg, teams in ROSTERS.items():
        leagues[lg] = [make_team(n, wr, ps) for (n, wr, ps) in teams]
    for lg, names in MINOR.items():
        leagues[lg] = []
        for i, n in enumerate(names):
            tier = MINOR_TIERS[i]
            # 占位选手：不冒充真人，名字一眼能看出是待补的
            ps = [(f"{lg}{i+1}{p.upper()}", p, tier, 20) for p in ("top", "jng", "mid", "bot", "sup")]
            leagues[lg].append(make_team(n, 0.62 - i * 0.09, ps))

    out = {
        "season": 2016,
        "major": ["LPL", "LCK", "LMS", "LEC", "LCS"],
        "minor": ["VCS", "LJL", "LLA", "CBLOL", "TCL"],
        "leagues": leagues,
        "legends": [   # 复出池：2016 时点已经淡出但还能回来的名字
            {"id": "MadLife", "cn": "洪民기", "pos": "sup", "age": 24, "r": {"操作": 60, "运营": 68, "心态": 62, "指挥": 74, "体质": 50}},
            {"id": "Looper",  "cn": "장형석", "pos": "top", "age": 23, "r": {"操作": 66, "运营": 66, "心态": 62, "指挥": 64, "体质": 56}},
            {"id": "Deft",    "cn": "김혁규", "pos": "bot", "age": 20, "r": {"操作": 78, "运营": 66, "心态": 64, "指挥": 60, "体质": 58}},
        ],
        "_scaffold": "手写脚手架，未经真实数据校对；见 data/build_era_2016.py 的表头",
    }
    path = os.path.join(OUT, "game_data_2016.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n_t = sum(len(v) for v in leagues.values())
    n_p = sum(len(t["players"]) for v in leagues.values() for t in v)
    print(f"写出 {path}")
    print(f"  {len(leagues)} 个赛区 · {n_t} 支队 · {n_p} 名选手")
    for lg in out["major"]:
        ts = sorted(leagues[lg], key=lambda t: -t["ovr"])
        print(f"  {lg:5s} 最强 {ts[0]['name']}({ts[0]['ovr']}) 最弱 {ts[-1]['name']}({ts[-1]['ovr']})")


if __name__ == "__main__":
    main()
