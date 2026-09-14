"""选手姓名与生日（2026-09-14 玩家实锤：Knight 显示成韩文、Viper 名字错；顺带查出年龄也串人）。

原来导出脚本都用「小写 ID → 总表」查名字和生日，同一个 ID 有好几个人时取第一条
（Knight 有卓定、韩国 이건、越南和拉美选手；Viper 有朴到贤、中国的何皓、泰国选手）——
四十多个 ID 的名字配到了别人头上，年龄也跟着串（Palette 显示 17 岁、Violet 33 岁，实际都是 22–23）。
现在先认人，再取他的名字 / 生日：
  1. 逐赛季名册（rosters_by_season.csv）每行带选手页面链接（roster_link）＝一个人。
     同年同队 → 同年 → 同年按赛区筛 → 相邻年份（这个 ID 当年不在名册里才看），哪一步只剩一个人就是他；
  2. 认出了人：名字 / 生日取名册里他那几行；名册没挂就按页面链接查总表本人；
     总表里确实没有原文名（越南、欧美、拉美选手）名字就是空串；都查不到返回 None；
  3. 认不出人：总表里这个 ID 只有一个人、名册里又从没出现过，才用总表；否则 None（调用方保持原值，不猜）；
  4. 人工核实过的名字写在 names_override.csv（year / team 可写 *，name 写 - 表示确定留空）；
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


def _by(s):
    """出生年：和导出脚本同一个有效区间"""
    s = (s or "").strip()
    return int(s[:4]) if len(s) >= 4 and s[:4].isdigit() and 1985 <= int(s[:4]) <= 2012 else None


# (年, ID) → [(队, 链接, 原文名, 赛区)]；链接 → 这个人的原文名 / 出生年（取出现最多的写法）
_rows = collections.defaultdict(list)
_link_names = collections.defaultdict(collections.Counter)
_link_birth = collections.defaultdict(collections.Counter)
for _r in _rd("rosters_by_season.csv"):
    _pid = _k(_r.get("player_id"))
    if not _pid:
        continue
    _link = _k(_r.get("roster_link")) or ("?" + _pid)
    _nm = (_r.get("name_cn") or "").strip()
    _rows[(str(_r.get("year")), _pid)].append((_k(_r.get("team")), _link, _nm, _r.get("residency") or ""))
    if _nm:
        _link_names[_link][_nm] += 1
    if _by(_r.get("birthdate")):
        _link_birth[_link][_by(_r.get("birthdate"))] += 1

_master = collections.defaultdict(list)          # ID → 总表里这个 ID 的每个人（原文名, 出生年）
_page_name, _page_birth = {}, {}                  # 选手页面 → 总表里这个人自己的原文名 / 出生年
for _r in _rd("players_master.csv"):
    _pid = _k(_r.get("player_id"))
    _nm, _b = (_r.get("name_cn") or "").strip(), _by(_r.get("birthdate"))
    if _pid:
        _master[_pid].append((_nm, _b))
    _pg = _k(_r.get("overview_page"))
    if _pg:
        _page_name[_pg] = _nm or _page_name.get(_pg, "")
        if _b:
            _page_birth[_pg] = _b

ZH = {(_k(r.get("id")), (r.get("hangul") or "").strip()): (r.get("zh") or "").strip()
      for r in _rd("names_zh_kr.csv") if (r.get("zh") or "").strip()}
OVERRIDE = {}
for r in _rd("names_override.csv"):
    nm = (r.get("name") or "").strip()
    if nm:
        OVERRIDE[((r.get("year") or "*").strip(), _k(r.get("team")) or "*", _k(r.get("id")))] = "" if nm == "-" else nm


def _who(year, team, pid, region=None):
    """认人：返回这个人的选手页面链接；认不出来返回 None"""
    k, y, t = _k(pid), str(year), _k(team)
    rows = _rows.get((y, k), [])
    steps = []
    if t:
        steps.append({l for tm, l, _, _ in rows if tm == t})
    steps.append({l for _, l, _, _ in rows})
    if rows and region in REGION_WORDS:
        steps.append({l for _, l, _, res in rows if any(w in res for w in REGION_WORDS[region])})
    for s in steps:
        if len(s) == 1:
            return next(iter(s))
    if not rows:
        for dy in (-1, 1, -2, 2):
            near = {l for _, l, _, _ in _rows.get((str(int(year) + dy), k), [])}
            if len(near) == 1:
                return next(iter(near))
            if near:
                break
    return None


def _only_master(k, idx):
    """认不出人时的兜底：总表里这个 ID 只有一个人、名册里又从没出现过"""
    m = _master.get(k, [])
    if len(m) == 1 and not any(_rows.get((str(yy), k)) for yy in range(2019, 2031)):
        return m[0][idx]
    return None


def native_name(year, team, pid, region=None):
    """名册口径的原文名；确定没有原文名返回空串；定不下来返回 None。"""
    k, y, t = _k(pid), str(year), _k(team)
    for key in ((y, t, k), (y, "*", k), ("*", t, k), ("*", "*", k)):
        if key in OVERRIDE:
            return OVERRIDE[key]
    link = _who(year, team, pid, region)
    if link is not None:
        c = _link_names.get(link)
        return c.most_common(1)[0][0] if c else _page_name.get(link)
    return _only_master(k, 0)


def name_for(year, team, pid, region=None):
    """游戏里显示的名字：原文名，知名韩国选手换中文名；定不下来返回 None（调用方保持原值）。"""
    n = native_name(year, team, pid, region)
    if n and HANGUL.search(n):
        n = ZH.get((_k(pid), n), n)
    return n


def birth_year(year, team, pid, region=None):
    """按人认的出生年；定不下来返回 None（调用方保持原来的年龄）。"""
    link = _who(year, team, pid, region)
    if link is not None:
        c = _link_birth.get(link)
        return c.most_common(1)[0][0] if c else _page_birth.get(link)
    return _only_master(_k(pid), 1)
