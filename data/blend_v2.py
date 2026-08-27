# -*- coding: utf-8 -*-
"""
最终合成 v2。

指挥 = 胜负贡献(impact_z) - 个人数据(box_z)
       队伍赢得多、个人数据却不突出 => 缺口大 => 价值在数据看不见的地方 => 指挥高。
总评 = 0.55 x 队伍水位 + 0.45 x 队内个人表现
"""
import csv, os, math, statistics as st

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv")

box = {r["player_id"]: r for r in csv.DictReader(
    open(os.path.join(OUT, "ratings_v2_raw.csv"), encoding="utf-8-sig"))}
imp = {r["player_id"]: r for r in csv.DictReader(
    open(os.path.join(OUT, "impact_2022.csv"), encoding="utf-8-sig"))}

TALENT = ["操作", "运营", "心态", "指挥", "体质"]     # 玩家可分配天赋点的五维
DERIVED = ["适应力"]                                  # 派生值，不占天赋点

common = [n for n in box if n in imp]

# 个人数据综合 z (操作/运营 为主，心态体质次之)
for n in common:
    b = box[n]
    box[n]["_boxz"] = (0.42 * float(b["z_操作"]) + 0.30 * float(b["z_运营"])
                       + 0.16 * float(b["z_心态"]) + 0.12 * float(b["z_体质"]))

# 指挥残差: 分位置分层级做标准化，避免辅助/打野系统性偏移
resid = {n: float(imp[n]["impact_z"]) - box[n]["_boxz"] for n in common}
grp = {}
for n in common:
    grp.setdefault((box[n]["position"], box[n]["tier"]), []).append(n)
for key, names in grp.items():
    vs = [resid[n] for n in names]
    mu = st.mean(vs); sd = st.pstdev(vs) or 1.0
    for n in names:
        resid[n] = (resid[n] - mu) / sd


def squash(z, spread=26.6):
    return max(1.0, min(99.0, 55 + spread * math.tanh(z / 1.4)))


rows = []
for n in common:
    b, i = box[n], imp[n]
    impz = float(i["impact_z"])
    final_z = 0.55 * impz + 0.45 * b["_boxz"]
    r = dict(player_id=n, position=b["position"], league=b["league"], tier=b["tier"],
             games=b["games"], winrate=b["winrate"], teams=b["teams"],
             操作=float(b["操作"]), 运营=float(b["运营"]),
             心态=float(b["心态"]), 体质=float(b["体质"]),
             指挥=round(squash(resid[n]), 1),
             适应力=float(b["适应力"]),
             总评=round(squash(final_z, 24.0), 1),
             逆风局数=b["behind_games"], 翻盘率=b["comeback_rate"],
             英雄池=b["champ_pool"],
             _boxz=round(b["_boxz"], 3), _impz=round(impz, 3),
             _resid=round(resid[n], 3))
    rows.append(r)

rows.sort(key=lambda r: -r["总评"])
cols = (["player_id", "position", "league", "tier", "games", "winrate"]
        + TALENT + DERIVED + ["总评", "逆风局数", "翻盘率", "英雄池",
                              "_boxz", "_impz", "_resid", "teams"])


def dump(path, data):
    with open(os.path.join(OUT, path), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader(); w.writerows(data)


dump("ratings_v2_final.csv", rows)
dump("ratings_v2_tier1.csv", [r for r in rows if r["tier"] == "1"])
dump("ratings_v2_LPL.csv", [r for r in rows if r["league"] == "LPL"])
dump("ratings_v2_LDL.csv", [r for r in rows if r["league"] == "LDL"])
print("合成完成:", len(rows), "行")
