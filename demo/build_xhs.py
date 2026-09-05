# -*- coding: utf-8 -*-
"""把 career.html 改造成小红书小工具的 zip 包。

和 B 站 Toy 那条线的区别（Toy 那边直接吃单个 HTML，这边不行）：

  · 容器 CSP 的 script-src 不含 unsafe-inline —— 内联 <script> 一律不执行。
    所以必须把整块脚本抽成 app.js，用 <script src="./app.js"> 引入。
  · 禁止文件下载（a[download] / blob 下载），存档的「导出」得去掉。
    「导入」用的 <input type="file"> 虽然元素本身允许，但系统选择器
    只给选图片和视频，选不了 JSON，一起去掉。
  · index.html 必须在 zip 根目录，且压缩的是目录内容而不是目录本身。

样式可以继续内联（容器允许 <style> 和 style="..."），所以主题不用动。
"""
import io, os, re, sys, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "career.html")
OUT = os.path.join(BASE, "xhs")

if not os.path.exists(SRC):
    sys.exit("先跑 npm run bundle 生成 career.html")

html = io.open(SRC, encoding="utf-8").read()

# ---- 1) 把内联脚本抽出来 ----
m = re.search(r"<script>(.*)</script>", html, flags=re.S)
assert m, "找不到内联 script"
js = m.group(1)
html = html[:m.start()] + '<script src="./app.js"></script>' + html[m.end():]

# ---- 2) 去掉被容器禁止的「导出 / 导入存档」----
#     只动这两个按钮和它们的实现，其余存档逻辑（localStorage）原样保留——
#     localStorage 在小工具里是明确可用的。
before = js
js = js.replace('<button class="rt-x" id="saveexp">导出</button>\n    ', "")
js = js.replace('<button class="rt-x" id="saveimp">导入</button>\n    ', "")
assert js != before, "没找到导出/导入按钮，saveBar 结构可能变了"

# 函数体换成空实现：万一还有别处调用，也不会碰到被禁能力
for fn in ("exportSave", "importSave"):
    pat = re.compile(r"function " + fn + r"\(\)\s*\{.*?\n\}", flags=re.S)
    js, n = pat.subn(
        "function " + fn + "(){ /* 小工具容器禁止文件下载与非图片选择，此功能已移除 */ }",
        js, count=1)
    assert n == 1, "没能替换 " + fn

# 绑定也一并摘掉，省得点了没反应
js = re.sub(r'\n\s*const _s2=\$\("saveexp"\);[^\n]*\n\s*const _s3=\$\("saveimp"\);[^\n]*',
            "", js, count=1)

# ---- 3) viewport 按官方模板补齐 ----
html = html.replace(
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, '
    'maximum-scale=1.0, user-scalable=no, viewport-fit=cover">')

# 容器统一管安全策略，包内不许自建 CSP —— 我们本来也没有，这里只做个断言
assert 'http-equiv="Content-Security-Policy"' not in html, "包内不能自带 CSP"

# ---- 4) 落盘 ----
if not os.path.isdir(OUT):
    os.makedirs(OUT)
io.open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)
io.open(os.path.join(OUT, "app.js"), "w", encoding="utf-8").write(js)

# ---- 5) 打包：压缩目录「内容」，index.html 必须在 zip 根 ----
zip_path = os.path.join(BASE, "破局者-小红书小工具.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in ("index.html", "app.js"):
        z.write(os.path.join(OUT, name), arcname=name)

size = os.path.getsize(zip_path)
print("index.html %d bytes" % os.path.getsize(os.path.join(OUT, "index.html")))
print("app.js     %d bytes" % os.path.getsize(os.path.join(OUT, "app.js")))
print("zip        %d bytes = %.2f MB" % (size, size / 1048576.0))
print(zip_path)
