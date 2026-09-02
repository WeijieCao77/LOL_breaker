/* 破晓 —— 零依赖静态服务器
   游戏本身是一个自包含的 HTML 文件，不需要框架，也不需要静态目录：
   CSS、JS、数据在 build.py 里全部内联进 career.html 了。

   所以这里不做「把 URL 拼到磁盘路径上」这件事：只有列在 ROUTES 里的东西能出去。

   2026-09-02 审计后补的几件事（都在这一个文件里）：
   · 规范域名：正式地址只有 www.poxiao.lol。裸域名和 Railway 域名一律 301 过去——
     存档在 localStorage 里按域名隔离，三个入口并存等于存档「随机消失」。
   · 存档接力：老域名的存档不能就这么丢。老域名保留一个 /xfer 页面，只做一件事：
     把自己 localStorage 里的存档 postMessage 给 www 那边（只认 www 这个父窗口）。
     www 页面加载时用隐藏 iframe 拉一次，谁新用谁（客户端逻辑在 save.js）。
   · 压缩与缓存：1.2 MB 的单文件原来不压缩、no-store。现在启动时预压 gzip/brotli，
     带 ETag，no-cache（每次校验、内容没变就 304）——跨境链路上这是几十秒和一秒的区别。
   · 安全头：CSP 用内联脚本的 sha256 白名单（不用 unsafe-inline），导入别人的存档
     就算夹带 <img onerror> 也跑不起来；再加 HSTS / frame-ancestors / Referrer-Policy。

   Railway 会注入 PORT，本地默认 3000。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const CANONICAL = process.env.CANONICAL_HOST || "www.poxiao.lol";
/* 我们自己的其它入口：都该跳到规范域名。别人的域名（本地、预览）不动 */
const LEGACY_HOST = /(^|\.)poxiao\.lol$|\.up\.railway\.app$/i;
/* /xfer 只允许被 www 页面嵌进去 */
const XFER_PARENT = "https://" + CANONICAL;
/* www 页面会从这些老入口拉存档（要和 save.js 的 XFER_FROM 一致） */
const XFER_FROM = ["https://poxiao.lol", "https://lol-breaker-production.up.railway.app"];

/* 能对外提供的东西，就这些 */
const ROUTES = {
  "/": ["demo/career.html", "text/html; charset=utf-8"],
  "/index.html": ["demo/career.html", "text/html; charset=utf-8"],
  "/play": ["demo/career.html", "text/html; charset=utf-8"],
  "/favicon.ico": ["demo/favicon.ico", "image/x-icon"],
};

/* ---------- 资产缓存：读一次、压一次、算好 ETag 和 CSP 哈希 ---------- */
const cache = new Map();   // file -> {mtime, raw, gz, br, etag, csp}
function sha256b64(buf) { return crypto.createHash("sha256").update(buf).digest("base64"); }
function inlineScriptHashes(html) {
  const out = [];
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push("'sha256-" + sha256b64(Buffer.from(m[1], "utf8")) + "'");
  return out;
}
function loadAsset(file) {
  const abs = path.join(ROOT, file);
  let st;
  try { st = fs.statSync(abs); } catch (e) { cache.delete(file); return null; }
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit;
  const raw = fs.readFileSync(abs);
  const isHtml = /\.html$/.test(file);
  const entry = {
    mtime: st.mtimeMs, size: st.size, raw,
    etag: '"' + sha256b64(raw).slice(0, 27) + '"',
    gz: isHtml ? zlib.gzipSync(raw, { level: 9 }) : null,
    br: isHtml ? zlib.brotliCompressSync(raw, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length }
    }) : null,
    scriptSrc: isHtml ? inlineScriptHashes(raw.toString("utf8")) : [],
  };
  cache.set(file, entry);
  return entry;
}

/* ---------- 安全头 ---------- */
function baseHeaders(extra) {
  return Object.assign({
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  }, extra || {});
}
function gameCsp(entry) {
  return [
    "default-src 'none'",
    "script-src " + (entry.scriptSrc.length ? entry.scriptSrc.join(" ") : "'none'"),
    "style-src 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src data:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src " + XFER_FROM.join(" "),
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

function send(res, code, body, type, extra) {
  const h = Object.assign(baseHeaders({
    "content-type": type || "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-frame-options": "DENY",
  }), extra || {});
  Object.keys(h).forEach(k => { if (h[k] === undefined) delete h[k]; });   // undefined 表示「不要这个头」
  res.writeHead(code, h);
  res.end(body);
}

/* 老域名上的存档接力页：只把 localStorage 里的存档递给 www 父窗口 */
const XFER_JS = `(function(){var raw=null;try{raw=localStorage.getItem("pojuzhe_save_v1")}catch(e){}
try{parent.postMessage({t:"poxiao-xfer",raw:raw},${JSON.stringify(XFER_PARENT)})}catch(e){}})();`;
const XFER_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>存档接力</title></head><body><script>' + XFER_JS + "</script></body></html>";
const XFER_CSP = "default-src 'none'; script-src 'sha256-" + sha256b64(Buffer.from(XFER_JS, "utf8")) + "'; frame-ancestors " + XFER_PARENT;

function serveAsset(req, res, url) {
  const route = ROUTES[url];
  const entry = loadAsset(route[0]);
  if (!entry) {
    // 只有 career.html 缺失才是「构建没跑」，favicon 缺了不算事
    if (url === "/favicon.ico") return send(res, 404, "not found");
    return send(res, 500, "游戏文件缺失，请先运行 python demo/build.py");
  }
  const isHtml = !!entry.gz;
  const headers = baseHeaders({
    "content-type": route[1],
    "etag": entry.etag,
    "vary": "accept-encoding",
    // 每次都回源校验，但内容没变就 304：既不会拿到旧版本，也不用每次拖 1 MB
    "cache-control": isHtml ? "no-cache" : "public, max-age=86400",
    "x-frame-options": "DENY",
  });
  if (isHtml) headers["content-security-policy"] = gameCsp(entry);
  const inm = req.headers["if-none-match"];
  if (inm && inm.split(",").map(s => s.trim()).includes(entry.etag)) {
    res.writeHead(304, headers); return res.end();
  }
  const ae = String(req.headers["accept-encoding"] || "");
  let body = entry.raw;
  if (isHtml && /\bbr\b/.test(ae)) { body = entry.br; headers["content-encoding"] = "br"; }
  else if (isHtml && /\bgzip\b/.test(ae)) { body = entry.gz; headers["content-encoding"] = "gzip"; }
  headers["content-length"] = body.length;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
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
  // 健康检查：Railway 用它判断服务是否起来了（任何主机名都答）
  if (url === "/healthz") return send(res, 200, "ok");

  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const legacy = host && host !== CANONICAL.toLowerCase() && LEGACY_HOST.test(host);
  if (legacy) {
    if (url === "/xfer") {
      return send(res, 200, XFER_HTML, "text/html; charset=utf-8",
        { "content-security-policy": XFER_CSP, "x-frame-options": undefined });
    }
    // 其余一律去规范域名：存档只认一个入口
    return send(res, 301, "", "text/plain; charset=utf-8",
      { "location": "https://" + CANONICAL + (req.url || "/") });
  }

  if (!ROUTES[url]) return send(res, 404, "not found");
  serveAsset(req, res, url);
});

server.listen(PORT, () => {
  const e = loadAsset("demo/career.html");
  console.log(`破晓 listening on ${PORT}` + (e
    ? ` · career.html ${(e.raw.length / 1024).toFixed(0)} KB → gzip ${(e.gz.length / 1024).toFixed(0)} KB / br ${(e.br.length / 1024).toFixed(0)} KB · ${e.scriptSrc.length} 段内联脚本进 CSP`
    : " · career.html 缺失"));
});
