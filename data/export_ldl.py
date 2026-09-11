"""LDL 真实名单：2022–2025 每年一页，给 demo/src/ldl.ts 用（作者 2026-09-11：「大修，按照真实的名单更新，我们游戏主打真实」）。

每一页：当年第一个常规赛段在打的队伍、队名（Leaguepedia 当年的正式名）、简称、母队（LPL 俱乐部，独立队为空）、
五个首发（第一个常规赛段出场最多的人）、评分（五维，和主联赛同一把尺）。
  · 2022–2024：首发看 Oracle's Elixir（league == LDL）；2022 取 Spring，2023/2024 取 Split 1。
  · 2025：OE 里没有 LDL，队伍和首发用 Leaguepedia 名单登记（rosters_LDL.csv 的「LDL 2025 Split 1」）。
  · 评分：ratings_v2_LDL[_年].csv；缺的依次找往年 LDL、当年和往年 LPL 评分；都没有就留空，游戏里按队伍强度补。
数值在游戏里还会按母队重新锚定（强度带和原来一样），这里只负责「是谁、在哪支队」。

用法：POXIAO_OE_DIR=<比赛数据目录> python data/export_ldl.py  → data/csv/ldl_pages.json
"""
import collections, csv, json, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(BASE, "csv")
OE_DIR = os.environ.get("POXIAO_OE_DIR", os.path.join(BASE, "oracleselixir"))
DIMS = ["操作", "运营", "心态", "指挥", "体质"]
POS = {"top", "jng", "mid", "bot", "sup"}
LP_ROLE = {"Top": "top", "Jungle": "jng", "Mid": "mid", "Bot": "bot", "Support": "sup"}

# OE 的叫法 → Leaguepedia 当年的正式队名（其余同名）
def display_name(oe_name, year):
    if oe_name == "Oh My God Academy":
        return "Oh My Dream" if year <= 2023 else "Oh My God Academy"
    return {
        "EDG Youth Team": "EDward Gaming Youth Team",
        "Ji Jie Hao (集结号)": "Ji Jie Hao",
        "MiaoJing (妙竞)": "MiaoJing",
        "MAX (Chinese Team)": "MAX",
    }.get(oe_name, oe_name)

# 简称（teams_master.csv 有的照抄；没有的按 Leaguepedia 惯例）
SHORT = {
    "Anyone's Legend.Young": "AL.Y", "Bilibili Gaming Junior": "BLG.J", "EDward Gaming Youth Team": "EDG.Y",
    "FunPlus Phoenix Blaze": "FPB", "Invictus Gaming Young": "IGY", "Joy Dream": "JDM", "LGD Gaming Young Team": "LGD.Y",
    "LNG Academy": "LNG.A", "Oh My Dream": "OMD", "Oh My God Academy": "OMG.A", "Rare Atom Period": "RAP",
    "Royal Club": "RYL", "Team WE Academy": "WE.A", "ThunderTalk Gaming Young": "TT.Y", "Top Esports Challenger": "TES.C",
    "Ultra Prime Academy": "UPA", "V5 87": "87", "Weibo Gaming Youth Team": "WBG.Y",
    "MAX": "MAX", "Qing Jiu E-sport Club": "Q9", "Shu Dai Xiong Gaming": "SDX", "TEAM ORANGE": "TO", "TWELVE": "12",
    "Team Pinnacle": "TP", "Young Miracles": "YM", "Ji Jie Hao": "JJH", "MiaoJing": "MJ",
}
# 二队 → 母队（LPL 俱乐部名，和游戏里的队名一致）；不在表里的是独立队
PARENT = {
    "Anyone's Legend.Young": "Anyone's Legend", "Bilibili Gaming Junior": "Bilibili Gaming",
    "EDward Gaming Youth Team": "EDward Gaming", "FunPlus Phoenix Blaze": "FunPlus Phoenix",
    "Invictus Gaming Young": "Invictus Gaming", "Joy Dream": "JD Gaming", "LGD Gaming Young Team": "LGD Gaming",
    "LNG Academy": "LNG Esports", "Oh My Dream": "Oh My God", "Oh My God Academy": "Oh My God",
    "Rare Atom Period": "Rare Atom", "Royal Club": "Royal Never Give Up", "Team WE Academy": "Team WE",
    "ThunderTalk Gaming Young": "ThunderTalk Gaming", "Top Esports Challenger": "Top Esports",
    "Ultra Prime Academy": "Ultra Prime", "V5 87": "Victory Five", "Weibo Gaming Youth Team": "Weibo Gaming",
}
LPL_2022 = ["Royal Never Give Up", "JD Gaming", "Top Esports", "Victory Five", "EDward Gaming", "Weibo Gaming",
            "LNG Esports", "Bilibili Gaming", "Oh My God", "FunPlus Phoenix", "Rare Atom", "Invictus Gaming",
            "ThunderTalk Gaming", "Anyone's Legend", "LGD Gaming", "Ultra Prime", "Team WE"]


def read_csv(name):
    p = os.path.join(CSV, name)
    return list(csv.DictReader(open(p, encoding="utf-8-sig"))) if os.path.exists(p) else []


def rating_table(name):
    return {(r.get("player_id") or "").lower(): r for r in read_csv(name) if r.get("player_id")}


RATE_LDL = {2022: rating_table("ratings_v2_LDL.csv")}
RATE_LPL = {2022: rating_table("ratings_v2_final.csv")}
for y in (2023, 2024, 2025):
    RATE_LDL[y] = rating_table(f"ratings_v2_LDL_{y}.csv")
    RATE_LPL[y] = rating_table(f"ratings_v2_final_{y}.csv")

cn, birth = {}, {}
for r in read_csv("players_master.csv"):
    k = (r.get("player_id") or "").lower()
    if k and r.get("name_cn") and k not in cn:
        cn[k] = r["name_cn"]
    bd = r.get("birthdate") or ""
    if k and len(bd) >= 4 and bd[:4].isdigit():
        birth.setdefault(k, int(bd[:4]))


def lpl_names(year):
    if year == 2022:
        return set(LPL_2022)
    p = json.load(open(os.path.join(CSV, f"timeline_{year}.json"), encoding="utf-8"))
    return {t["n"] for t in p["leagues"].get("LPL", [])}


def rate_player(pid, year):
    k = pid.lower()
    for yy in range(year, 2021, -1):
        for tab in (RATE_LDL.get(yy, {}), RATE_LPL.get(yy, {})):
            r = tab.get(k)
            if r:
                try:
                    dims = [round(float(r[d]), 1) for d in DIMS]
                except (KeyError, ValueError):
                    continue
                age = None
                if (r.get("年龄") or "").isdigit():
                    age = int(r["年龄"]) + (year - yy)
                return dims, age, yy
    return None, None, None


def oe_first_split(year, split):
    """OE：该赛段每支队每个位置的出场局数。"""
    path = os.path.join(OE_DIR, f"{year}_OE.csv")
    games = collections.defaultdict(collections.Counter)
    with open(path, encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh):
            if row.get("league") != "LDL" or row.get("split") != split:
                continue
            pos = row.get("position")
            if pos in POS and row.get("playername"):
                games[row["teamname"]][(pos, row["playername"])] += 1
    teams = {}
    for tn, cnt in games.items():
        starters = {}
        for (pos, name), n in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0][1].lower())):
            starters.setdefault(pos, name)
        teams[tn] = [(p, starters[p]) for p in ("top", "jng", "mid", "bot", "sup") if p in starters]
    return teams


def lp_split(year, tournament):
    rows = [r for r in read_csv("rosters_LDL.csv") if r.get("year") == str(year) and r.get("tournament") == tournament]
    teams = collections.OrderedDict()
    for r in rows:
        role = (r.get("role") or "").split(",")[0].strip()
        pos = LP_ROLE.get(role)
        if not pos:
            continue
        pid = re.sub(r"\s*\(.*?\)\s*$", "", r.get("player_id") or "").strip()
        if not pid:
            continue
        slots = teams.setdefault(r["team"], {})
        slots.setdefault(pos, pid)
    return {tn: [(p, s[p]) for p in ("top", "jng", "mid", "bot", "sup") if p in s] for tn, s in teams.items()}


SOURCES = {2022: ("oe", "Spring"), 2023: ("oe", "Split 1"), 2024: ("oe", "Split 1"), 2025: ("lp", "LDL 2025 Split 1")}
out = {"src": "Oracle's Elixir 2022–2024 首个常规赛段出场 + Leaguepedia 2025 Split 1 名单登记；评分 ratings_v2_LDL / ratings_v2_final", "years": {}}
problems = []
for year, (kind, split) in SOURCES.items():
    raw = oe_first_split(year, split) if kind == "oe" else lp_split(year, split)
    lpl = lpl_names(year)
    page = []
    for tn in sorted(raw, key=lambda n: display_name(n, year).lower()):
        name = display_name(tn, year)
        par = PARENT.get(name)
        if par and par not in lpl:
            problems.append(f"{year} {name}: 母队 {par} 不在当年 LPL，按独立队处理")
            par = None
        if name not in SHORT:
            problems.append(f"{year} {name}: 没有简称")
        players, rated = [], 0
        for pos, pid in raw[tn]:
            dims, age, _ = rate_player(pid, year)
            if dims:
                rated += 1
            if age is None and pid.lower() in birth:
                age = year - birth[pid.lower()]
            players.append([pid, cn.get(pid.lower(), ""), pos, age, dims])
        if len(players) < 5:
            problems.append(f"{year} {name}: 只找到 {len(players)} 个首发")
        page.append({"n": name, "s": SHORT.get(name, name[:4].upper()), "par": par, "p": players, "rated": rated})
    out["years"][str(year)] = page

json.dump(out, open(os.path.join(CSV, "ldl_pages.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for y, page in out["years"].items():
    acad = sum(1 for t in page if t["par"])
    print(f"{y}: {len(page)} 支（二队 {acad} · 独立 {len(page) - acad}）· 有评分的首发 {sum(t['rated'] for t in page)}/{sum(len(t['p']) for t in page)}")
for p in problems:
    print("  注意：" + p)
