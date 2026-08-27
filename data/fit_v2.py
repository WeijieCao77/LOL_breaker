# -*- coding: utf-8 -*-
"""
选手评分 v2 —— 按评审修订重建五维。

改动:
  1. 意识 + 指挥 -> 合并为「运营」(两者原本相关 +0.48，重复度量)
  2. 「指挥」重新定义 = 胜负贡献 - 个人数据 (数据看不见的那部分价值)
  3. 「体质」删掉场次数 (原本 r=+0.64 是伪相关，实为「打了多少场」)
  4. 「心态」改用 落后翻盘率 / 决胜局表现，替代原来的 KDA 波动率
  5. 新增派生值「适应力」= 英雄池宽度 + 跨版本稳定性 (不占天赋点，用于版本相性)
"""
import csv, os, sys, math, statistics as st, collections

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "oracleselixir", "2022_OE.csv")
OUT = os.path.join(BASE, "csv")

TIER1 = {"LPL", "LCK", "LEC", "LCS", "WLDs", "MSI"}
TIER1B = {"PCS", "VCS", "CBLOL", "LJL", "LLA", "LCO", "TCL"}
TIER2 = {"LDL", "LCKC", "LCSA", "EUM", "NLC", "LFL", "UPL", "PGC", "LMF", "LVP SL", "UL", "LHE", "LFL2"}
POS = ("top", "jng", "mid", "bot", "sup")
MIN_GAMES = 20
# 样本量收缩: 一名替补顶上打 20 场，数据可能很好看——但那不是他的水平。
# 所有 z 分数按出场数向联盟均值(z=0)收缩 g/(g+K)。
# K=45 时 45 场算一半可信，400 场算九成。
SHRINK_K = 45.0
DEFICIT = -2000.0          # 15 分钟落后多少算逆风局


def f(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def mean(x, d=0.0):
    return sum(x) / len(x) if x else d


# ============ 第一遍: 取队伍层面的局势 ============
# (gameid, side) -> {gd15, result}
teamctx = {}
with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        if row.get("position") != "team":
            continue
        teamctx[(row.get("gameid"), row.get("side"))] = {
            "gd15": f(row.get("golddiffat15")),
            "win": row.get("result") == "1",
        }
print("队伍局势记录:", len(teamctx), file=sys.stderr)


# ============ 第二遍: 按 (选手,位置) 聚合 ============
def newrec():
    return {
        "games": 0, "wins": 0, "kills": 0.0, "deaths": 0.0, "assists": 0.0,
        "tk": 0.0, "td": 0.0, "multi": 0.0,
        "dpm": [], "dmgshare": [], "cspm": [], "gd15": [], "xd15": [], "cd15": [],
        "vspm": [], "wcpm": [], "kp_g": [], "deathshare_g": [], "ejg": [],
        "dmgmit": [], "gspd": [],
        # 心态
        "behind_n": 0, "behind_w": 0, "ahead_n": 0, "ahead_w": 0,
        "behind_kda": [], "normal_kda": [], "decisive": [], "regular": [],
        # 体质 / 适应力
        "dated": [], "champs": collections.Counter(), "patch_perf": collections.defaultdict(list),
        "teams": set(), "leagues": collections.Counter(),
    }


agg = collections.defaultdict(newrec)

with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        pos = row.get("position", "")
        if pos not in POS:
            continue
        nm = row.get("playername")
        if not nm:
            continue
        a = agg[(nm, pos)]
        a["games"] += 1
        win = row.get("result") == "1"
        a["wins"] += 1 if win else 0
        a["leagues"][row.get("league", "")] += 1
        if row.get("teamname"):
            a["teams"].add(row["teamname"])
        if row.get("champion"):
            a["champs"][row["champion"]] += 1

        k = f(row.get("kills")) or 0.0
        d = f(row.get("deaths")) or 0.0
        s = f(row.get("assists")) or 0.0
        tk = f(row.get("teamkills")) or 0.0
        td = f(row.get("teamdeaths")) or 0.0
        a["kills"] += k; a["deaths"] += d; a["assists"] += s
        a["tk"] += tk; a["td"] += td
        kda = (k + s) / max(1.0, d)
        if tk > 0:
            a["kp_g"].append((k + s) / tk)
        if td > 0:
            a["deathshare_g"].append(d / td)

        for key, col in (("dpm", "dpm"), ("dmgshare", "damageshare"), ("cspm", "cspm"),
                         ("vspm", "vspm"), ("wcpm", "wcpm"), ("ejg", "monsterkillsenemyjungle"),
                         ("dmgmit", "damagemitigatedperminute"), ("gspd", "gspd")):
            v = f(row.get(col))
            if v is not None:
                a[key].append(v)
        for m in ("doublekills", "triplekills", "quadrakills", "pentakills"):
            a["multi"] += f(row.get(m)) or 0.0

        if row.get("datacompleteness") == "complete":
            for key, col in (("gd15", "golddiffat15"), ("xd15", "xpdiffat15"), ("cd15", "csdiffat15")):
                v = f(row.get(col))
                if v is not None:
                    a[key].append(v)

        # --- 心态: 逆风局 ---
        ctx = teamctx.get((row.get("gameid"), row.get("side")))
        if ctx and ctx["gd15"] is not None:
            if ctx["gd15"] <= DEFICIT:
                a["behind_n"] += 1
                a["behind_w"] += 1 if win else 0
                a["behind_kda"].append(kda)
            else:
                a["ahead_n"] += 1
                a["ahead_w"] += 1 if win else 0
                a["normal_kda"].append(kda)

        # --- 心态: 决胜局 ---
        gn = f(row.get("game"))
        if gn and gn >= 4:
            a["decisive"].append(kda)
        else:
            a["regular"].append(kda)

        # --- 体质 / 适应力 ---
        if row.get("date"):
            a["dated"].append((row["date"][:10], kda))
        if row.get("patch"):
            a["patch_perf"][row["patch"]].append(kda)

print("聚合完成:", len(agg), file=sys.stderr)


# ============ 抽特征 ============
rows = []
for (nm, pos), a in agg.items():
    if a["games"] < MIN_GAMES:
        continue
    lg = a["leagues"].most_common(1)[0][0]
    tier = 1 if lg in TIER1 else (15 if lg in TIER1B else (2 if lg in TIER2 else 3))
    g = a["games"]

    # 心态: 逆风翻盘率 (相对该位置基准由后续 z 化处理) + 逆风数据保持度 + 决胜局加成
    comeback = (a["behind_w"] / a["behind_n"]) if a["behind_n"] >= 3 else 0.0
    hold = (mean(a["behind_kda"]) / max(0.3, mean(a["normal_kda"]))) if (a["behind_kda"] and a["normal_kda"]) else 0.0
    clutch = ((mean(a["decisive"]) - mean(a["regular"])) / max(0.3, mean(a["regular"]))) if (a["decisive"] and a["regular"]) else 0.0

    # 体质: 赛季前段 vs 后段衰减 + 密集赛程下的稳定性 (不含场次数!)
    ds = sorted(a["dated"])
    h = len(ds) // 2
    h1, h2 = mean([p for _, p in ds[:h]]), mean([p for _, p in ds[h:]])
    endurance = (h2 - h1) / max(0.3, abs(h1)) if h else 0.0
    # 单周内多赛日的表现保持
    byday = collections.defaultdict(list)
    for dt, p in ds:
        byday[dt].append(p)
    multiday = [ (mean(v[len(v)//2:]) - mean(v[:len(v)//2])) / max(0.3, abs(mean(v[:len(v)//2])))
                 for v in byday.values() if len(v) >= 4 ]
    same_day_hold = mean(multiday)

    # 适应力: 英雄池宽度 + 跨版本表现稳定
    pool = len(a["champs"]) / math.sqrt(g)
    top3 = sum(c for _, c in a["champs"].most_common(3)) / g      # 依赖度，越低越灵活
    pv = [mean(v) for v in a["patch_perf"].values() if len(v) >= 3]
    patch_stab = -(st.pstdev(pv) / max(0.3, mean(pv))) if len(pv) > 2 else 0.0

    rows.append(dict(
        player_id=nm, position=pos, league=lg, tier=tier, games=g,
        winrate=round(a["wins"] / g, 3), teams="|".join(sorted(a["teams"])),
        behind_games=a["behind_n"], comeback_rate=round(comeback, 3),
        champ_pool=len(a["champs"]),
        # 操作
        f_gd15=mean(a["gd15"]), f_xd15=mean(a["xd15"]), f_cd15=mean(a["cd15"]),
        f_dpm=mean(a["dpm"]), f_dmgshare=mean(a["dmgshare"]), f_multi=a["multi"] / g,
        # 运营 (原 意识 + 指挥 的可测部分)
        f_vspm=mean(a["vspm"]), f_wcpm=mean(a["wcpm"]),
        f_kp=mean(a["kp_g"]), f_deathshare=mean(a["deathshare_g"]),
        f_ejg=mean(a["ejg"]), f_dmgmit=mean(a["dmgmit"]), f_gspd=mean(a["gspd"]),
        # 心态
        f_comeback=comeback, f_hold=hold, f_clutch=clutch,
        # 体质 (无场次)
        f_endurance=endurance, f_sameday=same_day_hold,
        # 适应力
        f_pool=pool, f_indep=-top3, f_patchstab=patch_stab,
    ))

print("过滤后 (>=%d 场): %d" % (MIN_GAMES, len(rows)), file=sys.stderr)

# ============ 同位置 x 同层级 标准化 ============
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
            z = (r[feat] - mu) / sd
            r["z_" + feat] = z * (r["games"] / (r["games"] + SHRINK_K))

# ============ 合成 (指挥 稍后由 impact 残差给出) ============
W = {
    "操作": [("f_gd15", .24), ("f_xd15", .18), ("f_cd15", .12), ("f_dpm", .22),
             ("f_dmgshare", .12), ("f_multi", .12)],
    "运营": [("f_vspm", .20), ("f_wcpm", .14), ("f_kp", .22), ("f_deathshare", -.20),
             ("f_ejg", .08), ("f_dmgmit", .06), ("f_gspd", .10)],
    "心态": [("f_comeback", .42), ("f_hold", .32), ("f_clutch", .26)],
    "体质": [("f_endurance", .60), ("f_sameday", .40)],
    "适应力": [("f_pool", .40), ("f_indep", .28), ("f_patchstab", .32)],
}


def squash(z, spread=26.6):
    return max(1.0, min(99.0, 55 + spread * math.tanh(z / 1.4)))


for r in rows:
    for dim, ws in W.items():
        z = sum(r["z_" + k] * w for k, w in ws) / sum(abs(w) for _, w in ws)
        r["z_" + dim] = z
        r[dim] = round(squash(z), 1)

rows.sort(key=lambda r: -(r["操作"] + r["运营"]))
cols = (["player_id", "position", "league", "tier", "games", "winrate",
         "behind_games", "comeback_rate", "champ_pool"]
        + list(W) + ["teams"] + FEATS)
with open(os.path.join(OUT, "ratings_v2_raw.csv"), "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, fieldnames=cols + ["z_" + d for d in W], extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)
print("-> ratings_v2_raw.csv", file=sys.stderr)
