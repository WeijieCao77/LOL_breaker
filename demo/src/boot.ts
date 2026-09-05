/* 浏览器入口：装数据、开局、挂声音与存档接力。引擎模块本身不在这里执行任何东西，无头测试直接 import 它们。 */
import { audioInit } from "./audio";
import { screenCreate } from "./main";
import { xferPull } from "./save";

screenCreate();
audioInit();   // 声音、作者栏版本号、更新日志浮窗
xferPull();     // 老域名上的存档接力（只在 www 上生效）

/* 控制台调试口：原来所有函数都是全局的，打包成模块后什么都摸不到了。
   留一个小窗口给作者在 DevTools 里看状态、存档、重画（线上也在，不含任何危险操作）。 */
import { S, setS } from "./state";
import { render, startPre, GAME_VER } from "./main";
import { saveGame, loadGame, readSave } from "./save";
(window as any).poxiao = { ver: GAME_VER, S: () => S, setS, render, screenCreate, startPre, saveGame, loadGame, readSave };
