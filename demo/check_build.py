# -*- coding: utf-8 -*-
"""构建一致性检查：提交的 demo/career.html 必须等于 bundle.mjs 的产物。

   像素头像（data/avatars.json）不进仓库，CI 上构建出来的是空表；比较时把
   两边的 AVATARS_JSON 那一行都抹成同一个占位，其余逐字节比对。
   退出码 0 = 一致；1 = 不一致（先本地 `npm run bundle` 再提交）。"""
import io, os, re, subprocess, sys, tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
committed = os.path.join(BASE, "career.html")
if not os.path.exists(committed):
    print("demo/career.html 不存在"); sys.exit(1)

tmp = os.path.join(tempfile.mkdtemp(), "career.html")
subprocess.check_call(["node", os.path.join(BASE, "bundle.mjs"), "--out", tmp, "--no-avatars"],
                      stdout=subprocess.DEVNULL)

def norm(p):
    s = io.open(p, encoding="utf-8").read()
    # 头像表是 bundle.mjs 写进 src/gen/avatars.ts 的一行 JSON 字符串；本地有、CI 没有，比对前抹平
    s, n = re.subn(r'AVATARS_JSON = "(?:[^"\\]|\\.)*";', 'AVATARS_JSON = "{}";', s, count=1)
    assert n == 1, "AVATARS_JSON 声明没找到：" + p
    return s

a, b = norm(committed), norm(tmp)
if a == b:
    print("build consistency: OK"); sys.exit(0)
# 找第一处不同，给个可读的位置
i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
line = a.count("\n", 0, i) + 1
print(f"build consistency: MISMATCH（提交产物 {len(a)} 字节，构建产物 {len(b)} 字节，第一处差异在第 {line} 行）")
print("请本地运行 python demo/build.py 后把 demo/career.html 一起提交。")
sys.exit(1)
