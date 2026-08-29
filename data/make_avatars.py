# -*- coding: utf-8 -*-
"""把 data/photos/ 里的选手照片转成 24x24 像素头像，烤进游戏。

用法：
  1. 建 data/photos/ 目录，把照片按「选手ID.jpg」命名放进去（Faker.jpg、Uzi.png……）
  2. python data/make_avatars.py     -> 产出 data/avatars.json
  3. python demo/build.py            -> 头像随构建进 career.html

游戏里 avatarOf() 会优先用这里的像素头像，没有照片的选手
继续用程序化 SVG——两套并存，放几张算几张。

版权提醒：像素化不改变「这是某人肖像」的性质。自己玩随意；
公开发布（B 站 Toy / 小红书）前，确认照片有授权再放进来。"""
import base64, io, json, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, "photos")
OUT  = os.path.join(BASE, "avatars.json")
SIZE, COLORS = 24, 20          # 24x24、20 色：够认出人，也够“像素”

if not os.path.isdir(SRC):
    sys.exit("没有 data/photos/ 目录——建一个，把照片按「选手ID.jpg」放进去")

out = {}
for fn in sorted(os.listdir(SRC)):
    name, ext = os.path.splitext(fn)
    if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        continue
    try:
        from PIL import Image
        im = Image.open(os.path.join(SRC, fn)).convert("RGB")
    except Exception as e:
        print("跳过 %s：%s" % (fn, e)); continue
    w, h = im.size
    s = min(w, h)
    top  = max(0, int((h - s) * 0.25))    # 脸一般偏上，方形裁剪往上凑
    left = (w - s) // 2
    im = im.crop((left, top, left + s, top + s)).resize((SIZE, SIZE), Image.LANCZOS)
    im = im.quantize(colors=COLORS, method=Image.MEDIANCUT).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    out[name] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

json.dump(out, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print("烤了 %d 个像素头像 -> %s" % (len(out), OUT))
print("跑一遍 python demo/build.py 让它们进游戏")
