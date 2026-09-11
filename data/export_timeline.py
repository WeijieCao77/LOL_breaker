# -*- coding: utf-8 -*-
"""真实时间线：把某一年的真实名单导成游戏能读的「一页」（2026-09-10）。

游戏开局用的是 2022 年的真实快照（export_game.py）。这一页在每年休赛期换上：
你影响不到的队伍，名单就是那一年真实的首发。

两种来源，自动选：
  oe      有 Oracle's Elixir 当年的比赛数据 + 同一把尺跑出来的评分（fit_v2 → fit_impact → blend_v2 → fix_v2）。
          口径和 export_game.py 完全一致：第一个赛段出场最多的五个人、赛区强度修正、从真实胜率反推默契/战术/状态。
          （2022 年用这个脚本重导，218 名同一选手的五维与线上版逐个相同。）
  roster  没有比赛数据时的后备：Leaguepedia 名单登记（rosters_by_season.csv）。
          首发 = 第一个赛段登记次数最多的人；评分沿用此人最近一年量出来的数（按年龄成长/衰退推到今年），
          从没量过的人按本队均值估。胜率未知，按 0.5。数据到了之后重导即可覆盖。

一页里写的都是「统一标尺上的原始值」，赛区锚定在游戏里做（和开局那份一样走 anchorLeague）。

赛区结构按真实年份走（STRUCT）：
  2023 起 LCO / TCL 不再有国际赛名额（联赛本身还在）；
  2025 年 LCS 改名 LTA 北区，CBLOL + LLA 并成 LTA 南区，PCS / VCS / LJL 的头部队伍并入 LCP；
  2026 年 LTA 拆回 LCS 与 CBLOL。LDL 在 2026 年的数据里已经没有了（由游戏决定怎么收尾）。

用法：POXIAO_YEAR=2024 POXIAO_OE_DIR=<比赛数据目录> python export_timeline.py
逐年按顺序导（每一页的席位继承要读上一页）。
"""
import csv, os, re, json, collections, statistics as st

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv")
YEAR = int(os.environ.get("POXIAO_YEAR", "2023"))
OE_DIR = os.environ.get("POXIAO_OE_DIR", os.path.join(BASE, "oracleselixir"))
FORCE = os.environ.get("POXIAO_TL_SOURCE", "")          # 可强制 oe / roster

POS = ("top", "jng", "mid", "bot", "sup")
LP_ROLE = {"Top": "top", "Jungle": "jng", "Mid": "mid", "Bot": "bot", "Support": "sup"}
DIMS = ["操作", "运营", "心态", "指挥", "体质"]

# 游戏里的赛区键。major = 有积分榜和季后赛；minor = 只取前 4 支；intl = 冠军有世界赛名额的小赛区
# rename / merge：上一年的赛区键 → 今年的（你的队在被合并的赛区里时跟着走）
_OLD7 = ["PCS", "VCS", "CBLOL", "LJL", "LLA", "LCO", "TCL"]
STRUCT = {
    2022: dict(major=["LPL", "LCK", "LEC", "LCS"], minor=_OLD7, intl=_OLD7),
    2023: dict(major=["LPL", "LCK", "LEC", "LCS"], minor=_OLD7, intl=["PCS", "VCS", "CBLOL", "LJL", "LLA"]),
    2024: dict(major=["LPL", "LCK", "LEC", "LCS"], minor=_OLD7, intl=["PCS", "VCS", "CBLOL", "LJL", "LLA"]),
    2025: dict(major=["LPL", "LCK", "LEC", "LTA北"], minor=["LCP", "LTA南", "PCS", "VCS", "LJL", "TCL"], intl=["LCP", "LTA南"],
               rename={"LCS": "LTA北"}, merge={"CBLOL": "LTA南", "LLA": "LTA南", "LCO": "LCP"}),
    2026: dict(major=["LPL", "LCK", "LEC", "LCS"], minor=["LCP", "CBLOL", "PCS", "VCS", "LJL", "TCL"], intl=["LCP", "CBLOL"],
               rename={"LTA北": "LCS"}, merge={"LTA南": "CBLOL"}),
}
# 游戏赛区键 → 数据里的联赛代码（Oracle's Elixir 与 Leaguepedia 各一套；同名不写）
SRC_CODES = {"LTA北": ["LTA N", "LTA North"], "LTA南": ["LTA S", "LTA South"]}
codes = lambda key: SRC_CODES.get(key, [key])
# 赛区强度修正（与 export_game.py 同表；新赛区按它接替的老赛区给）
REGION_ADJ = {"LPL": 0, "LCK": 0, "LEC": -4, "LCS": -7,
              "PCS": -9, "VCS": -9, "TCL": -11, "CBLOL": -11,
              "LJL": -12, "LLA": -13, "LCO": -13,
              "LTA北": -7, "LTA南": -11, "LCP": -9, "LTA N": -7, "LTA S": -11}
# 二级 / 青训联赛：强度修正 + 新秀归属的大区（游戏里再落到当年的赛区键）
ACAD = {  # OE 代码
    "LDL": ("CN", -10), "LCKC": ("KR", -8), "EM": ("EU", -12), "NACL": ("NA", -14), "CBLOLA": ("BR", -16), "LAS": ("LAT", -16),
    # Leaguepedia 代码
    "LCK CL": ("KR", -8), "LCK Academy": ("KR", -12), "EMEA Masters": ("EU", -12), "Circuito Desafiante": ("BR", -16),
    "CBLOL Academy": ("BR", -16), "LCP Wildcard": ("PAC", -14), "PCL": ("PAC", -14), "CD": ("BR", -16),
}
# 席位易主（Oracle's Elixir 的 teamid 变了、但接的是同一个联赛席位）：今年的队名 → 上一年的队名
SUCC = {
    2023: {"Ninjas in Pyjamas": "Victory Five", "Team Heretics": "Misfits Gaming",
           "KOI": "Rogue", "NRG": "Counter Logic Gaming", "Team Whales": "Team Secret"},
    2024: {"Karmine Corp": "Astralis", "Shopify Rebellion": "TSM", "Rogue": "KOI"},
    2026: {"Shifters": "Rogue", "Natus Vincere": "Team BDS"},
}
# 同一家俱乐部换赞助商 / 改名（Leaguepedia 按当年的名字登记）→ 游戏里一直沿用的名字
ALIAS = {"DRX": "Kiwoom DRX", "FearX": "Liiv SANDBOX", "BNK FEARX": "Liiv SANDBOX",
         "OKSavingsBank BRION": "HANJIN BRION", "BRION": "HANJIN BRION",
         "Kwangdong Freecs": "DN SOOPers", "DN Freecs": "DN SOOPers",
         "Ninjas in Pyjamas.CN": "Ninjas in Pyjamas", "Evil Geniuses.NA": "Evil Geniuses",
         "MAD Lions": "MAD Lions KOI", "Movistar KOI": "MAD Lions KOI", "GIANTX": "Excel Esports",
         "TALON": "PSG Talon", "Team Secret Whales": "Team Whales"}
# 查改名表不分大小写 / 标点（Oracle's Elixir 写 GiantX，Leaguepedia 写 GIANTX）
ALIAS_N = {re.sub(r"[^a-z0-9]", "", k.lower()): v for k, v in ALIAS.items()}
alias = lambda n: ALIAS.get(n) or ALIAS_N.get(re.sub(r"[^a-z0-9]", "", (n or "").lower()))
# 今年的赛区还从上一年哪些赛区接队伍（改名 / 合并之外：各地区头部队伍升进 LCP）
FEEDS = {2025: {"LCP": ["PCS", "VCS", "LJL", "LCO"]}, 2026: {"LCP": ["PCS", "VCS", "LJL"]}}
FIRST_SPLITS = ["Spring", "Winter", "Split 1", "Opening"]


def fnum(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def norm_team(n):
    n = (n or "").lower()
    n = re.sub(r"\s*\(.*?\)\s*", "", n)
    n = re.sub(r"\.(cn|na|kr|eu|vn|jp|br)$", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


S = STRUCT[YEAR]
want_keys = S["major"] + S["minor"]

# ---- 选手中文名 / 生日 ----
cn, birth = {}, {}
for r in csv.DictReader(open(os.path.join(OUT, "players_master.csv"), encoding="utf-8-sig")):
    k = (r.get("player_id") or "").lower()
    if k and r.get("name_cn") and k not in cn:
        cn[k] = r["name_cn"]
    bd = (r.get("birthdate") or "").strip()
    if k and len(bd) >= 4 and bd[:4].isdigit() and 1985 <= int(bd[:4]) <= 2012:
        birth.setdefault(k, int(bd[:4]))
roster_rows = list(csv.DictReader(open(os.path.join(OUT, "rosters_by_season.csv"), encoding="utf-8-sig")))
for r in roster_rows:
    k = (r.get("player_id") or "").lower()
    if k and r.get("name_cn") and k not in cn:
        cn[k] = r["name_cn"]
    bd = (r.get("birthdate") or "").strip()
    if k and len(bd) >= 4 and bd[:4].isdigit() and 1985 <= int(bd[:4]) <= 2012:
        birth.setdefault(k, int(bd[:4]))


def load_ratings(y):
    p = os.path.join(OUT, "ratings_v2_final.csv" if y == 2022 else f"ratings_v2_final_{y}.csv")
    if not os.path.exists(p):
        return {}
    return {r["player_id"].lower(): r for r in csv.DictReader(open(p, encoding="utf-8-sig"))}


RATE = {y: load_ratings(y) for y in range(2022, YEAR + 1)}
src_oe = os.path.join(OE_DIR, f"{YEAR}_OE.csv")
SOURCE = FORCE or ("oe" if os.path.exists(src_oe) and RATE.get(YEAR) else "roster")


def age_of(pid, fallback=None):
    by = birth.get(pid.lower())
    return (YEAR - by) if by else fallback


def dev_per_year(age):
    return 2.5 if age <= 21 else 1.5 if age <= 23 else 0.5 if age <= 25 else 0.0 if age <= 27 else -1.0


def carried(pid):
    """最近一年量出来的五维（统一标尺）按年龄推到今年；从没量过返回 None"""
    for y in range(YEAR, 2021, -1):
        row = RATE.get(y, {}).get(pid.lower())
        if not row or not row.get("总评"):
            continue
        lg, tier = row.get("league", ""), row.get("tier", "")
        adj = REGION_ADJ.get(lg, ACAD[lg][1] if lg in ACAD else (-14 if tier == "2" else -18))
        r = {d: float(row[d]) + adj for d in DIMS if row.get(d)}
        if len(r) < 5:
            continue
        a = age_of(pid, None)
        for k in range(YEAR - y):
            step = dev_per_year((a - (YEAR - y) + k) if a else 24)
            r = {d: v + step for d, v in r.items()}
        return r, y
    return None, None


def pl(pid, pos, r, age, form=52):
    return [pid, cn.get(pid.lower(), ""), pos, age, [max(20, min(99, round(r[d]))) for d in DIMS], form]


# ---- 上一页（席位继承用）----
if YEAR == 2023:
    g = json.load(open(os.path.join(OUT, "game_data_2022.json"), encoding="utf-8"))
    PREV = {lg: [{"n": t["name"], "ids": [p["id"].lower() for p in t["players"]]} for t in ts] for lg, ts in g["leagues"].items()}
else:
    pp = json.load(open(os.path.join(OUT, f"timeline_{YEAR - 1}.json"), encoding="utf-8"))
    PREV = {lg: [{"n": t["n"], "ids": [p[0].lower() for p in t["p"]]} for t in ts] for lg, ts in pp["leagues"].items()}


def prev_keys(key):
    """今年的赛区 key 在上一年对应哪些赛区（含改名、合并）"""
    ks = [k for k in PREV if k == key or S.get("rename", {}).get(k) == key or S.get("merge", {}).get(k) == key]
    ks += [k for k in FEEDS.get(YEAR, {}).get(key, []) if k in PREV and k not in ks]
    return ks or [key]


def in_prev(key, name):
    return bool(name) and any(t["n"] == name for k in prev_keys(key) for t in PREV.get(k, []))


def match_prev(key, name, ids):
    """按队名（去掉地区后缀）和首发重合度找上一年的席位；找不到返回 None"""
    ids = set(i.lower() for i in ids)
    best, bs = None, 0
    for k in prev_keys(key):
        for t in PREV.get(k, []):
            a, b = norm_team(t["n"]), norm_team(name)
            sc = (10 if a == b or (min(len(a), len(b)) >= 4 and (a in b or b in a)) else 0) + len(ids & set(t["ids"]))
            if sc > bs:
                best, bs = t["n"], sc
    return best if bs >= 3 else None


# 当年打过 MSI / 世界赛的队（小赛区只留 4 支时优先留它们）
INTL_NAMES = set()
for fn in ("rosters_Worlds.csv", "rosters_MSI.csv"):
    p = os.path.join(OUT, fn)
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            if r.get("year") == str(YEAR):
                INTL_NAMES.add(norm_team(r["team"]))
                INTL_NAMES.add(norm_team(ALIAS.get(r["team"], r["team"])))
intl_hit = lambda n: 1 if n and norm_team(n) in INTL_NAMES else 0


leagues, report = {}, {}

if SOURCE == "oe":
    rate = RATE[YEAR]
    prev_tid = {}
    prev_oe = os.path.join(OE_DIR, f"{YEAR - 1}_OE.csv")
    if os.path.exists(prev_oe):
        with open(prev_oe, encoding="utf-8", errors="replace") as fh:
            for row in csv.DictReader(fh):
                if row.get("position") == "team" and row.get("teamid"):
                    prev_tid.setdefault(row["teamid"], row.get("teamname"))
    code2key = {c: k for k in want_keys for c in codes(k)}
    split_min = collections.defaultdict(dict)
    cnt_split, cnt_year = collections.Counter(), collections.Counter()
    tgames, twins, tgames_split, tname = collections.Counter(), collections.Counter(), collections.Counter(), {}
    acad = collections.Counter()
    with open(src_oe, encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            code = row.get("league") or ""
            if code in ACAD and row.get("position") in POS and row.get("playername"):
                acad[(code, row["playername"], row["position"])] += 1
            key = code2key.get(code)
            if not key:
                continue
            tid = row.get("teamid") or row.get("teamname")
            sp, dt = row.get("split") or "", (row.get("date") or "")[:10]
            if row.get("position") == "team":
                tname[(key, tid)] = row.get("teamname")
                tgames[(key, tid)] += 1
                twins[(key, tid)] += 1 if row.get("result") == "1" else 0
                tgames_split[(key, tid, sp)] += 1
                if dt and (sp not in split_min[key] or dt < split_min[key][sp]):
                    split_min[key][sp] = dt
            elif row.get("position") in POS and row.get("playername"):
                cnt_split[(key, tid, sp, row["position"], row["playername"])] += 1
                cnt_year[(key, tid, row["position"], row["playername"])] += 1

    def first_split(key):
        """按开赛日期取第一个「队数等于这个联赛常见队数」的赛段。
        2026 年 LEC 的 Versus 开年赛带了两支二级联赛队（12 队），常见队数是 10，所以取春季赛；
        LTA 北区 2025 第一赛段每队只打 5–8 场，队数照样是 8，所以就用它。"""
        sps = split_min.get(key, {})
        cand = sorted((d, s) for s, d in sps.items() if s)
        if not cand:
            return ""
        cnt = {s: sum(1 for (k, t, sp2), gm in tgames_split.items() if k == key and sp2 == s and gm >= 3) for _, s in cand}
        freq = collections.Counter(v for v in cnt.values() if v >= 4)
        if not freq:
            return cand[0][1]
        top = max(freq.values())
        typical = min(v for v, c in freq.items() if c == top)
        for _, s in cand:
            if cnt[s] == typical:
                return s
        return cand[0][1]

    for key in want_keys:
        sp = first_split(key)
        adj = REGION_ADJ.get(key, -10)
        teams = []
        for tid in {t for (k, t) in tgames if k == key}:
            g1 = tgames_split[(key, tid, sp)]
            if g1 < 3:
                continue
            roster = {}
            for pos in POS:
                best = None
                for (k, t, s, p, nm), gm in cnt_split.items():
                    if k == key and t == tid and s == sp and p == pos and (best is None or gm > best[1]):
                        best = (nm, gm)
                if best is None:
                    for (k, t, p, nm), gm in cnt_year.items():
                        if k == key and t == tid and p == pos and (best is None or gm > best[1]):
                            best = (nm, gm)
                roster[pos] = best
            if any(v is None for v in roster.values()):
                continue
            players, unrated, pend = [], 0, []
            for pos in POS:
                nm = roster[pos][0]
                rr = rate.get(nm.lower(), {})
                if rr.get("总评"):
                    r = {d: float(rr[d]) + adj if rr.get(d) else 50 + adj for d in DIMS}
                else:
                    r, _ = carried(nm)          # 今年不满 20 场没量出评分：沿用往年量出来的数（按年龄推到今年）
                    if not r:
                        unrated += 1
                a = age_of(nm, int(rr["年龄"]) if rr.get("年龄") else None)
                pend.append((nm, pos, r, a))
            known = [sum(r.values()) / 5 for _, _, r, _ in pend if r]
            fill = (sum(known) / len(known) - 2) if known else (50 + adj - 2)
            for nm, pos, r, a in pend:
                players.append(pl(nm, pos, r or {d: fill for d in DIMS}, a))
            name = tname[(key, tid)]
            # 席位：同一个 teamid（且上一年确实在这个赛区）> 席位易主表 > 改名表 > 队名/首发重合度
            ptid = prev_tid.get(tid)
            if ptid and in_prev(key, ptid):
                frm = ptid
                if SUCC.get(YEAR, {}).get(name) != ptid:
                    name = ptid                 # 同一个 teamid = 同一家俱乐部：换赞助商名不改名（真正易主的写在 SUCC）
            else:
                cands = [SUCC.get(YEAR, {}).get(name), alias(name)]
                frm = next((c for c in cands if in_prev(key, c)), None) or match_prev(key, alias(name) or name, [p[0] for p in players])
                if frm and (alias(name) == frm or norm_team(frm) == norm_team(name)):
                    name = frm                  # 同一家俱乐部换了写法 / 赞助商名：游戏里沿用原名
            gms = tgames[(key, tid)]
            stab = min(1.0, sum(roster[pos][1] for pos in POS) / max(1, g1) / 5.0)
            teams.append({"n": name, "from": frm, "wr": round(twins[(key, tid)] / max(1, gms), 3), "p": players,
                          "_stab": stab, "_un": unrated, "_intl": intl_hit(tname[(key, tid)]), "_oe": tname[(key, tid)], "_g": g1})
        leagues[key] = teams
    # 真实新秀池：二级 / 青训里够场次的年轻人
    on_major = {p[0].lower() for ts in leagues.values() for t in ts for p in t["p"]}
    pool = collections.defaultdict(list)
    for (code, nm, pos), gm in acad.items():
        if gm < 20 or nm.lower() in on_major or nm.lower() not in rate:
            continue
        a = age_of(nm, None)
        if a is not None and a > 22:
            continue
        rr = rate[nm.lower()]
        reg, adj = ACAD[code]
        r = {d: float(rr[d]) + adj if rr.get(d) else 50 + adj for d in DIMS}
        pool[pos].append((sum(r.values()) / 5, pl(nm, pos, r, a) + [reg]))
else:
    yr = [r for r in roster_rows if r["year"] == str(YEAR)]
    tier1 = [r for r in yr if r["tier"] == "一级联赛"]
    for key in want_keys:
        rs = [r for r in tier1 if r["league_short"] in codes(key)]
        if not rs:
            leagues[key] = []
            continue
        by_split = collections.defaultdict(list)
        for r in rs:
            by_split[r["split"]].append(r)
        first = min(by_split, key=lambda s: min(x["date_start"] or "9999" for x in by_split[s]))
        adj = REGION_ADJ.get(key, -10)
        teams = []
        for team in sorted({r["team"] for r in by_split[first]}):
            roster, un = [], 0
            for pos in POS:
                def tours(rows_):
                    c = collections.defaultdict(set)
                    for r in rows_:
                        if r["team"] == team and LP_ROLE.get((r["role"] or "").split(",")[0]) == pos and r["player_id"]:
                            c[r["player_id"]].add(r["tournament"])
                    return c
                c1, cy = tours(by_split[first]), tours(rs)
                cands = list(c1) or list(cy)
                if not cands:
                    break
                def rank(pid):
                    r, _ = carried(pid)
                    return (len(c1.get(pid, ())), len(cy.get(pid, ())), 1 if r else 0, sum(r.values()) if r else 0)
                pid = max(cands, key=rank)
                roster.append((pid, pos))
            if len(roster) < 5:
                continue
            known = [carried(pid)[0] for pid, _ in roster]
            ref = [sum(r.values()) / 5 for r in known if r]
            fill = (sum(ref) / len(ref) - 2) if ref else (50 + adj - 2)
            players = []
            for (pid, pos), r in zip(roster, known):
                if not r:
                    un += 1
                    r = {d: fill for d in DIMS}
                else:
                    # 一线首发的沿用评分不低于「本队均值 −8」：量他的那年可能还在二级联赛，按二级口径折算会压得过低
                    m = sum(r.values()) / 5
                    if m < fill - 6:
                        r = {d: v + (fill - 6 - m) for d, v in r.items()}
                players.append(pl(pid, pos, r, age_of(pid, 22)))
            clean = re.sub(r"\s*\(.*?\)\s*$", "", team)
            ids = [pid for pid, _ in roster]
            sc = SUCC.get(YEAR, {}).get(team) or SUCC.get(YEAR, {}).get(clean)
            if sc and in_prev(key, sc):
                frm, name = sc, clean               # 席位易主：新俱乐部接老席位，用新队名
            else:
                alias = ALIAS.get(team, ALIAS.get(clean, clean))
                frm = match_prev(key, alias, ids)
                name = frm if frm else alias
            teams.append({"n": name, "from": frm, "wr": 0.5, "p": players, "_stab": 0.5, "_un": un,
                          "_intl": intl_hit(team) or intl_hit(name), "_rated": sum(ref) / len(ref) if ref else fill})
        leagues[key] = teams
    on_major = {p[0].lower() for ts in leagues.values() for t in ts for p in t["p"]}
    pool = collections.defaultdict(list)
    seen = set()
    for r in yr:
        lgc = r["league_short"]
        pos = LP_ROLE.get((r["role"] or "").split(",")[0])
        pid = r["player_id"]
        if lgc not in ACAD or not pos or not pid or pid.lower() in on_major or pid.lower() in seen:
            continue
        a = age_of(pid, None)
        if a is None or a > 21:
            continue
        seen.add(pid.lower())
        reg, adj = ACAD[lgc]
        rr, _ = carried(pid)
        r = rr or {d: 50 + adj for d in DIMS}
        pool[pos].append(((sum(r.values()) / 5) + (5 if rr else 0), pl(pid, pos, r, a) + [reg]))

# ---- 同名去重（先于默契计算和小赛区截断）----
# 同一支队出现在两个联赛（2024 年 LJL 的队伍也打 PCS）：留场次多的那边；
# 二队和一线队共用一个 teamid、被继承成同一个名字：保留原名就是它的那支，其余退回自己的原名
byname = collections.defaultdict(list)
for ts in leagues.values():
    for t in ts:
        byname[t["n"]].append(t)
for n, ts in byname.items():
    if len(ts) > 1:
        real = [t for t in ts if t.get("_oe", n) == n] or ts
        keep = max(real, key=lambda t: t.get("_g", 0))
        for t in ts:
            if t is keep:
                continue
            if t.get("_oe", n) == n:
                t["_drop"] = True
                print(f"  !! 同名去重：{n} 在两个联赛各有一份，留场次多的那边")
            else:
                t["n"], t["from"] = t["_oe"], None
                print(f"  !! 同名去重：{n} → 退回原名 {t['n']}")
for key in list(leagues):
    leagues[key] = [t for t in leagues[key] if not t.get("_drop")]

# ---- 默契 / 战术 / 状态：与 export_game.py 同一套从真实胜率反推（roster 来源没有胜率，一律中性）----
for key, teams in leagues.items():
    if teams and SOURCE == "oe":
        base = lambda t: sum(p[4][0] * .34 + p[4][1] * .28 + p[4][2] * .14 + p[4][4] * .10 for p in t["p"]) / 5.0
        bs = [base(t) for t in teams]
        ws = [t["wr"] for t in teams]
        bmu, bsd = sum(bs) / len(bs), (st.pstdev(bs) or 1.0)
        wmu, wsd = sum(ws) / len(ws), (st.pstdev(ws) or 1.0)
        for t, b in zip(teams, bs):
            resid = (t["wr"] - wmu) / wsd - (b - bmu) / bsd
            stab = t["_stab"]
            t["syn"] = max(28, min(78, round(50 + resid * 9 * (0.5 + stab * 0.5))))
            t["tac"] = max(28, min(78, round(50 + resid * 9 * (1.0 - stab * 0.5))))
            tform = 52 + resid * 17
            for p in t["p"]:
                pv = p[4][0] * .34 + p[4][1] * .28 + p[4][2] * .14 + p[4][4] * .10
                p[5] = max(30, min(94, round(tform + (pv - b) * 1.15)))
    else:
        for t in teams:
            t["syn"], t["tac"] = 50, 50
    teams.sort(key=lambda t: -(sum(sum(p[4]) for p in t["p"]) / 25))
    if key in S["minor"]:
        # 小赛区只留 4 支：当年打过国际赛的先留，其次是上一年就在的，再按胜率（没有胜率按评分）
        teams.sort(key=lambda t: (-t.get("_intl", 0), -(1 if t["from"] else 0),
                                  -(t["wr"] if SOURCE == "oe" else t.get("_rated", 0))))
        leagues[key] = teams[:4]
    report[key] = {"teams": len(leagues[key]), "unrated": sum(t["_un"] for t in leagues[key]),
                   "newSeat": [t["n"] for t in leagues[key] if not t["from"]],
                   "renamed": [f'{t["from"]}→{t["n"]}' for t in leagues[key] if t["from"] and t["from"] != t["n"]]}

prospects = []
for pos in POS:
    prospects += [x[1] for x in sorted(pool[pos], key=lambda x: -x[0])[:40]]

for ts in leagues.values():
    for t in ts:
        for k in [k for k in t if k.startswith("_")]:
            t.pop(k)
out = {"year": YEAR, "src": SOURCE, "major": S["major"], "minor": S["minor"], "intl": S["intl"],
       "rename": S.get("rename", {}), "merge": S.get("merge", {}), "leagues": leagues, "pros": prospects}
path = os.path.join(OUT, f"timeline_{YEAR}.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"导出 {YEAR}（来源 {SOURCE}）: {path} {os.path.getsize(path)} bytes")
for key, r in report.items():
    print(f"  {key:<6} {r['teams']:>2} 队  无评分 {r['unrated']:>2}  新席位 {r['newSeat']}  席位易主 {r['renamed']}")
print("  真实新秀池:", len(prospects), "人")
