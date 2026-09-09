# 找图清单

把六张真实赛事照片按下面的文件名放进这个目录，然后回到 `promo/xhs/` 跑：

```bash
node build.mjs && node render.mjs
```

没放的那几张会渲染成虚线占位槽，槽里就印着这张的要求——**出的图可以直接当找图清单**。

| 文件名 | 要什么 | 去哪找 | 怎么裁 |
|---|---|---|---|
| `01-ig-s8-trophy.jpg` | S8 IG 举起召唤师奖杯的全队合影 | lolesports 官方 Flickr（2018 Worlds 相册）／ IG 官方微博 | 竖向 3:4，人和奖杯居中偏上，下方留 40% 给文字 |
| `02-theshy-2018.jpg` | S8 决赛 TheShy 的比赛特写／赛后镜头 | lolesports Flickr 2018 Worlds Finals 相册 | 竖向 3:4，脸部在上三分之一 |
| `03-celebrate.jpg` | 夺冠瞬间的庆祝、队员相拥、看台欢呼 | lolesports Flickr ／ 战队官微当日九宫格 | 竖向 3:4，情绪优先，糊一点没关系 |
| `04-lck-trophy.jpg` | T1 举杯（S13／S14／S15 任选，冷调更好） | lolesports 官方 Flickr 对应年份相册 | 竖向 3:4，画面尽量空、尽量冷，和 03 的热闹形成落差 |
| `06-theshy-now.jpg` | TheShy 近期比赛照，越近越好 | LPL 官方微博 ／ 战队官微 ／ lolesports Flickr | 竖向 3:4，侧脸低头都行，别用表情包 |
| `07-rookie-now.jpg` | Rookie 近期比赛照 | 同上 | 竖向 3:4，和 06 用同一个景别，两张要像一对 |

第 5 张是纯文字卡，不需要照片。

## 已经在这里的两张

- `game-hero.png` — 破晓开局页（第 8 张用）
- `game-id.png` — ID 输入框，占位符写着「例如 Uzi、TheShy」（第 9 张用）

两张都是从本地跑起来的游戏里截的。想重截：`npm start` 后用浏览器截 1080 宽的图替换即可。

## 版权

只用 Riot 官方渠道（lolesports Flickr / 官网 / 官微）和战队官微的图，逐张确认许可证；
**不要用视觉中国、Getty 带水印的图**。模板已经在每张照片卡的右下角预留了 `© Riot Games` 署名位，
在 `content.json` 里按张改 `credit` 字段。详见 `promo/策划稿-小红书爷青回图文.md` 第八节。
