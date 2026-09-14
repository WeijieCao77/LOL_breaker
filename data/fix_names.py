"""把游戏数据里的选手姓名按 names.py 重新认一遍——只动名字，别的一个字节都不许变。

用法：python data/fix_names.py --base <提交> [--table]
  --base   从这个提交取原始数据（git show），逐个位置算新名字，写回 data/csv/*.json
  --table  同时生成 demo/src/namefix.ts：老档读档时按「ID + 旧名 → 新名」更正（save.ts 的 fixPlayerNames）
定不下来的（同 ID 多人、名册查不到）保持原值，不猜。
"""
import collections
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from names import HANGUL, ZH, name_for  # noqa: E402

LEGEND = "<传奇>"

args = sys.argv[1:]
if "--base" not in args:
    sys.exit(__doc__)
BASE = args[args.index("--base") + 1]
FILES = ["data/csv/game_data_2022.json"] + [f"data/csv/timeline_{y}.json" for y in (2023, 2024, 2025, 2026)] + ["data/csv/ldl_pages.json"]


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def slots(o, path):
    """这份数据里所有名字位置：(容器, 键, 年, 队, ID, 地区, 位置说明)"""
    if path.endswith("game_data_2022.json"):
        for lg, ts in o["leagues"].items():
            for t in ts:
                for p in t["players"]:
                    yield p, "cn", 2022, t["name"], p["id"], lg, f"2022 {lg} {t['name']}"
        for p in o.get("legends", []):   # 退役传奇是手挑的名单，人不会认错：只套中文译名
            yield p, "cn", 2022, None, p["id"], LEGEND, f"2022 退役传奇 {p['id']}"
    elif "timeline_" in path:
        y = o["year"]
        for lg, ts in o["leagues"].items():
            for t in ts:
                for p in t["p"]:
                    yield p, 1, y, t["n"], p[0], lg, f"{y} {lg} {t['n']}"
        for p in o.get("pros", []):
            reg = p[6] if len(p) > 6 else None
            yield p, 1, y, None, p[0], reg, f"{y} 新秀池 {reg}"
    else:
        for y, ts in o["years"].items():
            for t in ts:
                for p in t["p"]:
                    yield p, 1, int(y), t["n"], p[0], "LDL", f"{y} LDL {t['n']}"


changes, kept = [], collections.defaultdict(int)
for path in FILES:
    raw = subprocess.check_output(["git", "-C", ROOT, "show", f"{BASE}:{path}"]).decode("utf-8")
    o = json.loads(raw)
    tail = raw[len(raw.rstrip("\n")):]
    if dumps(o) != raw.rstrip("\n"):
        sys.exit(f"{path}：原文件不是紧凑 JSON 写法，重写会动到别的字节，停下")
    for box, key, y, team, pid, reg, where in slots(o, path):
        old = box[key] or ""
        if reg == LEGEND:
            n = ZH.get((pid.lower(), old)) if HANGUL.search(old) else None
        else:
            n = name_for(y, team, pid, reg)
        new = old if n is None else n   # None＝定不下来，保持原值；空串＝确定没有中韩文名
        if new != old:
            changes.append((path, where, pid, old, new))
            box[key] = new
        else:
            kept[(pid.lower(), old)] += 1
    # 只动名字：两边的名字位置都抹成空再比
    a, b = json.loads(raw), json.loads(dumps(o))
    for box, key, *_ in slots(a, path):
        box[key] = ""
    for box, key, *_ in slots(b, path):
        box[key] = ""
    if a != b:
        sys.exit(f"{path}：除名字外还有别的变化，停下")
    open(os.path.join(ROOT, path), "w", encoding="utf-8", newline="").write(dumps(o) + tail)

pairs = collections.OrderedDict()
for _, where, pid, old, new in changes:
    pairs.setdefault((pid, old), set()).add(new)
print(f"改动 {len(changes)} 处，涉及 {len(pairs)} 组（ID + 旧名）")
for (pid, old), news in pairs.items():
    flag = "" if len(news) == 1 and not kept.get((pid.lower(), old)) else "  ← 老档表里不收（同一个旧名在别处是对的 / 改成了不同的名字）"
    print(f"  {pid}: {old or '（空）'} → {' / '.join(sorted(news))}{flag}")

if "--table" in args:
    rows = [(pid, old, next(iter(news))) for (pid, old), news in pairs.items()
            if old and len(news) == 1 and not kept.get((pid.lower(), old))]
    ts = ["/* 自动生成（data/fix_names.py --table），不要手改。",
          "   选手姓名更正表：老档里存下来的「ID + 旧名」→ 新名——同 ID 多人配错了人、知名韩国选手换中文名（2026-09-14）。",
          "   见 save.ts 的 fixPlayerNames。 */",
          'export const NAME_FIX_VER = "20260914";',
          "export const NAME_FIX: [string, string, string][] = ["]
    ts += [f"  {json.dumps([p, a, b], ensure_ascii=False)}," for p, a, b in rows]
    ts += ["];", ""]
    open(os.path.join(ROOT, "demo", "src", "namefix.ts"), "w", encoding="utf-8", newline="").write("\n".join(ts))
    print(f"namefix.ts：{len(rows)} 条")
