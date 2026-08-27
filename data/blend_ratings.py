# -*- coding: utf-8 -*-
"""
两层合成最终评分。
  A 层 (box score)  —— 能区分「同队内谁更强」，但测不到宏观/指挥价值
  B 层 (win impact) —— 能定「这支队多强」，但固定首发导致队内五人不可分
最终 = B 定队伍水位 + A 定队内高低。
"""
import csv, os, math, statistics as st, collections

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv")

box = {r["player_id"]: r for r in csv.DictReader(
    open(os.path.join(OUT, "ratings_2022.csv"), encoding="utf-8-sig"))}
imp = {r["player_id"]: r for r in csv.DictReader(
    open(os.path.join(OUT, "impact_2022.csv"), encoding="utf-8-sig"))}

W_TEAM, W_INDIV = 0.55, 0.45      # 团队水位 : 个体表现
DIMS = ["操作", "意识", "心态", "团队", "体质"]


def zof(v, mu, sd):
    return (v - mu) / sd if sd else 0.0


rows = []
common = [n for n in box if n in imp]
# box 综合 的分布，用来还原 z
bz = [float(box[n]["综合"]) for n in common]
bmu, bsd = st.mean(bz), st.pstdev(bz) or 1.0

for n in common:
    b, i = box[n], imp[n]
    box_z = zof(float(b["综合"]), bmu, bsd)
    imp_z = float(i["impact_z"])
    final_z = W_TEAM * imp_z + W_INDIV * box_z
    r = dict(player_id=n, position=b["position"], league=b["league"], tier=b["tier"],
             games=b["games"], winrate=b["winrate"], teams=b["teams"],
             box_综合=b["综合"], impact=i["impact_100"],
             final_z=round(final_z, 3),
             总评=round(max(1, min(99, 55 + 26.6 * math.tanh(final_z / 1.2))), 1))
    # 五维：以总评为水位，保留 box 各维相对形状
    base = r["总评"]
    dev = [float(b[d]) - float(b["综合"]) for d in DIMS]
    for d, dv in zip(DIMS, dev):
        r[d] = round(max(1, min(99, base + dv * 0.9)), 1)
    rows.append(r)

rows.sort(key=lambda r: -r["总评"])
cols = (["player_id", "position", "league", "tier", "games", "winrate"]
        + DIMS + ["总评", "box_综合", "impact", "final_z", "teams"])


def dump(path, data):
    with open(os.path.join(OUT, path), "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(data)


dump("ratings_final_2022.csv", rows)
dump("ratings_final_2022_tier1.csv", [r for r in rows if r["tier"] == "1"])
print("合成完成:", len(rows), "行")
