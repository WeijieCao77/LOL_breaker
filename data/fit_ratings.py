# -*- coding: utf-8 -*-
"""
从 Oracle's Elixir 逐场数据拟合选手五维评分。
五维: 操作 / 意识 / 心态 / 团队 / 体质
做法: 抽特征 -> 在「同位置 x 同联赛层级」内做 z 标准化 -> 加权合成 -> 映射到 0-100。
"""
import csv, sys, os, math, statistics as st, collections

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, "oracleselixir", "2022_OE.csv")
OUT  = os.path.join(BASE, "csv"); os.makedirs(OUT, exist_ok=True)

# 分层要细，否则小赛区小样本会串到顶部
TIER1 = {"LPL","LCK","LEC","LCS","WLDs","MSI"}                      # 四大赛区 + 国际赛
TIER1B = {"PCS","VCS","CBLOL","LJL","LLA","LCO","TCL"}              # 次级一线赛区
TIER2 = {"LDL","LCKC","LCSA","EUM","NLC","LFL","UPL","PGC","LMF","LVP SL","UL","LHE","LFL2"}
POS   = ("top","jng","mid","bot","sup")
MINGAMES = 20   # 低于此样本噪声过大


def f(v):
    try:
        if v is None or v == "":
            return None
        return float(v)
    except ValueError:
        return None


def mean(x, dflt=0.0):
    return sum(x) / len(x) if x else dflt


# ---------- 1. 读取，按 (选手, 位置) 聚合 ----------
def newrec():
    return {
        "games": 0, "wins": 0, "kills": 0.0, "deaths": 0.0, "assists": 0.0,
        "tk": 0.0, "td": 0.0, "multi": 0.0,
        "dpm": [], "dmgshare": [], "cspm": [], "vspm": [], "wcpm": [], "cwards": [],
        "gd15": [], "xd15": [], "cd15": [], "egshare": [], "dmgmit": [], "gspd": [],
        "ejg": [],
        "win_kda": [], "loss_kda": [], "reg": [], "po": [], "lateg": [],
        "series": [], "teams": set(), "leagues": collections.Counter(),
    }


agg = collections.defaultdict(newrec)

with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        pos = row.get("position", "")
        if pos not in POS:
            continue
        pid = row.get("playername") or row.get("playerid")
        if not pid:
            continue
        a = agg[(pid, pos)]
        a["games"] += 1
        win = row.get("result") == "1"
        a["wins"] += 1 if win else 0
        a["leagues"][row.get("league", "")] += 1
        if row.get("teamname"):
            a["teams"].add(row["teamname"])

        k = f(row.get("kills")) or 0.0
        d = f(row.get("deaths")) or 0.0
        s = f(row.get("assists")) or 0.0
        a["kills"] += k
        a["deaths"] += d
        a["assists"] += s
        a["tk"] += f(row.get("teamkills")) or 0.0
        a["td"] += f(row.get("teamdeaths")) or 0.0
        kda = (k + s) / max(1.0, d)

        for key, col in (("dpm", "dpm"), ("dmgshare", "damageshare"), ("cspm", "cspm"),
                         ("vspm", "vspm"), ("wcpm", "wcpm"), ("cwards", "controlwardsbought"),
                         ("egshare", "earnedgoldshare"), ("dmgmit", "damagemitigatedperminute"),
                         ("gspd", "gspd"), ("ejg", "monsterkillsenemyjungle")):
            v = f(row.get(col))
            if v is not None:
                a[key].append(v)

        for m in ("doublekills", "triplekills", "quadrakills", "pentakills"):
            a["multi"] += f(row.get(m)) or 0.0

        if row.get("datacompleteness") == "complete":
            for key, col in (("gd15", "golddiffat15"), ("xd15", "xpdiffat15"),
                             ("cd15", "csdiffat15")):
                v = f(row.get(col))
                if v is not None:
                    a[key].append(v)

        (a["win_kda"] if win else a["loss_kda"]).append(kda)
        if row.get("playoffs") == "1":
            a["po"].append(kda)
        else:
            a["reg"].append(kda)
        gn = f(row.get("game"))
        if gn and gn >= 4:
            a["lateg"].append(kda)
        if row.get("date"):
            a["series"].append((row["date"][:10], kda))

print("聚合完成，(选手,位置) 条目:", len(agg), file=sys.stderr)

# ---------- 2. 抽特征 ----------
rows = []
for (pid, pos), a in agg.items():
    if a["games"] < MINGAMES:
        continue
    lg = a["leagues"].most_common(1)[0][0]
    tier = 1 if lg in TIER1 else (15 if lg in TIER1B else (2 if lg in TIER2 else 3))
    g = a["games"]

    ds = sorted(a["series"])
    half = len(ds) // 2
    h1 = mean([p for _, p in ds[:half]])
    h2 = mean([p for _, p in ds[half:]])
    decay = (h2 - h1) / max(0.3, abs(h1)) if half else 0.0

    allk = [p for _, p in ds]
    cv = (st.pstdev(allk) / max(0.3, mean(allk))) if len(allk) > 2 else 1.0
    adver = (mean(a["loss_kda"]) / max(0.3, mean(a["win_kda"]))) if (a["loss_kda"] and a["win_kda"]) else 0.0
    clutch = ((mean(a["po"]) - mean(a["reg"])) / max(0.3, mean(a["reg"]))) if (a["po"] and a["reg"]) else 0.0
    lateg = ((mean(a["lateg"]) - mean(a["reg"])) / max(0.3, mean(a["reg"]))) if (a["lateg"] and a["reg"]) else 0.0

    rows.append(dict(
        player_id=pid, position=pos, league=lg, tier=tier, games=g,
        winrate=round(a["wins"] / g, 3),
        teams="|".join(sorted(a["teams"])),
        f_gd15=mean(a["gd15"]), f_xd15=mean(a["xd15"]), f_cd15=mean(a["cd15"]),
        f_dpm=mean(a["dpm"]), f_dmgshare=mean(a["dmgshare"]), f_cspm=mean(a["cspm"]),
        f_multi=a["multi"] / g,
        f_vspm=mean(a["vspm"]), f_wcpm=mean(a["wcpm"]), f_cwards=mean(a["cwards"]),
        f_kp=(a["kills"] + a["assists"]) / max(1.0, a["tk"]),
        f_deathshare=a["deaths"] / max(1.0, a["td"]),
        f_ejg=mean(a["ejg"]),
        f_adver=adver, f_clutch=clutch, f_lateg=lateg, f_stable=-cv,
        f_egshare=mean(a["egshare"]), f_dmgmit=mean(a["dmgmit"]), f_gspd=mean(a["gspd"]),
        f_games=float(g), f_decay=decay,
    ))

print("过滤后 (>=%d 场):" % MINGAMES, len(rows), file=sys.stderr)

# ---------- 3. 同位置 x 同层级 内标准化 ----------
FEATS = [k for k in rows[0] if k.startswith("f_")]
groups = collections.defaultdict(list)
for r in rows:
    groups[(r["position"], r["tier"])].append(r)

for grp in groups.values():
    for feat in FEATS:
        vals = [r[feat] for r in grp]
        mu = mean(vals)
        sd = st.pstdev(vals) if len(vals) > 1 else 1.0
        sd = sd if sd > 1e-9 else 1.0
        for r in grp:
            r["z_" + feat] = (r[feat] - mu) / sd

# ---------- 4. 合成五维 ----------
W = {
    "操作": [("f_gd15", .22), ("f_xd15", .16), ("f_cd15", .12), ("f_dpm", .22),
             ("f_dmgshare", .14), ("f_multi", .14)],
    "意识": [("f_vspm", .24), ("f_wcpm", .18), ("f_kp", .24), ("f_deathshare", -.22),
             ("f_ejg", .12)],
    "心态": [("f_adver", .34), ("f_clutch", .22), ("f_lateg", .18), ("f_stable", .26)],
    "团队": [("f_kp", .30), ("f_egshare", -.18), ("f_dmgmit", .16), ("f_gspd", .20),
             ("f_deathshare", -.16)],
    "体质": [("f_games", .45), ("f_decay", .35), ("f_stable", .20)],
}


def squash(zv):
    """z 分数 -> 0..100，中位约 55，两端压尾。"""
    return max(1.0, min(99.0, 55 + 26.6 * math.tanh(zv / 1.4)))


for r in rows:
    for dim, ws in W.items():
        zv = sum(r["z_" + k] * w for k, w in ws) / sum(abs(w) for _, w in ws)
        r[dim] = round(squash(zv), 1)
    r["综合"] = round(0.30 * r["操作"] + 0.26 * r["意识"] + 0.16 * r["心态"]
                    + 0.16 * r["团队"] + 0.12 * r["体质"], 1)
    for d in list(W) + ["综合"]:
        r[d + "_10"] = round(r[d] / 10.0, 1)

# ---------- 5. 输出 ----------
rows.sort(key=lambda r: -r["综合"])
cols = (["player_id", "position", "league", "tier", "games", "winrate", "teams"]
        + list(W) + ["综合"] + [d + "_10" for d in list(W) + ["综合"]] + FEATS)


def dump(path, data):
    with open(os.path.join(OUT, path), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(data)


dump("ratings_2022.csv", rows)
dump("ratings_2022_tier1.csv", [r for r in rows if r["tier"] == 1])
dump("ratings_2022_tier1b.csv", [r for r in rows if r["tier"] == 15])
dump("ratings_2022_LPL.csv", [r for r in rows if r["league"] == "LPL"])
dump("ratings_2022_LDL.csv", [r for r in rows if r["league"] == "LDL"])

print("输出 %d 行 (一线 %d) -> %s" % (len(rows), sum(1 for r in rows if r["tier"] == 1), OUT),
      file=sys.stderr)
