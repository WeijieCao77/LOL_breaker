# 停运公告的静态版（不依赖 Railway）

Railway 2026-10-22 构建全停时的备用方案：这个目录原样丢到任何静态托管（Cloudflare Pages 拖拽上传 / Netlify / GitHub Pages）就是一份完整的停运站。

- `index.html` `bye.html` `404.html` 三个文件内容完全一样，都是 `../bye.html` 的副本：根路径、`/bye`、以及任何不存在的路径（`/play` 等）都显示公告，不需要服务器端跳转规则。
- `_headers`：Cloudflare Pages / Netlify 认的响应头（nosniff、noindex、不缓存），其它托管会忽略。
- 改文案只改 `../bye.html`，然后重新 `cp` 三份；`demo/bye-static.zip` 是打好的包（在 .gitignore 里）。

域名切换：name.com 里把 `www.poxiao.lol` 的 CNAME 从 `lkd9qxi8.up.railway.app` 改到托管给的主机名（TTL 300 秒，几分钟生效）。裸域名 `poxiao.lol` 的 A 记录可以不动——它还 301 到 www。
