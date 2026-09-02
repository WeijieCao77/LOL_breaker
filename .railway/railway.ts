/* Railway 基础设施即代码（railway.json / railway.toml 于 2026-12-01 停止支持后的替代）。
   这份文件是按当前线上配置手写的草稿；正式迁移时先 `railway config pull`，
   Railway 会用线上真实状态覆盖它，再 plan / apply。步骤见 README「部署」。
   本地要类型提示：npm i -D railway */
import { defineRailway, project, service, github } from "railway/iac";

export default defineRailway(() => {
  const web = service("lol-breaker", {
    source: github("WeijieCao77/LOL_breaker"),
    start: "node server.js",
    healthcheck: "/healthz",
    healthcheckTimeout: 100,
    domains: ["www.poxiao.lol", "poxiao.lol"],
  });
  return project("lol-breaker", { resources: [web] });
});
