"""按人认出生年，重算游戏数据里的年龄——只动年龄，别的一个字节都不许变（2026-09-14）。

原来导出脚本按「小写 ID」查生日，同 ID 多人时取第一条，年龄串到别人身上
（Palette 显示 17 岁、Violet 33 岁，实际都是 22–23）。现在按 names.birth_year 认人：
认得出、生日查得到才改；定不下来的保持原值。退役传奇是手挑名单、按真实出生年写的，不动。
用法：python data/fix_ages.py        （就地改 data/csv 下的当前数据）
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from names import birth_year  # noqa: E402

FILES = ["game_data_2022.json"] + [f"timeline_{y}.json" for y in (2023, 2024, 2025, 2026)] + ["ldl_pages.json"]


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def slots(o, name):
    """(容器, 键, 年, 队, ID, 地区, 位置说明)"""
    if name == "game_data_2022.json":
        for lg, ts in o["leagues"].items():
            for t in ts:
                for p in t["players"]:
                    yield p, "age", 2022, t["name"], p["id"], lg, f"2022 {lg} {t['name']}"
    elif name.startswith("timeline_"):
        y = o["year"]
        for lg, ts in o["leagues"].items():
            for t in ts:
                for p in t["p"]:
                    yield p, 3, y, t["n"], p[0], lg, f"{y} {lg} {t['n']}"
        for p in o.get("pros", []):
            yield p, 3, y, None, p[0], (p[6] if len(p) > 6 else None), f"{y} 新秀池"
    else:
        for y, ts in o["years"].items():
            for t in ts:
                for p in t["p"]:
                    yield p, 3, int(y), t["n"], p[0], "LDL", f"{y} LDL {t['n']}"


changes = []
for name in FILES:
    path = os.path.join(HERE, "csv", name)
    raw = open(path, encoding="utf-8").read()
    o = json.loads(raw)
    tail = raw[len(raw.rstrip("\n")):]
    if dumps(o) != raw.rstrip("\n"):
        sys.exit(f"{name}：原文件不是紧凑 JSON 写法，重写会动到别的字节，停下")
    for box, key, y, team, pid, reg, where in slots(o, name):
        by = birth_year(y, team, pid, reg)
        if by is None:
            continue
        new = y - by
        if box[key] != new:
            changes.append((where, pid, box[key], new))
            box[key] = new
    a, b = json.loads(raw), json.loads(dumps(o))
    for x in (a, b):
        for box, key, *_ in slots(x, name):
            box[key] = None
    if a != b:
        sys.exit(f"{name}：除年龄外还有别的变化，停下")
    open(path, "w", encoding="utf-8", newline="").write(dumps(o) + tail)

print(f"年龄改动 {len(changes)} 处")
for where, pid, old, new in changes:
    print(f"  {pid}: {old} → {new}（{where}）")
