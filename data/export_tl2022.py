# -*- coding: utf-8 -*-
"""S6 开档（2026-09-17）：2022 年的「年页」。

S12 入口从 game_data_2022.json 开局；S6 入口走到 2022 年要换一次页。两边必须是同一个 2022：
所以这一页的名单、五维、胜率、默契 / 战术直接照抄 game_data_2022.json（逐项一致，test.ts 自检），
只补两样开局快照里没有的东西：
  · from：这支队接的是 2021 年页里哪个席位（先看同名，再看席位易主表，再看首发重合度）
  · pros：2022 年真实新秀池（export_timeline.py 的 oe 模式照常算）
用法：先 PYTHONHASHSEED=0 POXIAO_YEAR=2022 python export_timeline.py，再 python export_tl2022.py（覆盖同一个文件）。
"""
import json, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv")
g = json.load(open(os.path.join(OUT, "game_data_2022.json"), encoding="utf-8"))
page = json.load(open(os.path.join(OUT, "timeline_2022.json"), encoding="utf-8"))   # export_timeline.py 刚导的（取 pros / 结构）
prev = json.load(open(os.path.join(OUT, "timeline_2021.json"), encoding="utf-8"))
DIMS = ["操作", "运营", "心态", "指挥", "体质"]
# 2021 → 2022 确定的改名 / 接席位（Leaguepedia 队伍页）
SUCC = {"Weibo Gaming": "Suning", "Anyone's Legend": "Rogue Warriors", "Ultra Prime": "eStar",
        "Dplus Kia": "DWG KIA", "DN SOOPers": "Afreeca Freecs", "Kiwoom DRX": "DRX", "HANJIN BRION": "Fredit BRION",
        "Team BDS": "FC Schalke 04 Esports", "MAD Lions KOI": "MAD Lions"}


def norm(n):
    return re.sub(r"[^a-z0-9]", "", (n or "").lower())


leagues = {}
for lg, ts in g["leagues"].items():
    pv = prev["leagues"].get(lg, [])
    names = {t["n"] for t in pv}
    out = []
    for t in ts:
        ids = {p["id"].lower() for p in t["players"]}
        frm = t["name"] if t["name"] in names else (SUCC.get(t["name"]) if SUCC.get(t["name"]) in names else None)
        if not frm:
            best, bs = None, 0
            for o in pv:
                sc = (10 if norm(o["n"]) == norm(t["name"]) else 0) + len(ids & {p[0].lower() for p in o["p"]})
                if sc > bs:
                    best, bs = o["n"], sc
            frm = best if bs >= 3 else None
        out.append({"n": t["name"], "from": frm, "wr": t.get("wr", 0.5), "syn": t.get("syn", 50), "tac": t.get("tac", 50),
                    "p": [[p["id"], p.get("cn") or "", p["pos"], p.get("age"), [p["r"][d] for d in DIMS], p.get("form", 52)] for p in t["players"]]})
    leagues[lg] = out
page.update({"year": 2022, "src": "game_data_2022", "major": g["major"], "minor": g["minor"], "intl": g["minor"],
             "rename": {}, "merge": {}, "leagues": leagues})
json.dump(page, open(os.path.join(OUT, "timeline_2022.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for lg, ts in leagues.items():
    print(lg, len(ts), "新席位", [t["n"] for t in ts if not t["from"]], "易主", [f'{t["from"]}→{t["n"]}' for t in ts if t["from"] and t["from"] != t["n"]])
print("pros", len(page.get("pros", [])))
