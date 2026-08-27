/* 破局者 —— 零依赖静态服务器
   游戏本身是一个自包含的 HTML 文件，不需要框架。
   Railway 会注入 PORT，本地默认 3000。 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const GAME = path.join(ROOT, "demo", "career.html");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, code, body, type) {
  res.writeHead(code, {
    "content-type": type || "text/plain; charset=utf-8",
    "cache-control": code === 200 ? "public, max-age=300" : "no-store",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);

  // 健康检查：Railway 用它判断服务是否起来了
  if (url === "/healthz") return send(res, 200, "ok");

  // 首页与 /play 都进游戏
  if (url === "/" || url === "/play" || url === "/index.html") {
    return fs.readFile(GAME, (err, buf) => {
      if (err) return send(res, 500, "游戏文件缺失，请先运行 python demo/build.py");
      send(res, 200, buf, TYPES[".html"]);
    });
  }

  // 其余按静态文件处理，限制在项目目录内
  const target = path.normalize(path.join(ROOT, url));
  if (!target.startsWith(ROOT)) return send(res, 403, "forbidden");

  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "not found");
    fs.readFile(target, (e, buf) => {
      if (e) return send(res, 500, "read error");
      send(res, 200, buf, TYPES[path.extname(target).toLowerCase()] || "application/octet-stream");
    });
  });
});

server.listen(PORT, () => {
  console.log(`破局者 listening on ${PORT}`);
});
