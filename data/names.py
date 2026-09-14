"""选手姓名（2026-09-14 玩家实锤：Knight 显示成韩文、Viper 名字错）。

原来三个导出脚本都用「小写 ID → players_master.csv 的 name_cn」查名字，同一个 ID 有好几个人时
取第一条（Knight 有卓定、韩国 이건、越南和拉美选手；Viper 有朴到贤、中国的何皓、泰国选手）——
四十多个 ID 配到了别人头上。现在按「人」认，不按 ID：
  1. 逐赛季名册（rosters_by_season.csv）每行带选手页面链接（roster_link）＝一个人。
     同年同队 → 同年 → 同年按赛区筛 → 相邻年份，哪一步只剩一个人就用他的原文名；
     这个人名册里没有原文名（越南、欧美、拉美选手）就确定留空，不再顺延到别的同 ID 选手；
  2. 名册里没有这个 ID、总表里这个 ID 也只有一个人，才用总表；
  3. 还定不下来返回 None——调用方保持原值，不猜；
  4. 人工核实过的个案写在 names_override.csv（year / team 可写 *，name 写 - 表示确定留空）；
  5. 知名韩国选手（2022–2026 打过 MSI / 世界赛）换成中文媒体通用的中文名：names_zh_kr.csv，有出处才收。
"""
import collections
import csv
import os
import re

CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "csv")
HANGUL = re.compile(r"[가-힣]")

# 游戏里的赛区 / 新秀池地区码 → 名册 residency 里会出现的词
REGION_WORDS = {
    "KR": ("Korea",), "LCK": ("Korea",), "CN": ("China",), "LPL": ("China",), "LDL": ("China",),
    "PAC": ("Asia Pacific", "PCS", "Vietnam", "Japan"), "PCS": ("Asia Pacific", "PCS"), "LCP": ("Asia Pacific", "Vietnam", "Japan"),
    "VCS": ("Vietnam",), "LJL": ("Japan",), "LAT": ("Latin America",), "LLA": ("Latin America",),
    "EU": ("EMEA", "Europe"), "LEC": ("EMEA", "Europe"), "TCL": ("Turkey", "EMEA"), "NA": ("North America",), "LCS": ("North America",),
    "BR": ("Brazil",), "CBLOL": ("Brazil",), "OCE": ("Oceania",), "LCO": ("Oceania",),
}


def _rd(name):
    p = os.path.join(CSV, name)
    return list(csv.DictReader(open(p, encoding="utf-8-sig"))) if os.path.exists(p) else []


def _k(s):
    return (s or "").strip().lower()


# (年, ID) → [(队, 链接, 原文名, 赛区)]；链接 → 这个人的原文名（取出现最多的非空写法）
_rows = collections.defaultdict(list)
_link_names = collections.defaultdict(collections.Counter)
for _r in _rd("rosters_by_season.csv"):
    _pid = _k(_r.get("player_id"))
    if not _pid:
        continue
    _link = _k(_r.get("roster_link")) or ("?" + _pid)
    _nm = (_r.get("name_cn") or "").strip()
    _rows[(str(_r.get("year")), _pid)].append((_k(_r.get("team")), _link, _nm, _r.get("residency") or ""))
    if _nm:
        _link_names[_link][_nm] += 1

_master = collections.defaultdict(list)
_page_name = {}   # 选手页面（overview_page）→ 总表里这个人自己的原文名（可能是空串）
for _r in _rd("players_master.csv"):
    _pid = _k(_r.get("player_id"))
    if _pid:
        _master[_pid].append((_r.get("name_cn") or "").strip())
    _pg = _k(_r.get("overview_page"))
    if _pg:
        _page_name[_pg] = (_r.get("name_cn") or "").strip() or _page_name.get(_pg, "")

ZH = {(_k(r.get("id")), (r.get("hangul") or "").strip()): (r.get("zh") or "").strip()
      for r in _rd("names_zh_kr.csv") if (r.get("zh") or "").strip()}
OVERRIDE = {}
for r in _rd("names_override.csv"):
    nm = (r.get("name") or "").strip()
    if nm:
        OVERRIDE[((r.get("year") or "*").strip(), _k(r.get("team")) or "*", _k(r.get("id")))] = "" if nm == "-" else nm


def _person(links):
    """一组链接只剩一个人：返回他的原文名。名册那几行没挂名字，就按页面链接去总表查这个人本人——
    总表里也确实没有才是空串（越南 / 欧美 / 拉美选手）；总表里查不到这个人返回 None。不止一个人返回 None。"""
    if len(links) != 1:
        return None
    link = next(iter(links))
    c = _link_names.get(link)
    if c:
        return c.most_common(1)[0][0]
    return _page_name.get(link)


def native_name(year, team, pid, region=None):
    """名册口径的原文名；确定没有原文名返回空串；定不下来返回 None。"""
    k, y, t = _k(pid), str(year), _k(team)
    for key in ((y, t, k), (y, "*", k), ("*", t, k), ("*", "*", k)):
        if key in OVERRIDE:
            return OVERRIDE[key]
    rows = _rows.get((y, k), [])
    if t:
        n = _person({l for tm, l, _, _ in rows if tm == t})
        if n is not None:
            return n
    n = _person({l for _, l, _, _ in rows})
    if n is not None:
        return n
    if rows and region in REGION_WORDS:
        n = _person({l for _, l, _, res in rows if any(w in res for w in REGION_WORDS[region])})
        if n is not None:
            return n
    if not rows:
        for dy in (-1, 1, -2, 2):
            near = _rows.get((str(int(year) + dy), k), [])
            n = _person({l for _, l, _, _ in near})
            if n is not None:
                return n
            if near:
                break
    m = _master.get(k, [])
    if len(m) == 1 and not any(_rows.get((str(yy), k)) for yy in range(2019, 2031)):
        return m[0]
    return None


def name_for(year, team, pid, region=None):
    """游戏里显示的名字：原文名，知名韩国选手换中文名；定不下来返回 None（调用方保持原值）。"""
    n = native_name(year, team, pid, region)
    if n and HANGUL.search(n):
        n = ZH.get((_k(pid), n), n)
    return n
