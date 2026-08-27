# -*- coding: utf-8 -*-
"""把 Riot 官方 esports API 的 teams/players 整理成 CSV。"""
import json, csv, os, re, collections

BASE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(BASE, "csv"); os.makedirs(OUT, exist_ok=True)

zh = json.load(open(os.path.join(BASE,"raw","teams_zh.json"), encoding="utf-8"))["data"]["teams"]
en = json.load(open(os.path.join(BASE,"raw","teams_en.json"), encoding="utf-8"))["data"]["teams"]
en_by_id = {t["id"]: t for t in en}

ACADEMY_RE = re.compile(r"(academy|challengers?|youth|rising|development|\bacad\b|junior)", re.I)
# 顶级赛区（含现役与历史建制）
MAJOR = {"LPL","LCK","LEC","LCS","LTA North","LTA South","LTA Cross-Conference",
         "PCS","VCS","LCP","CBLOL","LLA","LJL","LCO","TCL","LCL"}
ACADEMY_LEAGUES = {"LCK Challengers","NACL","EMEA Masters","Circuito Desafiante"}

def league_of(t):
    hl = t.get("homeLeague") or {}
    return hl.get("name") or "", hl.get("region") or ""

def tier(lname, tname):
    if lname in ACADEMY_LEAGUES or ACADEMY_RE.search(tname or ""): return "academy"
    if lname in MAJOR: return "major"
    if lname in ("Worlds","MSI","Esports World Cup","First Stand","TFT Esports "): return "international"
    if lname: return "regional"
    return "unaffiliated"

team_rows, player_rows = [], []
for t in zh:
    lname, lregion = league_of(t)
    e = en_by_id.get(t["id"], {})
    el = (e.get("homeLeague") or {}).get("region","")
    tr = tier(lname, t.get("name"))
    players = t.get("players") or []
    team_rows.append(dict(
        team_id=t["id"], code=t.get("code",""), name=t.get("name",""), slug=t.get("slug",""),
        league=lname, region_zh=lregion, region_en=el, tier=tr,
        status=t.get("status",""), player_count=len(players), logo=t.get("image","")))
    for p in players:
        player_rows.append(dict(
            player_id=p.get("id",""), summoner_name=p.get("summonerName",""),
            first_name=p.get("firstName",""), last_name=p.get("lastName",""),
            role=p.get("role",""), team_id=t["id"], team_code=t.get("code",""),
            team_name=t.get("name",""), league=lname, region_zh=lregion, region_en=el,
            tier=tr, team_status=t.get("status",""), photo=p.get("image","")))

def dump(path, rows, fields):
    with open(os.path.join(OUT,path),"w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)

dump("teams_all.csv", team_rows, list(team_rows[0].keys()))
dump("players_all.csv", player_rows, list(player_rows[0].keys()))
for tr in ("major","academy","regional","international","unaffiliated"):
    dump(f"teams_{tr}.csv",  [r for r in team_rows   if r["tier"]==tr], list(team_rows[0].keys()))
    dump(f"players_{tr}.csv",[r for r in player_rows if r["tier"]==tr], list(player_rows[0].keys()))
dump("teams_LPL.csv",   [r for r in team_rows   if r["league"]=="LPL"], list(team_rows[0].keys()))
dump("players_LPL.csv", [r for r in player_rows if r["league"]=="LPL"], list(player_rows[0].keys()))

print("teams:", len(team_rows), " players:", len(player_rows))
print("by tier (teams):", dict(collections.Counter(r["tier"] for r in team_rows)))
print("by tier (players):", dict(collections.Counter(r["tier"] for r in player_rows)))
print("roles:", dict(collections.Counter(r["role"] for r in player_rows)))
print("files ->", OUT)
