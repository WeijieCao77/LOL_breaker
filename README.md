# 破晓 · poxiao.lol

一款以《英雄联盟》职业电竞为背景的单人文字生涯模拟器。

你将创建一名 17 岁的新人选手，从排位赛和青训起步，在 S12-S16 的五个赛季中争取首发、处理合同与队内关系、经历版本更替和伤病，并向联赛、MSI 与全球总决赛冠军发起冲击。

游戏使用真实赛事数据构建基础世界，但玩家经历、比赛过程和事件均由模拟系统动态生成。完整生涯通常需要 80-140 分钟。

## 在线体验

在线体验：[https://www.poxiao.lol](https://www.poxiao.lol)（裸域名与 Railway 域名会自动跳转到这里；存档按域名隔离，老入口上的存档会在第一次打开 www 时自动接过来）

## 主要内容

- 18 种出身背景、5 个位置和五维能力成长
- 排位与青训阶段、试训、签约、首发竞争和转会市场
- S12-S16 多赛季世界演化，选手会成长、衰退、转会和退役
- 常规赛、季后赛、MSI 与全球总决赛模拟
- 版本适应、竞技状态、队伍默契、战术、士气与伤病系统
- 合同、薪资、消费、经理与教练关系、更衣室事件和引援话语权
- 动态宿敌、比赛节点决策、随机际遇与赛后归因
- 82 项成就和多种生涯结局

## 本地运行

环境要求：

- Node.js 18 或更高版本
- Python 3（仅修改源文件并重新构建时需要）

克隆项目并启动：

```bash
git clone https://github.com/WeijieCao77/LOL_breaker.git
cd LOL_breaker
npm start
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。`/play` 也会进入游戏，`/healthz` 用于部署健康检查。

项目没有运行时 npm 依赖，因此无需执行 `npm install`。

## 开发与测试

游戏源码由 HTML 模板、样式、功能模块和精简赛事数据组成。修改这些源文件后，需要重新生成浏览器实际加载的 `demo/career.html`：

```bash
python demo/build.py
```

运行无头自检：

```bash
npm test
```

测试脚本会在模拟 DOM 环境中自动跑完一局生涯，检查主要模块能否共同工作；跑不完或数值异常会以非零退出码失败。

检查提交的 `demo/career.html` 是否与模板一致（CI 也跑这一步；Railway 直接部署仓库里的产物，漏提交不会被发现）：

```bash
python demo/check_build.py
```

## 数据重建

游戏运行时零依赖。只有重建 `data/csv/game_data_2022.json` 时才需要原始数据和 Python 包：

```bash
pip install -r data/requirements.txt
bash data/fetch_oe.sh          # Oracle's Elixir 逐场数据（2022–2026，每年 30–40 MB，被 .gitignore 忽略）
```

`data/raw/` 下的 Leaguepedia / Riot 接口原始响应同样不进仓库，由 `data/build_leaguepedia.py`、`data/fetch_logos.py` 各自的抓取逻辑生成；没有这些文件时对应脚本会直接报错退出，不会写出半成品。

## 部署

Railway 从 `main` 自动构建，只跑 `node server.js`。服务端负责：规范域名跳转（→ www.poxiao.lol）、老域名存档接力页 `/xfer`、gzip/brotli 与 ETag、CSP 等安全头。

Railway 已宣布 `railway.json` 于 2026-12-01 停止支持，替代是 `.railway/railway.ts`（仓库里已备好）。迁移要在项目所有者的 Railway 账号下执行：

```bash
npm i -D railway
railway config pull      # 用线上真实配置覆盖 .railway/railway.ts
railway config plan
# 删掉 railway.json、清空服务设置里的自定义配置路径，然后
railway config apply
```

## 项目结构

```text
.
├─ server.js                    # 零依赖静态服务器
├─ railway.json                 # Railway 构建、启动与健康检查配置
├─ demo/
│  ├─ career_template.html      # 主循环、界面、职业前与赛季流程
│  ├─ career.html               # 构建产物，也是线上实际运行的游戏
│  ├─ theme.css                 # 界面主题
│  ├─ build.py                  # 拼装模板、模块、样式与数据
│  ├─ test.js                   # 完整生涯无头测试
│  ├─ intl.js                   # MSI 与全球总决赛
│  ├─ squad.js                  # 阵容、队伍实力、默契与战术
│  ├─ team.js                   # 队友信任、合同、薪资与更衣室
│  ├─ clout.js                  # 话语权、教练/经理关系与引援
│  ├─ form.js                   # 能力与竞技状态
│  ├─ rivals.js                 # 宿敌与复仇关系
│  ├─ injury.js                 # 伤病系统
│  ├─ nodes.js                  # 比赛节点决策
│  ├─ random.js                 # 随机事件
│  ├─ postmatch.js              # 赛后归因
│  ├─ routine.js                # 训练计划
│  ├─ shop.js                   # 装备、课程与休闲消费
│  ├─ origins.js                # 出身背景
│  └─ achieve*.js               # 成就系统
└─ data/
   ├─ csv/game_data_2022.json   # 游戏使用的精简数据集
   ├─ fit_v2.py                 # 五维能力拟合
   ├─ fit_impact.py             # 胜负贡献模型
   ├─ blend_v2.py               # 数据合成
   ├─ fix_v2.py                 # 体质修正与指挥先验
   ├─ export_game.py            # 导出游戏数据
   ├─ build_rosters.py          # Riot 名单整理
   └─ build_leaguepedia.py      # Leaguepedia 赛季名单整理
```

`demo/build.py` 的构建关系如下：

```text
career_template.html
        + theme.css
        + 功能模块
        + game_data_2022.json
        ↓
demo/career.html
```

## 数据说明

队伍和选手的基础数值由真实赛事数据拟合，而不是逐项手填。数据管线主要使用：

| 数据层 | 来源 | 用途 |
| --- | --- | --- |
| 逐场表现 | Oracle's Elixir | 选手表现、状态与比赛影响力 |
| 历年名单 | Leaguepedia | 赛季阵容、次级联赛与选手档案 |
| 当前阵容 | Riot 电竞数据 | 队伍与选手关系整理 |

选手能力按“同位置、同联赛层级”标准化，并根据样本量向联盟均值收缩，避免少量出场造成过高评价。游戏中的五维分别是：

| 维度 | 主要信号 |
| --- | --- |
| 操作 | 对线经济/经验/补刀差、输出、多杀与资源转化 |
| 运营 | 视野、参团、死亡控制与地图资源处理 |
| 心态 | 逆风保持、翻盘表现与关键局表现 |
| 指挥 | 队伍胜负贡献与个人数据之间的差异，以及位置和年龄先验 |
| 体质 | 赛季前后段衰减与连续比赛表现 |

能力和状态是两个概念：能力表示较稳定的生涯水位，状态表示当前赛季发挥。因此，高能力选手也可能暂时处于低谷。

仓库只保留游戏运行所需的精简数据和处理脚本，不包含体积较大的原始比赛数据。需要重建数据时，可通过 `data/fetch_oe.sh` 获取 Oracle's Elixir 数据，再运行对应处理脚本。

## 真人姓名与内容边界

游戏使用真实选手和战队名称，但模拟内容只描述比赛与职业路径，不对真人的人格、心理或现实关系作事实判断。

名单与逻辑相互独立。替换 `data/csv/game_data_2022.json` 并重新构建，即可将项目切换为架空选手和战队。

## Railway 部署

仓库已包含 `railway.json`，默认配置为：

- 使用 Nixpacks 构建
- 执行 `node server.js` 启动服务
- 使用 `/healthz` 进行健康检查
- 部署失败时自动重启

在 Railway 中选择 **Deploy from GitHub repo**，连接此仓库即可。服务只依赖 Railway 自动提供的 `PORT`，无需额外环境变量。部署成功后，在 Railway 的 **Networking** 页面生成公开域名。

也可以使用 Railway CLI：

```bash
railway login
railway init
railway up
railway domain
```

## 声明

本项目是非商业性质的独立同人模拟作品，与 Riot Games、腾讯、英雄联盟职业联赛及各参赛俱乐部不存在官方关联。

《英雄联盟》及相关名称、标识的权利归其各自权利人所有。
