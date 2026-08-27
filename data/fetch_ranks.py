# -*- coding: utf-8 -*-
"""下载官方段位徽章，压小后内嵌为 data URI。
   来源：Community Dragon（Riot 客户端资源的公开镜像）。"""
import io, os, json, base64, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(BASE, "ranks"); os.makedirs(CACHE, exist_ok=True)
OUT = os.path.join(os.path.dirname(BASE), "demo", "rankart.js")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")
ROOT = ("https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/"
        "global/default/images/ranked-emblem/emblem-%s.png")

# 只要游戏里会用到的档位（玩家从黄金起步）
TIERS = ["gold", "platinum", "diamond", "master", "grandmaster", "challenger"]

from PIL import Image

art = {}
total = 0
for t in TIERS:
    raw = os.path.join(CACHE, t + ".png")
    if not os.path.exists(raw):
        req = urllib.request.Request(ROOT % t, headers={"User-Agent": UA})
        open(raw, "wb").write(urllib.request.urlopen(req, timeout=30).read())
    im = Image.open(raw).convert("RGBA")
    # 源图是 1280x720 的大画布，徽章只占 3%——必须先裁到实际内容
    bb = im.split()[3].getbbox()
    if bb:
        im = im.crop(bb)
    im.thumbnail((112, 112), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    b = buf.getvalue()
    art[t] = "data:image/png;base64," + base64.b64encode(b).decode()
    total += len(b)
    print("  %-12s %5.0f KB" % (t, len(b) / 1024))

js = ("/* 官方段位徽章（Community Dragon 镜像，压至 96px 内嵌）。\n"
      "   artifact 的 CSP 不允许外链图片，必须内嵌。 */\n"
      "const RANK_ART=" + json.dumps(art, ensure_ascii=False) + ";\n")
io.open(OUT, "w", encoding="utf-8").write(js)
print("总计 %.0f KB -> %s" % (total / 1024, OUT))
