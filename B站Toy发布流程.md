# 把一个网页游戏发布到 B 站 Toy —— 完整流程与踩过的坑

写给下一个 session。这份东西是 2026-08-28 实操一遍之后总结的，
每一条都验证过；标了「未验证」的是我没走到那一步的。

前提：用户已经有 Toy 发布权限（没有的话先看最后一节「还没有权限」）。

---

## 零、先理解平台是怎么跑你的代码的

这一点决定了后面所有的约束，先搞清楚再动手。

拆一个官方已发布的 Toy（`bilibili.com/toy/doodle-hop-sdk-demo/index.html`）看到的结构：

```
外层 www.bilibili.com/toy/<slug>/index.html   ← 平台生成的壳，你控制不了
  ├── 注入 toy-host.js（SDK 宿主）
  ├── 注入 __TOY_META__ = { toy_id }
  └── <iframe src="https://www.bilibilitoy.com/toy/<slug>/<toy_id>-v2/index.html"
             sandbox="allow-scripts allow-forms allow-popups allow-same-origin
                      allow-downloads allow-pointer-lock ..."
             referrerpolicy="no-referrer">          ← 你的东西在这里
```

**结论：你的内容是当独立静态站跑的，跑在 `/toy/<slug>/` 子路径下的一个跨域 sandbox iframe 里。**

由此推出：

- 不能依赖任何服务器行为（没有你的 nginx、没有你的响应头）
- 绝对路径 `/assets/x.js` 会解析到站点根 → 白屏。必须用相对路径
- `localStorage` 可用（有 `allow-same-origin`），但它属于 `bilibilitoy.com` 这个源
- 平台会往你的 `<head>` 里注入一段防脱壳脚本 —— **所以你必须真的有 `<head>`**（见坑 1）

---

## 一、官方规范（原文，从发布平台前端 bundle 里挖出来的）

发布平台的文档页是登录后才渲染的 SPA，WebFetch 拿不到内容。
规范原文在这个 bundle 里，可以直接下下来 grep 中文串：

```
https://s1.hdslb.com/bfs/static/toy/app/publish/assets/index-*.js
```

挖出来的规范：

| 项 | 要求 |
| --- | --- |
| 上传格式 | `.zip` / **`.html` 单文件** / 文件夹（自动打包成 ZIP） |
| 入口 | ZIP 根目录或**恰好一个**一级子目录下必须有 `index.html` |
| 体积 | 「ZIP 文件建议不超过 20MB」 |
| 后缀白名单 | `.html/.htm/.css/.js/.json/.wasm`、`.data/.md/.csv/.tsv`、`.png/.jpg/.jpeg/.gif/.svg/.webp/.ico`、`.woff2/.woff/.ttf/.eot`、`.mp3/.wav/.ogg/.m4a`、`.mp4/.webm`、`.atlas/.ani/.part/.nani/.unityweb`。**其余一律过滤掉** |
| 标题 | HTML 里有 `<title>` 会自动提取为默认标题 |
| 封面 | `.png/.jpg/.jpeg`；建议 **4:3 横图，1200×900**（竖图在列表卡片里会被裁得难看） |
| slug | 小写字母数字连字符；**发布后不可改**，要换只能删了重发 |
| 审核 | 四态：审核中 / 已发布 / 未通过（可改后重提）/ 超时（可重提） |
| 云存储 | 单 Toy **最多 128 个 key**，key ≤128 字节（仅字母数字下划线短横线），**value ≤1024 字节** |
| 图片 base64 | 上限 5MB，算的是 base64 字符串长度本身（含前缀），不是解码后原图 |

条款里有一条必须注意：

> **您不得通过远程脚本、iframe、跳转、外链资源、动态加载、热更新等方式规避平台方审核、实质变更已审核内容。**

所以**外链资源是合规风险**，不只是加载快慢的问题。

---

## 二、四个真实的坑

### 坑 1（最大）：产出的可能根本不是完整 HTML 文档

我们的构建脚本吐的是个**片段**：没有 `<!doctype html>`、没有 `<html>/<head>/<body>`、
没有 `<meta charset>`、没有 `<meta name="viewport">`。

**本地完全看不出来**，因为：
- 自建的 dev server 在响应头里带了 `charset=utf-8`
- 桌面浏览器对缺失结构极其宽容

传到 Toy 上会出三件事：

| 缺什么 | 后果 |
| --- | --- |
| `<!doctype html>` | 浏览器进**怪异模式**，盒模型和一堆布局行为都变 |
| `<meta charset>` | CDN 不带 charset 时中文直接乱码 |
| `<meta name="viewport">` | 手机按 980px 排版再整体缩小，**字小到看不清** |
| `<head>` | 平台的注入脚本没有落点 |

**动手前先查**：

```bash
for t in "<!doctype" "<html" "<head" "<body" "meta charset" "viewport"; do
  echo "$t : $(grep -oic "$t" 你的.html | head -1)"
done
```

修完必须验证渲染模式（加 doctype 会从怪异模式切到标准模式，**有可能把原来的布局打乱**）：

```js
document.compatMode === "CSS1Compat"   // true = 标准模式
```

然后在 375px 下逐个界面查横向溢出：

```js
document.documentElement.scrollWidth > innerWidth
```

Toy 主要在 B 站 App 里看，**手机是主场景，不是兼容项**。

### 坑 2：外链资源

我们只有一个外链 —— Google Fonts。两个问题叠在一起：
撞上面那条审核条款；而且 `fonts.googleapis.com` 在国内基本加载不出来，等于必然掉字体。

查法（注意别被 base64 里的 `//` 误伤）：

```bash
grep -oE '(src|href)="(https?:)?//[^"]+"' 你的.html | sort -u
grep -oE 'https?://[a-zA-Z0-9._-]+' 你的.html | sort -u
```

处理：能内联就内联（20MB 额度很宽），字体这种也可以退回系统字体栈。
系统栈要覆盖四端：

```css
font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC",
             "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
font-family: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, Menlo, monospace;
```

### 坑 3：OAuth 登录会超时作废

`toy login` 打印一个授权链接然后等回调，**等待窗口很短**。
我连着两次因为「把链接发给用户 → 用户不在键盘前」而超时失败，state 作废。

**正确做法：确认用户此刻在电脑前，再发起 login。** 别提前跑。

### 坑 4：云存储装不下大存档

128 key × 1024 字节 = **131 KB 上限**。
我们的存档到生涯后期是 213 KB，塞不下。

如果目标游戏有存档，先量：

```js
JSON.stringify(存档对象).length
```

超了的话按这个顺序找：
1. **有没有重复引用**（我们就中招了：`pre.world` 和 `S.world` 是同一个对象，
   `JSON.stringify` 把整个世界序列化了两遍，76 KB 纯冗余）
2. 静态数据的副本 → 只存 diff
3. 日志/事件历史 → 截断到最近 N 条
4. 还超就压缩后 base64，再切片存进多个 key

---

## 三、工具链

### 安装 CLI

```powershell
irm https://boss.hdslb.com/toy-cli/toy/install.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://boss.hdslb.com/toy-cli/toy/install.sh | bash
```

装到 `%LOCALAPPDATA%\Programs\toy`（Win）或 `~/.local/bin`。
**装完当前终端里 PATH 还没生效**，直接用全路径调用最省事。

版本查询：`https://boss.hdslb.com/toy-cli/toy/latest/VERSION`（写这篇时 v0.4.0）

### 官方 skill

平台提供了一个 `toy` skill（发布页有「复制提示词让 Agent 装」的按钮）。
装上之后直接 `Skill(toy)` 调用，里面有完整的工作流和铁律。**优先按它走，别自己拼命令。**

skill 里的关键铁律：

1. AI 调用一律加 `--json`（表格输出会因列宽变化而崩）
2. **`create`/`update` 是两段式**：不加 `--yes` 只生成预览、不提交；
   必须让用户看过预览并**明确确认**，才用同样参数加 `--yes` 重跑
3. 发包前跑内容预检 `toy_doctor.py`
4. 别凭记忆拼 flag，每次用 `toy <cmd> --help-json` 取

### 内容预检

```bash
python "<skill目录>/scripts/toy_doctor.py" <path> --poster cover.png --slug my-toy --json
```

有 ERROR 先修，别硬传。

---

## 四、实际发布流程

```bash
TOY="$LOCALAPPDATA/Programs/toy/toy.exe"     # Windows

# 1. 登录（确认用户在电脑前再跑！）
$TOY login --no-open        # 打印链接，让用户立刻点
$TOY whoami --json          # 验证

# 2. 内容预检
python "<skill目录>/scripts/toy_doctor.py" demo/game.html --slug my-slug

# 3. 生成预览（不带 --yes，不会提交）
$TOY create demo/game.html \
  --title "游戏名" --slug "my-slug" --poster demo/cover.png --json
# → {"preview_url": "https://www.bilibili.com/toy/preview/preview_XXXX/index.html"}

# 4. 把 preview_url 给用户，让用户在浏览器里检查

# 5. 用户明确说「提交」之后，同样参数 + --yes
$TOY create demo/game.html \
  --title "游戏名" --slug "my-slug" --poster demo/cover.png --json --yes
# → {"id":..., "status":..., "preview_url":...}
```

`create` 的 flag（用 `--help-json` 核实，别照抄）：
`--title` `--slug` `--poster` `--visibility (link-only|password|public)`
`--access-password` `--yes`

**`--visibility` 默认 `link-only`。改成 `public` 会进玩具铺、可能被平台推荐 ——
这是对外发布的决定，必须问用户，别自己定。**

### 怎么验证预览真的能跑

外层是跨域 iframe，JS 读不到里面。直接抓内层：

```bash
curl -s "https://www.bilibilitoy.com/toy/preview/preview_XXXX/index.html" -o live.html
curl -s -D - -o /dev/null "https://www.bilibilitoy.com/toy/preview/preview_XXXX/index.html" \
  | grep -i content-type          # 应为 text/html; charset=utf-8
```

然后和本地比对。**会有几百字节的差异，那是平台注入的防脱壳脚本**，正常：

```html
<head><script>if(window.self===window.top){window.location.replace("...")}</script>
```

（注意：`curl -I` 走 HEAD，这个 CDN 对 HEAD 返回 `text/plain`，会吓你一跳。以 GET 的响应头为准。）

---

## 五、封面图怎么做

官方建议 4:3 横图 1200×900，`.png`/`.jpg`，**用本地图别热链**。

如果 Browser 面板没显示（截图会报
`the Browser pane is not displayed, so the page is not compositing frames`），
截不了实机图，可以用 Pillow 直接画 —— Windows 上中文字体现成的：

```python
"C:/Windows/Fonts/msyhbd.ttc"   # 微软雅黑 Bold
"C:/Windows/Fonts/msyh.ttc"     # 微软雅黑
"C:/Windows/Fonts/consolab.ttf" # 等宽
```

画完**一定要把 PNG 读回来自己看一眼**再交付。我第一版底部文字和标签直接重叠了，
不看就发出去了。

---

## 六、其他

### 已发布之后

- 更新：`toy update <id> <path>`，同样两段式，**保留原 slug**，别为改地址删了重建
- 只改标题/封面/可见性：`toy update <id> --title ...`，**没有预览链接，直接提交审核**，
  所以更要先问用户
- 分享链接给完整的 `https://www.bilibili.com/toy/<slug>/index.html`，
  别给裸 `/<slug>/`（目录兜底不保证）
- 统计：`toy stats <id> --json`
- 绑视频：`toy video bind`，**即时生效，不走审核**；一个视频只能绑一个 Toy

### SDK（可选，未验证）

`https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js`，在你的 `index.html` 里引，
全局对象 `window.toy`。从官方 demo 的源码里看到的调用：

```js
toy.submitScore(...)                              // 提交分数
toy.getRankList({ board, period, limit })         // 排行榜；period: 'all' | 'week'
toy.getMyRank({ board, period })
toy.setCloudStorage({...}) / toy.getCloudStorage([keys])   // 云存档（注意 1024 字节/key）
toy.navigate(...)
toy.getVideoUserActions() / getAuthorVideos() / getAuthorRelation()
```

**注意这个是外链脚本**，但它是平台官方的，和「禁止外链规避审核」不冲突。

### 还没有权限

在 [Toy 开发者小站](https://www.bilibili.com/bubble/home/86) 的【资格申请】分区发帖，
48h 内反馈。官方格式：

```
1、你是谁：程序员 / vibecoding 爱好者 / 设计师 / 兴趣圈层 kol……
2、你的创意：尽量详细
3、是否已经有 demo 或产物：是 / 否，可附产物链接、视频或图片
```

评估维度：账号投稿情况、粉丝量、创意程度、**是否有产物**。
有能玩的链接是硬加分项，帖子里直接放。

---

## 检查清单

发布前逐条过：

- [ ] `<!doctype html>` / `<html>` / `<head>` / `<body>` 齐全
- [ ] `<meta charset="utf-8">`
- [ ] `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
- [ ] `document.compatMode === "CSS1Compat"`（标准模式）
- [ ] 375px 宽下逐个界面无横向溢出
- [ ] 零外链（或只剩官方 SDK）
- [ ] 所有资源相对路径，没有 `/开头` 的绝对路径
- [ ] 没有 `location.href = "/xxx"` 这种根绝对跳转
- [ ] 体积 < 20MB
- [ ] 只有白名单后缀
- [ ] 有 `<title>`
- [ ] 封面 1200×900 PNG，自己看过
- [ ] `toy_doctor.py` 0 ERROR
- [ ] slug 想清楚了（**不可改**）
- [ ] `--visibility` 问过用户
- [ ] 预览链接给用户看过，用户**明确说了提交**
