# -*- coding: utf-8 -*-
"""把 theme.css / header.html / game_data 拼进模板，产出可发布的单文件 demo。"""
import io, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)

tpl = io.open(os.path.join(BASE, "career_template.html"), encoding="utf-8").read()
css = io.open(os.path.join(BASE, "theme.css"), encoding="utf-8").read()
hdr = io.open(os.path.join(BASE, "header.html"), encoding="utf-8").read()
intl = io.open(os.path.join(BASE, "intl.js"), encoding="utf-8").read()
team = io.open(os.path.join(BASE, "team.js"), encoding="utf-8").read()
rivals = io.open(os.path.join(BASE, "rivals.js"), encoding="utf-8").read()
rankart = io.open(os.path.join(BASE, "rankart.js"), encoding="utf-8").read()
rankicon = rankart + "\n" + io.open(os.path.join(BASE, "rankicon.js"), encoding="utf-8").read()
shop = io.open(os.path.join(BASE, "shop.js"), encoding="utf-8").read()
origins = io.open(os.path.join(BASE, "origins.js"), encoding="utf-8").read()
achieve = (io.open(os.path.join(BASE, "achieve_more.js"), encoding="utf-8").read()
           + chr(10)
           + io.open(os.path.join(BASE, "achieve.js"), encoding="utf-8").read())
squad = io.open(os.path.join(BASE, "squad.js"), encoding="utf-8").read()
random_ = io.open(os.path.join(BASE, "random.js"), encoding="utf-8").read()
form = io.open(os.path.join(BASE, "form.js"), encoding="utf-8").read()
postm = io.open(os.path.join(BASE, "postmatch.js"), encoding="utf-8").read()
injury = io.open(os.path.join(BASE, "injury.js"), encoding="utf-8").read()
clout = io.open(os.path.join(BASE, "clout.js"), encoding="utf-8").read()
routine = io.open(os.path.join(BASE, "routine.js"), encoding="utf-8").read()
nodes = io.open(os.path.join(BASE, "nodes.js"), encoding="utf-8").read()
cup = io.open(os.path.join(BASE, "cup.js"), encoding="utf-8").read()
save = io.open(os.path.join(BASE, "save.js"), encoding="utf-8").read()
tryout = io.open(os.path.join(BASE, "tryout.js"), encoding="utf-8").read()
data = io.open(os.path.join(ROOT, "data", "csv", "game_data_2022.json"), encoding="utf-8").read()

# 1) 样式
out, n = re.subn(r"<style>.*?</style>", lambda m: "<style>\n" + css + "\n</style>", tpl, count=1, flags=re.S)
assert n == 1, "style block not found"

# 2) 标题区
out, n = re.subn(r"  <header class=\"top\">.*?</header>", lambda m: hdr.rstrip(), out, count=1, flags=re.S)
assert n == 1, "header block not found"

# 3) 国际赛模块
assert "/* __INTL_MODULE__ */" in out, "intl placeholder missing"
out = out.replace("/* __INTL_MODULE__ */", intl)
for ph, mod in (("/* __TEAM_MODULE__ */", team), ("/* __RIVALS_MODULE__ */", rivals), ("/* __RANKICON_MODULE__ */", rankicon), ("/* __SHOP_MODULE__ */", shop), ("/* __ORIGINS_MODULE__ */", origins), ("/* __ACHIEVE_MODULE__ */", achieve), ("/* __SQUAD_MODULE__ */", squad), ("/* __RANDOM_MODULE__ */", random_), ("/* __FORM_MODULE__ */", form), ("/* __POSTMATCH_MODULE__ */", postm), ("/* __INJURY_MODULE__ */", injury), ("/* __CLOUT_MODULE__ */", clout), ("/* __ROUTINE_MODULE__ */", routine), ("/* __NODES_MODULE__ */", nodes), ("/* __CUP_MODULE__ */", cup), ("/* __SAVE_MODULE__ */", save), ("/* __TRYOUT_MODULE__ */", tryout)):
    assert ph in out, ph
    out = out.replace(ph, mod)

# 4) 数据
assert "__GAME_DATA__" in out, "data placeholder missing"
out = out.replace("__GAME_DATA__", data)

# 5) 包成一份完整的 HTML 文档
#
#    在这之前产出的是个片段：没有 doctype、没有 charset、没有 viewport。
#    本地看不出问题，是因为我们自己的 server.js 在响应头里补了 charset，
#    而桌面浏览器对缺失的结构很宽容。但要交给第三方静态托管（比如 B 站 Toy），
#    这三样都必须自带：
#      · 没有 doctype  -> 怪异模式，盒模型和一堆布局行为都不一样
#      · 没有 charset  -> CDN 不带 charset 时中文直接乱码
#      · 没有 viewport -> 手机按 980px 排版再整体缩小，字小到看不清
m = re.search(r"<title>(.*?)</title>", out, flags=re.S)
page_title = m.group(1).strip() if m else "破局者"
out = re.sub(r"<title>.*?</title>[ \t]*\n?", "", out, count=1, flags=re.S)

HEAD = (
    "<!doctype html>\n"
    '<html lang="zh-CN">\n'
    "<head>\n"
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<meta name="theme-color" content="#0B1220">\n'
    '<meta name="color-scheme" content="dark">\n'
    "<title>" + page_title + "</title>\n"
)
BODY_OPEN = '</head>\n<body>\n<div class="wrap">'
assert '<div class="wrap">' in out, "wrap div not found"
out = HEAD + out.replace('<div class="wrap">', BODY_OPEN, 1) + "\n</body>\n</html>\n"

path = os.path.join(BASE, "career.html")
io.open(path, "w", encoding="utf-8").write(out)
print("built", path, os.path.getsize(path), "bytes")
print("logo:", "crackG" in out, "| theme:", "--gold:#C9A961" in out, "| intl:", "intlAdvance" in out)
