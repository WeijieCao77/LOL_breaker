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
for ph, mod in (("/* __TEAM_MODULE__ */", team), ("/* __RIVALS_MODULE__ */", rivals), ("/* __RANKICON_MODULE__ */", rankicon), ("/* __SHOP_MODULE__ */", shop), ("/* __ORIGINS_MODULE__ */", origins), ("/* __ACHIEVE_MODULE__ */", achieve), ("/* __SQUAD_MODULE__ */", squad), ("/* __RANDOM_MODULE__ */", random_), ("/* __FORM_MODULE__ */", form), ("/* __POSTMATCH_MODULE__ */", postm), ("/* __INJURY_MODULE__ */", injury), ("/* __CLOUT_MODULE__ */", clout), ("/* __ROUTINE_MODULE__ */", routine), ("/* __NODES_MODULE__ */", nodes), ("/* __CUP_MODULE__ */", cup), ("/* __SAVE_MODULE__ */", save)):
    assert ph in out, ph
    out = out.replace(ph, mod)

# 4) 数据
assert "__GAME_DATA__" in out, "data placeholder missing"
out = out.replace("__GAME_DATA__", data)

path = os.path.join(BASE, "career.html")
io.open(path, "w", encoding="utf-8").write(out)
print("built", path, os.path.getsize(path), "bytes")
print("logo:", "crackG" in out, "| theme:", "--gold:#C9A961" in out, "| intl:", "intlAdvance" in out)
