# 小红书九图出图工程

配套策划案：`promo/策划稿-小红书爷青回图文.md`

```bash
node build.mjs    # content.json → card-01..09.html
node render.mjs   # card-*.html → out/card-*.png（1080×1440，2 倍图）
```

- **改文字**：只改 `content.json`，然后重跑上面两条
- **换照片**：按 `photos/README.md` 的文件名放进 `photos/`，重跑
- 缺照片的卡片会渲染成虚线占位槽，槽里印着这张要什么图、去哪找、怎么裁

渲染需要 playwright：`npm i -D playwright && npx playwright install chromium`。
`out/` 里的 PNG 是生成物，重跑会覆盖。
