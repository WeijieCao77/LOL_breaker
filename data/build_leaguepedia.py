# -*- coding: utf-8 -*-
"""Leaguepedia 数据 -> 逐赛季名单 CSV（一人一行），并挂载选手中文名/国籍/生日。"""
import gzip, json, csv, os, re, collections

BASE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(BASE, "csv"); os.makedirs(OUT, exist_ok=True)
d = json.load(gzip.open(os.path.join(BASE,"raw","leaguepedia_lol_data.json.gz"),"rt",encoding="utf-8"))

def clean(v):
    if v is None: return ""
    v = str(v)
    v = re.sub(r"&lt;br&gt;|<br\s*/?>", " / ", v)
    return re.sub(r"'''", "", v).strip()

# ---- 选手主表：用 OverviewPage 和 ID 两种键索引 ----
pmap = {}
for p in d["players"]:
    rec = dict(player_id=clean(p.get("ID")), real_name=clean(p.get("Name")),
               name_cn=clean(p.get("NativeName")), country=clean(p.get("Country")),
               residency=clean(p.get("Residency")), main_role=clean(p.get("Role")),
               birthdate=clean(p.get("Birthdate")), is_retired=p.get("IsRetired") or 0,
               current_team=clean(p.get("Team")))
    for k in (clean(p.get("OverviewPage")), clean(p.get("ID"))):
        if k: pmap.setdefault(k.lower(), rec)   # 大小写不敏感

# ---- 联赛 -> 赛区/层级 归类 ----
MAJOR = {"Tencent LoL Pro League":("LPL","中国"),"LoL Champions Korea":("LCK","韩国"),
         "LoL EMEA Championship":("LEC","欧洲"),"League of Legends Championship Series":("LCS","北美"),
         "League of Legends Championship Pacific":("LCP","亚太"),"Pacific Championship Series":("PCS","太平洋"),
         "Vietnam Championship Series":("VCS","越南"),"Circuit Brazilian League of Legends":("CBLOL","巴西"),
         "Liga Latinoamerica":("LLA","拉美"),"LoL Japan League":("LJL","日本"),
         "Turkish Championship League":("TCL","土耳其"),"LoL Circuit Oceania":("LCO","大洋洲"),
         "League of Legends Championship of The Americas North":("LTA North","美洲北"),
         "League of Legends Championship of The Americas South":("LTA South","美洲南")}
INTL  = {"World Championship":("Worlds","国际"),"Mid-Season Invitational":("MSI","国际"),
         "First Stand Tournament":("First Stand","国际"),"Esports World Cup":("EWC","国际"),
         "Demacia Cup":("Demacia Cup","中国")}
ACAD  = {"LoL Development League":("LDL","中国二队"),"LoL Secondary Pro League":("LSPL","中国次级"),
         "LCK Challengers League":("LCK CL","韩国二队"),"LCK Academy Series":("LCK Academy","韩国青训"),
         "North American Challengers League":("NACL","北美二队"),"NA Academy League":("NA Academy","北美二队"),
         "EMEA Masters":("EMEA Masters","欧洲次级"),"European Masters":("EU Masters","欧洲次级"),
         "Circuit Brazilian League of Legends Academy":("CBLOL Academy","巴西二队"),
         "Circuito Desafiante":("Circuito Desafiante","巴西次级"),
         "Pacific Challengers League":("PCL","太平洋二队"),"LCP Wildcard League":("LCP Wildcard","亚太次级")}

def classify(league):
    if league in MAJOR: return MAJOR[league][0], MAJOR[league][1], "一级联赛"
    if league in INTL:  return INTL[league][0],  INTL[league][1],  "国际赛事"
    if league in ACAD:  return ACAD[league][0],  ACAD[league][1],  "二级/青训"
    return league, "", "其他"

rows = []
for src in ("rosters_2022plus","lspl_historic"):
    for r in d[src]:
        short, region_cn, tier = classify(r.get("League") or "")
        if tier == "其他": continue                      # 只留正赛体系
        links = [x for x in clean(r.get("RosterLinks")).split(";;") if x]
        roles = clean(r.get("Roles")).split(";;")
        for i, link in enumerate(links):
            role = roles[i] if i < len(roles) else ""
            info = pmap.get(link.lower(), {})
            rows.append(dict(
                year=r.get("Year") or "", split=clean(r.get("Split")),
                league_short=short, league_full=clean(r.get("League")),
                region=region_cn, tier=tier,
                tournament=clean(r.get("Name")),
                date_start=clean(r.get("DateStart")),
                team=clean(r.get("Team")), team_short=clean(r.get("Short")),
                role=role,
                player_id=info.get("player_id") or link,
                name_cn=info.get("name_cn",""), real_name=info.get("real_name",""),
                country=info.get("country",""), residency=info.get("residency",""),
                birthdate=info.get("birthdate",""), is_retired=info.get("is_retired",""),
                roster_link=link))

def dump(path, data, fields=None):
    if not data: return
    fields = fields or list(data[0].keys())
    with open(os.path.join(OUT,path),"w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(data)

dump("rosters_by_season.csv", rows)
for t,fn in (("一级联赛","rosters_major.csv"),("二级/青训","rosters_academy.csv"),("国际赛事","rosters_international.csv")):
    dump(fn, [r for r in rows if r["tier"]==t])
for lg in ("LPL","LDL","LCK","LEC","LCS","Worlds","MSI","LSPL"):
    dump(f"rosters_{lg}.csv", [r for r in rows if r["league_short"]==lg])

# 选手 & 战队主表
dump("players_master.csv", [dict(player_id=clean(p.get("ID")), name_cn=clean(p.get("NativeName")),
      real_name=clean(p.get("Name")), country=clean(p.get("Country")), residency=clean(p.get("Residency")),
      role=clean(p.get("Role")), current_team=clean(p.get("Team")), birthdate=clean(p.get("Birthdate")),
      is_retired=p.get("IsRetired") or 0, overview_page=clean(p.get("OverviewPage"))) for p in d["players"]])
dump("teams_master.csv", [dict(name=clean(t.get("Name")), short=clean(t.get("Short")),
      region=clean(t.get("Region")), location=clean(t.get("Location")),
      org=clean(t.get("OrganizationPage")), is_disbanded=t.get("IsDisbanded") or 0,
      renamed_to=clean(t.get("RenamedTo"))) for t in d["teams"]])

print("名单行数(一人一行):", len(rows))
print("按层级:", dict(collections.Counter(r["tier"] for r in rows)))
print("按联赛:", dict(collections.Counter(r["league_short"] for r in rows).most_common()))
print("有中文名的行:", sum(1 for r in rows if r["name_cn"]))
print("->", OUT)
