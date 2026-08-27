# -*- coding: utf-8 -*-
"""
v2 的两处修正:
  体质 -> 只用常规赛计算前后段衰减 (季后赛/国际赛对手更强，会污染后段数据)
  指挥 -> 先验定水位 (位置惯例 + 职业年限)，数据残差只定「队内谁在指挥」
"""
import csv, os, sys, math, gzip, json, statistics as st, collections

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "oracleselixir", "2022_OE.csv")
OUT = os.path.join(BASE, "csv")
POS = ("top", "jng", "mid", "bot", "sup")

# 位置指挥惯例先验 (职业圈通识: 辅助/打野视野最广，中单常兼指挥)
POS_PRIOR = {"sup": 0.55, "jng": 0.40, "mid": 0.25, "top": -0.35, "bot": -0.35}


def f(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def mean(x, d=0.0):
    return sum(x) / len(x) if x else d


# ---------- 1. 常规赛专用的体质 ----------
reg = collections.defaultdict(list)
with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        if row.get("position") not in POS or row.get("playoffs") == "1":
            continue
        nm = row.get("playername")
        if not nm or not row.get("date"):
            continue
        k = f(row.get("kills")) or 0.0
        d = f(row.get("deaths")) or 0.0
        a = f(row.get("assists")) or 0.0
        reg[nm].append((row["date"][:10], (k + a) / max(1.0, d)))

endurance = {}
for nm, ds in reg.items():
    ds.sort()
    h = len(ds) // 2
    if h < 5:
        continue
    h1, h2 = mean([p for _, p in ds[:h]]), mean([p for _, p in ds[h:]])
    endurance[nm] = (h2 - h1) / max(0.3, abs(h1))
print("常规赛体质样本:", len(endurance), file=sys.stderr)

# ---------- 2. 经验代理: 用年龄 (出道年份在数据里有偏, 只有打过 LSPL 的中国选手查得到) ----------
age = {}
for r in csv.DictReader(open(os.path.join(OUT, "players_master.csv"), encoding="utf-8-sig")):
    bd = (r.get("birthdate") or "").strip()
    if len(bd) >= 4 and bd[:4].isdigit():
        yr = int(bd[:4])
        if 1985 <= yr <= 2010:
            age[(r.get("player_id") or "").lower()] = 2022 - yr
print("有生日的选手:", len(age), file=sys.stderr)

# ---------- 3. 重算 ----------
rows = list(csv.DictReader(open(os.path.join(OUT, "ratings_v2_final.csv"), encoding="utf-8-sig")))
groups = collections.defaultdict(list)
for r in rows:
    groups[(r["position"], r["tier"])].append(r)


def zmap(vals):
    mu = mean(vals); sd = st.pstdev(vals) or 1.0
    return mu, sd


def squash(z, spread=26.6):
    return max(1.0, min(99.0, 55 + spread * math.tanh(z / 1.4)))


for (pos, tier), grp in groups.items():
    # --- 体质: 常规赛版 ---
    have = [r for r in grp if r["player_id"] in endurance]
    if len(have) > 2:
        mu, sd = zmap([endurance[r["player_id"]] for r in have])
        for r in grp:
            e = endurance.get(r["player_id"])
            r["体质"] = round(squash((e - mu) / sd), 1) if e is not None else r["体质"]

    # --- 指挥: 先验(位置+年限) 0.6 + 队内残差 0.4 ---
    ages = [age.get(r["player_id"].lower()) for r in grp]
    known = [x for x in ages if x]
    med = st.median(known) if known else 21
    priors = []
    for r, ag in zip(grp, ages):
        a = ag if ag else med
        # 22 岁为基准，每大一岁 +0.16（经验），上限 8 岁
        priors.append(POS_PRIOR.get(pos, 0.0) + min(max(a - 20, 0), 8) * 0.16)
    pmu, psd = zmap(priors)
    rmu, rsd = zmap([float(r["_resid"]) for r in grp])
    for r, pr in zip(grp, priors):
        pz = (pr - pmu) / psd
        rz = (float(r["_resid"]) - rmu) / rsd
        r["指挥"] = round(squash(0.60 * pz + 0.40 * rz), 1)
        r["年龄"] = age.get(r["player_id"].lower(), "")

rows.sort(key=lambda r: -float(r["总评"]))
cols = list(rows[0].keys())
for path, data in (("ratings_v2_final.csv", rows),
                   ("ratings_v2_tier1.csv", [r for r in rows if r["tier"] == "1"]),
                   ("ratings_v2_LPL.csv", [r for r in rows if r["league"] == "LPL"]),
                   ("ratings_v2_LDL.csv", [r for r in rows if r["league"] == "LDL"])):
    with open(os.path.join(OUT, path), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(data)
print("修正完成:", len(rows), file=sys.stderr)
