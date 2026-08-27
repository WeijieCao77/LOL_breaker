# -*- coding: utf-8 -*-
"""下载一线战队队标，压成小图并内嵌为 data URI 写进 game_data。
   artifact 的 CSP 不允许外链图片，所以必须内嵌。"""
import json, io, os, re, sys, base64, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "csv")
CACHE = os.path.join(BASE, "logos"); os.makedirs(CACHE, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")

game = json.load(open(os.path.join(OUT, "game_data_2022.json"), encoding="utf-8"))
riot = json.load(open(os.path.join(BASE, "raw", "teams_zh.json"), encoding="utf-8"))["data"]["teams"]


def norm(s):
    s = (s or "").lower()
    s = re.sub(r"\b(esports?|gaming|club|team|the)\b", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


# 手工别名：OE 队名 -> Riot 队码
ALIAS = {
    "JD Gaming": "JDG", "Top Esports": "TES", "EDward Gaming": "EDG",
    "Weibo Gaming": "WBG", "LNG Esports": "LNG", "Bilibili Gaming": "BLG",
    "Rare Atom": "RA", "Royal Never Give Up": "RNG", "Invictus Gaming": "IG",
    "FunPlus Phoenix": "FPX", "Team WE": "WE", "Oh My God": "OMG",
    "LGD Gaming": "LGD", "Ultra Prime": "UP", "ThunderTalk Gaming": "TT",
    "Anyone's Legend": "AL", "Ninjas in Pyjamas.CN": "NIP",
    "Victory V": "V5", "Victory Five": "V5",
    "Gen.G": "GEN", "T1": "T1", "Dplus Kia": "DK", "DWG KIA": "DK",
    "Kiwoom DRX": "DRX", "DRX": "DRX", "Liiv SANDBOX": "LSB",
    "KT Rolster": "KT", "Hanwha Life Esports": "HLE", "Nongshim RedForce": "NS",
    "Fredit BRION": "BRO", "Kwangdong Freecs": "KDF",
    "G2 Esports": "G2", "Rogue": "RGE", "Fnatic": "FNC", "MAD Lions": "MAD",
    "MAD Lions KOI": "MAD", "Misfits Gaming": "MSF", "Team Vitality": "VIT",
    "SK Gaming": "SK", "Excel Esports": "XL", "Astralis": "AST", "Team BDS": "BDS",
    "Cloud9": "C9", "Team Liquid": "TL", "100 Thieves": "100",
    "Evil Geniuses": "EG", "FlyQuest": "FLY", "TSM": "TSM",
    "Counter Logic Gaming": "CLG", "Dignitas": "DIG", "Immortals": "IMT",
    "Golden Guardians": "GG", "NRG": "NRG",
}

by_code, by_norm = {}, {}
for t in riot:
    if not t.get("image"):
        continue
    c = (t.get("code") or "").upper()
    if c and c not in by_code:
        by_code[c] = t["image"]
    n = norm(t.get("name"))
    if n and n not in by_norm:
        by_norm[n] = t["image"]


def find_logo(name):
    a = ALIAS.get(name)
    if a and a in by_code:
        return by_code[a]
    n = norm(name)
    if n in by_norm:
        return by_norm[n]
    for k, v in by_norm.items():          # 双向包含
        if len(n) >= 4 and (n in k or k in n):
            return v
    return None


try:
    from PIL import Image
except ImportError:
    print("需要 Pillow"); sys.exit(1)

ok = miss = 0
total_bytes = 0
for lg, teams in game["leagues"].items():
    for t in teams:
        url = find_logo(t["name"])
        if not url:
            miss += 1
            continue
        safe = re.sub(r"[^A-Za-z0-9]", "_", t["name"])[:40]
        raw = os.path.join(CACHE, safe + ".png")
        if not os.path.exists(raw):
            try:
                req = urllib.request.Request(url.replace("http://", "https://"),
                                             headers={"User-Agent": UA})
                data = urllib.request.urlopen(req, timeout=25).read()
                open(raw, "wb").write(data)
            except Exception as e:
                miss += 1
                continue
        try:
            im = Image.open(raw).convert("RGBA")
            im.thumbnail((44, 44), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            b = buf.getvalue()
            t["logo"] = "data:image/png;base64," + base64.b64encode(b).decode()
            total_bytes += len(b)
            ok += 1
        except Exception:
            miss += 1

path = os.path.join(OUT, "game_data_2022.json")
json.dump(game, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("队标内嵌 %d 个，缺失 %d 个" % (ok, miss))
print("图片总计 %.0f KB，game_data 现在 %.0f KB" % (total_bytes / 1024, os.path.getsize(path) / 1024))
for lg, teams in game["leagues"].items():
    got = sum(1 for t in teams if t.get("logo"))
    print("  %-7s %d/%d" % (lg, got, len(teams)))
