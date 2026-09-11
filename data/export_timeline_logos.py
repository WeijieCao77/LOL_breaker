# -*- coding: utf-8 -*-
"""真实时间线的队标（2026-09-11 作者：「新队的队标去网上搜索并下载补齐」）。

开局那份（export_game.py）只给 2022 年在场的队内嵌了队标；2023–2026 换页进来的新队
（NIP、Karmine Corp、Team Heretics、Shopify Rebellion、NAVI……）原来一律没有队标。
原图放在 data/logos/（128px PNG，来源见 data/logos/来源.md），这里和开局同一个处理：缩到 40x40 转 data URI，
只收「时间线里出现、开局数据里没有队标」的队，写进 data/csv/timeline_logos.json 给游戏读。
"""
import base64, io, json, os, re
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(BASE, "csv")
LOGOS = os.path.join(BASE, "logos")
key = lambda n: re.sub(r"[^A-Za-z0-9]+", "_", n).strip("_").lower()
files = {os.path.splitext(f)[0].lower(): f for f in os.listdir(LOGOS) if f.lower().endswith(".png")}

g = json.load(open(os.path.join(CSV, "game_data_2022.json"), encoding="utf-8"))
have = {t["name"] for ts in g["leagues"].values() for t in ts if t.get("logo")}
names = []
for ts in g["leagues"].values():
    names += [t["name"] for t in ts if not t.get("logo")]
for y in (2023, 2024, 2025, 2026):
    p = os.path.join(CSV, f"timeline_{y}.json")
    if os.path.exists(p):
        for ts in json.load(open(p, encoding="utf-8"))["leagues"].values():
            names += [t["n"] for t in ts]
# LDL 真实名单（2026-09-11，data/export_ldl.py）：二队和独立队的队标
p = os.path.join(CSV, "ldl_pages.json")
if os.path.exists(p):
    for ts in json.load(open(p, encoding="utf-8"))["years"].values():
        names += [t["n"] for t in ts]

out, miss = {}, []
for n in dict.fromkeys(names):
    if n in have or n in out:
        continue
    f = files.get(key(n))
    if not f:
        miss.append(n)
        continue
    im = Image.open(os.path.join(LOGOS, f)).convert("RGBA")
    im.thumbnail((40, 40), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    out[n] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

path = os.path.join(CSV, "timeline_logos.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"导出 {len(out)} 个队标 → {path}（{os.path.getsize(path) // 1024} KB）")
print(f"仍然没有队标 {len(miss)} 支：{miss}")
