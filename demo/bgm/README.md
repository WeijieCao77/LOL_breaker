# 背景音乐文件

游戏的背景音乐从这个目录读，走「整个歌单随机顺序循环 + 右下角浮窗手动选曲」。
代码只认下面这些 **ascii 小写文件名**（`demo/audio.js` 里的 `BGM_TRACKS`）。
把对应曲子转成 mp3、按这个名字放进本目录，游戏里那一首就能点开听；没放的自动置灰、跳过。

| 文件名（放这个名字的 .mp3） | 曲目 |
|---|---|
| `warriors.mp3` | Warriors — Imagine Dragons |
| `star-walkin.mp3` | STAR WALKIN' — Lil Nas X |
| `legends-never-die.mp3` | Legends Never Die — Against the Current |
| `phoenix.mp3` | Phoenix — Cailin Russo & Chrissy Costanza |
| `rise.mp3` | RISE — Mako & The Word Alive |
| `take-over.mp3` | Take Over 所向无前 — YUKIri |
| `gods.mp3` | 登神 GODS — noli |
| `heavy-is-the-crown.mp3` | Heavy Is the Crown — Linkin Park |
| `worlds-collide.mp3` | Worlds Collide — Nicki Taylor |
| `ignite.mp3` | Ignite — Zedd |
| `burn-it-all-down.mp3` | Burn It All Down — PVRIS |
| `sacrifice.mp3` | Sacrifice — G.E.M. 邓紫棋 |
| `hybrid-worlds.mp3` | Hybrid — 英雄联盟 |
| `silver-scrapes.mp3` | Silver Scrapes — Danny McCarthy |
| `crawling.mp3` | Crawling — Linkin Park |
| `numb.mp3` | Numb — Linkin Park |

## 规则

- 文件名只许 `[a-z0-9_-]` + `.mp3`（服务器 `/bgm/` 路由的白名单）；带空格、中文、逗号的原名要先改成上表的名字。
- 格式必须是 **mp3**（iOS / 安卓 / 桌面全支持）；`.ncm`（网易云加密）和 `.flac`（苹果 Safari 不放）浏览器都放不了，得先转 mp3。
- 建议 128–192 kbps，一首压到 3–6 MB——原始无损一首几十 MB，整包上不了线。
- 缺的文件不报错、不弹窗：浮窗歌单里那一行置灰，随机循环时自动跳过。
- 只在玩家点开浮窗、点了播放之后才开始下载（`preload=none`），不拖慢首屏。音乐默认关，选择记在 localStorage。
- 音量在 `demo/audio.js` 的 `BGM_VOL`（默认 0.35）。

## 怎么到线上

- **Railway（www.poxiao.lol）**：`server.js` 的 `/bgm/<名字>.mp3` 路由直接从这个目录出文件（带 Range，iOS 才肯播）。
  文件要 **提交进仓库** 再推 main——Railway 从 git 部署，没提交线上就是 404。
- **B 站 Toy**：单文件发布 `career.html` 不带这个目录。要带音乐，把 `career.html` 改名 `index.html`，和 `bgm/` 放进同一目录一起 `toy create <目录>`。

## 版权

**仓库和代码本身不带任何曲子。** 上表里多是商用版权歌曲（含各唱片公司作品与 Riot 官方 Worlds 主题曲）——
放什么、有没有授权、要不要挂到公开站点，由放文件的人自行判断与负责。公开站点用商用曲有被追究的风险，
更稳妥的做法是换成有授权 / 免版权的音乐。
