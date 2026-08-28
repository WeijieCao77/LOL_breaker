/* 破局者 —— 零依赖静态服务器
   游戏本身是一个自包含的 HTML 文件，不需要框架，也不需要静态目录：
   CSS、JS、数据在 build.py 里全部内联进 career.html 了。

   所以这里不做「把 URL 拼到磁盘路径上」这件事。
   原来那版是 path.join(ROOT, url) 再 startsWith(ROOT) 检查，
   有两个问题：
     · startsWith 是字符串前缀，隔壁的 lol选手-secret 也能通过
     · 就算路径检查是对的，它也把 server.js、package.json、
       demo/career_template.html、data/ 下的全部原始数据一起public 了
   现在改成白名单：只有列在 ROUTES 里的东西能出去。

   Railway 会注入 PORT，本地默认 3000。 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

/* 能对外提供的东西，就这些 */
const ROUTES = {
  "/": ["demo/career.html", "text/html; charset=utf-8"],
  "/index.html": ["demo/career.html", "text/html; charset=utf-8"],
  "/play": ["demo/career.html", "text/html; charset=utf-8"],
  "/favicon.ico": ["demo/favicon.ico", "image/x-icon"],
};

function send(res, code, body, type) {
  res.writeHead(code, {
    "content-type": type || "text/plain; charset=utf-8",
    // 测试期一律不缓存——改了东西刷新就能看到，不用硬刷新
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "method not allowed");
  }

  let url;
  try {
    url = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    return send(res, 400, "bad request");   // 畸形的 %xx
  }

  // 健康检查：Railway 用它判断服务是否起来了
  if (url === "/healthz") return send(res, 200, "ok");

  const route = ROUTES[url];
  if (!route) return send(res, 404, "not found");

  const file = path.join(ROOT, route[0]);
  fs.readFile(file, (err, buf) => {
    if (err) {
      // 只有 career.html 缺失才是「构建没跑」，favicon 缺了不算事
      if (url === "/favicon.ico") return send(res, 404, "not found");
      return send(res, 500, "游戏文件缺失，请先运行 python demo/build.py");
    }
    send(res, 200, buf, route[1]);
  });
});

server.listen(PORT, () => {
  console.log(`破局者 listening on ${PORT}`);
});
