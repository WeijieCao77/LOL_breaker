# -*- coding: utf-8 -*-
"""
胜负贡献度 (Win Impact) —— 从比赛胜负反解每名选手的隐藏价值。
思路同篮球的「调整正负值 / RAPM」:
    P(蓝方胜) = sigmoid( Σ蓝方5人 rating - Σ红方5人 rating )
用带 L2 正则的逻辑回归拟合每名选手的 rating。
box score 测不到的东西（指挥、运营、开团决策）会被胜负结果反推出来。
"""
import csv, os, sys, collections
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "oracleselixir", "2022_OE.csv")
OUT = os.path.join(BASE, "csv")

TIER1 = {"LPL", "LCK", "LEC", "LCS", "WLDs", "MSI"}
POS = ("top", "jng", "mid", "bot", "sup")
MIN_GAMES = 20
LAMBDA = 12.0          # L2 强度：越大越保守（把低样本选手拉向均值）
EPOCHS = 400
LR = 0.35

# ---------- 1. 组装对局 ----------
games = collections.defaultdict(lambda: {"blue": [], "red": [], "res": None, "lg": None})
appear = collections.Counter()

with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        if row.get("position") not in POS:
            continue
        gid = row.get("gameid")
        name = row.get("playername")
        if not gid or not name:
            continue
        g = games[gid]
        g["lg"] = row.get("league")
        side = "blue" if row.get("side") == "Blue" else "red"
        g[side].append(name)
        if side == "blue":
            g["res"] = 1 if row.get("result") == "1" else 0
        appear[name] += 1

valid = [g for g in games.values()
         if len(g["blue"]) == 5 and len(g["red"]) == 5 and g["res"] is not None]
print("有效对局:", len(valid), file=sys.stderr)

# 只给样本足够的选手独立参数，其余归入该赛区的「平均选手」占位
keep = {n for n, c in appear.items() if c >= MIN_GAMES}
print("独立建模选手:", len(keep), file=sys.stderr)

names = sorted(keep)
idx = {n: i for i, n in enumerate(names)}
POOL = len(names)                      # 占位参数（所有低样本选手共享）
N = POOL + 1

X = np.zeros((len(valid), N), dtype=np.float32)
y = np.zeros(len(valid), dtype=np.float32)
for gi, g in enumerate(valid):
    for n in g["blue"]:
        X[gi, idx.get(n, POOL)] += 1.0
    for n in g["red"]:
        X[gi, idx.get(n, POOL)] -= 1.0
    y[gi] = g["res"]

# ---------- 2. 带 L2 的逻辑回归（全批量梯度下降） ----------
w = np.zeros(N, dtype=np.float32)
n = len(valid)
for ep in range(EPOCHS):
    z = X @ w
    p = 1.0 / (1.0 + np.exp(-z))
    grad = X.T @ (p - y) / n + (LAMBDA / n) * w
    w -= LR * grad
    if ep % 100 == 0:
        ll = -np.mean(y * np.log(p + 1e-9) + (1 - y) * np.log(1 - p + 1e-9))
        acc = np.mean((p > 0.5) == (y > 0.5))
        print(f"  epoch {ep:>3}  loss {ll:.4f}  train_acc {acc:.3f}", file=sys.stderr)

z = X @ w
p = 1.0 / (1.0 + np.exp(-z))
print(f"最终 train_acc {np.mean((p > 0.5) == (y > 0.5)):.3f}", file=sys.stderr)

# ---------- 3. 输出 ----------
pos_of, lg_of, gp_of = {}, {}, collections.Counter()
with open(SRC, encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        nm = row.get("playername")
        if row.get("position") in POS and nm in keep:
            pos_of[nm] = row.get("position")
            lg_of.setdefault(nm, collections.Counter())[row.get("league")] += 1
            gp_of[nm] += 1

raw = {nm: float(w[idx[nm]]) for nm in names}
vals = np.array(list(raw.values()))
mu, sd = vals.mean(), vals.std() or 1.0

rows = []
for nm in names:
    lg = lg_of[nm].most_common(1)[0][0]
    zsc = (raw[nm] - mu) / sd
    rows.append(dict(player_id=nm, position=pos_of.get(nm, ""), league=lg,
                     tier=1 if lg in TIER1 else 2,
                     games=gp_of[nm], impact_raw=round(raw[nm], 4),
                     impact_z=round(zsc, 3),
                     impact_100=round(max(1, min(99, 55 + 26.6 * np.tanh(zsc / 1.4))), 1)))
rows.sort(key=lambda r: -r["impact_raw"])

cols = ["player_id", "position", "league", "tier", "games", "impact_raw", "impact_z", "impact_100"]
with open(os.path.join(OUT, "impact_2022.csv"), "w", newline="", encoding="utf-8-sig") as fh:
    wr = csv.DictWriter(fh, fieldnames=cols)
    wr.writeheader()
    wr.writerows(rows)
print("输出 impact_2022.csv:", len(rows), "行", file=sys.stderr)
