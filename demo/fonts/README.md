# 自托管字体

| 文件 | 来源 | 用途 |
|---|---|---|
| `poxiao-serif-700.woff` | **Noto Serif SC**（Google Noto 项目）Bold（wght 700）实例的子集，749 字，159KB | 只给展示级大字：结局称号、生涯名片、HUD「现在」、弹窗标题、页头。`theme.css` 里的 `@font-face "Poxiao Serif"` |

## 怎么生成的

`C:\Windows\Fonts\NotoSerifSC-VF.ttf`（可变字体）→ `fontTools.varLib.instancer` 定在 wght=700 →
`fontTools.subset` 按源码里展示位会出现的字符（结局文案、赛季/阶段标签、成就名、名片固定文案、ASCII 与中文标点）取子集 → WOFF。
子集外的字会按每字回落到系统黑体，所以这套字体只挂在**文案集合有限**的元素上，正文一律不用。
要加字：把新文案加进源码后重跑生成脚本（本次在会话里以内联 Python 跑的，逻辑同上）。

## 许可

Noto Serif SC 以 **SIL Open Font License 1.1**（OFL）发布，允许自由使用、修改、子集化与随软件一同分发；
保留字体名 “Noto” 不得用于修改版的名称，本文件名用 `poxiao-serif` 即为此故。
OFL 全文：https://openfontlicense.org/open-font-license-official-text/
版权 © Google LLC 及 Adobe（Source Han Serif 同源）。

## 部署

- Railway：`server.js` 的 `/fonts/<名字>.woff|woff2` 路由从本目录出文件（一天缓存 + ETag），CSP 已放行 `font-src 'self'`。
- 单文件发布（B 站 Toy）不带这个目录：字体 404 时自动回落系统字体，不报错。
