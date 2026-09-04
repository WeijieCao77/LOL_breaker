/* 破晓 —— 零依赖静态服务器
   游戏本身是一个自包含的 HTML 文件，不需要框架，也不需要静态目录：
   CSS、JS、数据在 build.py 里全部内联进 career.html 了。

   所以这里不做「把 URL 拼到磁盘路径上」这件事：只有列在 ROUTES 里的东西能出去。
   （唯一的例外是 /bgm/：背景音乐文件按白名单名字从 demo/bgm/ 出，见 serveMedia。）

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
const BOOT_AT = new Date().toISOString();   // 进程启动时刻：/healthz 用它区分「新部署」和「同一容器」
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
  const isHtml = /\.html$/.test(file);
  /* CRLF 归一（外部测评抓的 P0）：Windows 检出的 career.html 是 CRLF，服务器按 CRLF 字节算
     CSP 哈希，浏览器却按解析后的 LF 文本算——哈希对不上，整段内联脚本被 CSP 拦掉，本地白屏。
     发出去的字节和算哈希的字节必须是同一份、且都是 LF。 */
  let raw = fs.readFileSync(abs);
  if (isHtml && raw.includes(13)) raw = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
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
    "font-src 'self' data:",
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

/* ---------- 背景音乐文件：/bgm/<名字>.mp3 ----------
   demo/bgm/ 下的曲子（s12.mp3 … s16.mp3，见 demo/bgm/README.md）。这是 ROUTES 之外
   唯一按名字出文件的地方：只认白名单后缀，文件名只许 [a-z0-9_-]，不拼任何别的路径段。
   · 支持 Range（206）：iOS Safari 没有它就不播；不压缩（mp3 压不动）
   · 一天缓存 + ETag；走 loadAsset 整文件进内存，五首歌也就二三十 MB
   · CSP 已是 media-src 'self'，不用再放行 */
const MEDIA_TYPES = { ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav",
                      ".woff": "font/woff", ".woff2": "font/woff2" };   // /fonts/：界面重做第三期的自托管宋体子集
function serveMedia(req, res, url) {
  const m = /^\/(bgm|fonts)\/([a-z0-9_-]+)(\.[a-z0-9]+)$/i.exec(url);
  const type = m && MEDIA_TYPES[m[3].toLowerCase()];
  if (!type) return send(res, 404, "not found");
  if (m[1] === "fonts" && !/^font\//.test(type)) return send(res, 404, "not found");
  if (m[1] === "bgm" && !/^audio\//.test(type)) return send(res, 404, "not found");
  const entry = loadAsset("demo/" + m[1] + "/" + m[2] + m[3]);
  if (!entry) return send(res, 404, "not found");
  const total = entry.raw.length;
  const headers = baseHeaders({
    "content-type": type,
    "etag": entry.etag,
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    "x-frame-options": "DENY",
  });
  const inm = req.headers["if-none-match"];
  if (inm && inm.split(",").map(s => s.trim()).includes(entry.etag)) {
    res.writeHead(304, headers); return res.end();
  }
  let start = 0, end = total - 1, code = 200;
  const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (rg && (rg[1] || rg[2])) {
    if (rg[1]) { start = parseInt(rg[1], 10); if (rg[2]) end = Math.min(parseInt(rg[2], 10), total - 1); }
    else start = Math.max(0, total - parseInt(rg[2], 10));            // bytes=-N：尾部 N 字节
    if (start > end || start >= total) {
      res.writeHead(416, baseHeaders({ "content-range": "bytes */" + total })); return res.end();
    }
    code = 206;
    headers["content-range"] = "bytes " + start + "-" + end + "/" + total;
  }
  headers["content-length"] = end - start + 1;
  res.writeHead(code, headers);
  if (req.method === "HEAD") return res.end();
  res.end(code === 206 ? entry.raw.subarray(start, end + 1) : entry.raw);
}

/* ================= 统计与后台看板 =================

   回答作者三个问题：多少人来、玩了多久、走到哪一步。设计取舍：

   · 事实源是按天追加的 JSONL（追加写天然崩溃安全）；聚合表 stats.json
     只是它的缓存——每 30 秒原子落盘（临时文件+rename，留 .bak），
     进程被杀重启后，当天数据从 JSONL 重放，不丢也不重
   · 持久化在 Railway Volume（RAILWAY_VOLUME_MOUNT_PATH）；没挂卷时照常
     工作但看板顶部亮红条警告「重启即丢」
   · 看板 /dash?key=… 零 JS、纯服务端渲染——没有脚本就没有 XSS 面；
     钥匙走环境变量 STATS_KEY，常量时间比较；没设 STATS_KEY 时看板 404
   · 信标数据一律不可信：id 只认 16 位十六进制，版本号白名单字符，
     事件名走枚举；限流按 IP 每分钟计数                              */

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.STATS_DIR || path.join(ROOT, "stats-data");
const VOLATILE = !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.STATS_DIR;
const STATS_KEY = process.env.STATS_KEY || "";
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

const EVENTS = ["view", "beat", "start", "career", "end"];
const ST = { days: {}, devices: new Set(), todayIds: new Set(), day: "", dirty: false, flushedAt: 0 };

/* 按北京时间归日：玩家几乎全在国内，看板上的「一天」要和他们的一天对齐 */
function dayStr(t) { return new Date((t || Date.now()) + 8 * 3600e3).toISOString().slice(0, 10); }
function evFile(day) { return path.join(DATA_DIR, "ev-" + day + ".jsonl"); }
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const DEV_FILE = path.join(DATA_DIR, "devices.log");

function blankDay() { return { pv: 0, uv: 0, nu: 0, min: 0, start: 0, career: 0, end: 0, ver: {} }; }

function loadStats() {
  for (const f of [STATS_FILE, STATS_FILE + ".bak"]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      if (j && j.days) { ST.days = j.days; break; }
    } catch (e) {}
  }
  try {
    fs.readFileSync(DEV_FILE, "utf8").split("\n").forEach(ln => {
      const id = ln.slice(11).trim();
      if (/^[0-9a-f]{16}$/.test(id)) ST.devices.add(id);
    });
  } catch (e) {}
  rebuildToday();
}

/* 当天聚合永远从当天 JSONL 重放——重启落在一天中间也不丢不重 */
function rebuildToday() {
  const day = dayStr();
  ST.day = day;
  ST.todayIds = new Set();
  const agg = blankDay();
  const newToday = new Set();
  try {
    fs.readFileSync(DEV_FILE, "utf8").split("\n").forEach(ln => {
      if (ln.slice(0, 10) === day) { const id = ln.slice(11).trim(); if (id) newToday.add(id); }
    });
  } catch (e) {}
  try {
    fs.readFileSync(evFile(day), "utf8").split("\n").forEach(ln => {
      if (!ln) return;
      let o; try { o = JSON.parse(ln); } catch (e) { return; }
      applyEvent(agg, ST.todayIds, o);
    });
  } catch (e) {}
  agg.uv = ST.todayIds.size;
  agg.nu = newToday.size;
  ST.days[day] = agg;
  ST.dirty = true;
}

function applyEvent(agg, ids, o) {
  if (o.e === "view") {
    agg.pv++;
    if (o.id) ids.add(o.id);
    if (o.v) agg.ver[o.v] = (agg.ver[o.v] || 0) + 1;
  }
  else if (o.e === "beat") agg.min++;
  else if (o.e === "start" || o.e === "career" || o.e === "end") agg[o.e]++;
}

function record(e, id, v) {
  const day = dayStr();
  if (day !== ST.day) {           // 跨天：昨天的聚合已在内存里，落盘后重开今天
    flush(true);
    ST.day = day; ST.todayIds = new Set(); ST.days[day] = blankDay();
    pruneEvents();
  }
  const o = { t: Date.now(), e, id, v };
  try { fs.appendFile(evFile(day), JSON.stringify(o) + "\n", () => {}); } catch (err) {}
  const agg = ST.days[day] = ST.days[day] || blankDay();
  const before = ST.todayIds.size;
  applyEvent(agg, ST.todayIds, o);
  if (ST.todayIds.size > before) {
    agg.uv = ST.todayIds.size;
    if (!ST.devices.has(id)) {
      ST.devices.add(id); agg.nu++;
      try { fs.appendFile(DEV_FILE, day + " " + id + "\n", () => {}); } catch (err) {}
    }
  }
  ST.dirty = true;
}

function flush(sync) {
  if (!ST.dirty) return;
  const body = JSON.stringify({ days: ST.days, savedAt: Date.now() });
  const tmp = STATS_FILE + ".tmp";
  try {
    if (sync) {
      try { fs.copyFileSync(STATS_FILE, STATS_FILE + ".bak"); } catch (e) {}
      fs.writeFileSync(tmp, body); fs.renameSync(tmp, STATS_FILE);
      ST.dirty = false; ST.flushedAt = Date.now();
    } else {
      fs.writeFile(tmp, body, err => {
        if (err) return;
        fs.copyFile(STATS_FILE, STATS_FILE + ".bak", () => {
          fs.rename(tmp, STATS_FILE, e2 => { if (!e2) { ST.dirty = false; ST.flushedAt = Date.now(); } });
        });
      });
    }
  } catch (e) {}
}
setInterval(() => flush(false), 30e3).unref();
process.on("SIGTERM", () => { flush(true); process.exit(0); });
process.on("SIGINT", () => { flush(true); process.exit(0); });

/* 原始事件文件只留 90 天（聚合表永久）；devices.log 很小，不动 */
function pruneEvents() {
  try {
    const cut = dayStr(Date.now() - 90 * 86400e3);
    fs.readdirSync(DATA_DIR).forEach(f => {
      const m = /^ev-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (m && m[1] < cut) { try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (e) {} }
    });
  } catch (e) {}
}

/* ---------- 信标入口（POST /api/t）---------- */
const RATE = new Map();   // ip -> {n, t0}
function rateOk(ip) {
  const now = Date.now();
  let r = RATE.get(ip);
  if (!r || now - r.t0 > 60e3) { r = { n: 0, t0: now }; RATE.set(ip, r); }
  if (RATE.size > 5000) RATE.clear();
  return ++r.n <= 240;
}
function handleBeacon(req, res) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (!rateOk(ip)) return send(res, 429, "");
  let buf = [], len = 0;
  req.on("data", c => { len += c.length; if (len <= 512) buf.push(c); else req.destroy(); });
  req.on("end", () => {
    try {
      const o = JSON.parse(Buffer.concat(buf).toString("utf8"));
      const id = String(o.id || "");
      const e = String(o.e || "");
      const v = String(o.v || "").slice(0, 24).replace(/[^0-9a-zA-Z.\-]/g, "");
      if (!/^[0-9a-f]{16}$/.test(id) || !EVENTS.includes(e)) return send(res, 204, "");
      record(e, id, v);
    } catch (err) {}
    send(res, 204, "");
  });
  req.on("error", () => {});
}

/* ---------- 看板鉴权：常量时间比较，没配钥匙就当这页不存在 ---------- */
function authOk(req) {
  if (!STATS_KEY) return false;
  let key = "";
  try { key = new URL(req.url, "http://x").searchParams.get("key") || ""; } catch (e) {}
  const a = Buffer.from(String(key)), b = Buffer.from(STATS_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtMin(m) { return m >= 60 ? (m / 60).toFixed(1) + " 小时" : m + " 分钟"; }

function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = dayStr(Date.now() - i * 86400e3);
    out.push({ d, a: ST.days[d] || blankDay() });
  }
  return out;
}

function svgBars(rows, pick, color) {
  const W = 900, H = 120, bw = W / rows.length;
  const mx = Math.max(1, ...rows.map(r => pick(r.a)));
  let s = `<svg viewBox="0 0 ${W} ${H + 18}" style="width:100%;height:auto">`;
  rows.forEach((r, i) => {
    const h = Math.round(pick(r.a) / mx * H);
    s += `<rect x="${(i * bw + 1).toFixed(1)}" y="${H - h}" width="${(bw - 2).toFixed(1)}" height="${h}" rx="2" fill="${color}"><title>${r.d}：${pick(r.a)}</title></rect>`;
    if (i % 5 === 0) s += `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 14}" font-size="10" fill="#7d8ea6" text-anchor="middle">${r.d.slice(5)}</text>`;
  });
  return s + "</svg>";
}

function dashHtml() {
  const today = ST.days[dayStr()] || blankDay();
  const d30 = lastDays(30);
  const d7 = lastDays(7);
  const tot = { pv: 0, min: 0, start: 0, career: 0, end: 0 };
  Object.values(ST.days).forEach(a => { tot.pv += a.pv; tot.min += a.min; tot.start += a.start; tot.career += a.career; tot.end += a.end; });
  const ver = {};
  d7.forEach(r => Object.entries(r.a.ver || {}).forEach(([k, n]) => ver[k] = (ver[k] || 0) + n));
  const verRows = Object.entries(ver).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, n]) => `<tr><td>${esc(k || "（未知）")}</td><td class="num">${n}</td></tr>`).join("");
  const tblRows = lastDays(14).reverse().map(r =>
    `<tr><td>${r.d}</td><td class="num">${r.a.pv}</td><td class="num">${r.a.uv}</td><td class="num">${r.a.nu}</td><td class="num">${r.a.min}</td><td class="num">${r.a.start}</td><td class="num">${r.a.career}</td><td class="num">${r.a.end}</td></tr>`).join("");
  const pc = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
  const stat = (n, l) => `<div class="st"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="300"><title>破晓 · 后台看板</title>
<style>
body{margin:0;background:#0b0f14;color:#dfe7f1;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;padding:24px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;color:#8fa2b8;margin:26px 0 10px;font-weight:600}
.sub{color:#7d8ea6;font-size:12px}
.warn{background:#3a1518;border:1px solid #7a2b31;color:#ffb3ba;padding:10px 14px;border-radius:8px;margin:14px 0;font-size:13px}
.grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.st{background:#121923;border:1px solid #1f2b3a;border-radius:10px;padding:12px 18px;min-width:96px}
.st .n{font-size:22px;font-weight:700;color:#5bc6cf;font-variant-numeric:tabular-nums}
.st .l{font-size:12px;color:#8fa2b8}
table{border-collapse:collapse;width:100%;max-width:720px;font-variant-numeric:tabular-nums}
td,th{padding:5px 10px;border-bottom:1px solid #1f2b3a;text-align:left;font-size:13px}
th{color:#8fa2b8;font-weight:600}.num{text-align:right}
.chart{background:#121923;border:1px solid #1f2b3a;border-radius:10px;padding:14px;max-width:960px}
.foot{margin-top:28px;color:#5d6c80;font-size:12px}
</style></head><body>
<h1>破晓 · 后台看板</h1>
<div class="sub">只有拿着钥匙的你能看到这页 · 每 5 分钟自动刷新 · 北京时间归日</div>
${VOLATILE ? '<div class="warn">⚠ 未检测到持久化卷（Railway Volume）——数据现在只存在容器磁盘上，<b>重新部署或重启就会清零</b>。到 Railway 服务设置里挂一个 Volume 即可。</div>' : ""}
<h2>今日</h2>
<div class="grid">${stat(today.pv, "浏览量 PV")}${stat(today.uv, "访客 UV")}${stat(today.nu, "新设备")}${stat(fmtMin(today.min), "游玩时长")}${stat(today.start, "开新档")}${stat(today.career, "签约上岸")}${stat(today.end, "打出结局")}</div>
<h2>累计</h2>
<div class="grid">${stat(tot.pv, "总浏览量")}${stat(ST.devices.size, "设备总数")}${stat(fmtMin(tot.min), "总游玩时长")}${stat(tot.start, "开档")}${stat(tot.career + " · " + pc(tot.career, tot.start), "上岸 · 转化")}${stat(tot.end + " · " + pc(tot.end, tot.start), "通关 · 转化")}</div>
<h2>近 30 天 · 访客 UV</h2><div class="chart">${svgBars(d30, a => a.uv, "#5bc6cf")}</div>
<h2>近 30 天 · 游玩分钟</h2><div class="chart">${svgBars(d30, a => a.min, "#c9a86a")}</div>
<h2>近 14 天明细</h2>
<table><tr><th>日期</th><th class="num">PV</th><th class="num">UV</th><th class="num">新设备</th><th class="num">分钟</th><th class="num">开档</th><th class="num">上岸</th><th class="num">通关</th></tr>${tblRows}</table>
<h2>版本分布（近 7 天 PV）</h2>
<table><tr><th>版本</th><th class="num">次数</th></tr>${verRows || '<tr><td colspan="2">还没有数据</td></tr>'}</table>
<div class="foot">数据目录 ${esc(DATA_DIR)} · 上次落盘 ${ST.flushedAt ? new Date(ST.flushedAt + 8 * 3600e3).toISOString().slice(11, 19) : "尚未"} (UTC+8) · 备份：<a style="color:#5bc6cf" href="/api/export?key=${encodeURIComponent(STATS_KEY)}">下载聚合数据 JSON</a></div>
</body></html>`;
}

const DASH_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    return send(res, 400, "bad request");   // 畸形的 %xx
  }
  if (req.method === "POST") {
    if (url === "/api/t") return handleBeacon(req, res);
    return send(res, 405, "method not allowed");
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "method not allowed");
  }
  // 健康检查：Railway 用它判断服务是否起来了（任何主机名都答）
  // 带部署标记：SRV_REV 每次发版手动 +1，用 curl /healthz 就能确认新代码真的上线了
  if (url === "/healthz") return send(res, 200, "ok r2 " + BOOT_AT);
  // 版本戳：页面开着时定时来问，ETag 变了就弹「游戏更新了 → 刷新」（audio.js 的 updInit）
  if (url === "/api/version") {
    const r = ROUTES["/"], file = typeof r === "string" ? r : (r && (r.file || r.path)) || "demo/career.html";
    const entry = loadAsset(file);
    return send(res, 200, JSON.stringify({ v: entry ? entry.etag : null, boot: BOOT_AT }),
      "application/json; charset=utf-8", { "cache-control": "no-store" });
  }
  // 作者后台：没配 STATS_KEY 或钥匙不对，一律装作没有这页
  if (url === "/dash" || url === "/api/stats" || url === "/api/export") {
    if (!authOk(req)) return send(res, 404, "not found");
    flush(false);
    if (url === "/dash")
      return send(res, 200, dashHtml(), "text/html; charset=utf-8",
        { "content-security-policy": DASH_CSP, "cache-control": "no-store" });
    const body = JSON.stringify({ days: ST.days, devices: ST.devices.size, generatedAt: Date.now() });
    return send(res, 200, body, "application/json; charset=utf-8",
      url === "/api/export" ? { "content-disposition": 'attachment; filename="poxiao-stats.json"' } : {});
  }

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

  if (url.startsWith("/bgm/") || url.startsWith("/fonts/")) return serveMedia(req, res, url);   // 背景音乐 / 自托管字体
  if (!ROUTES[url]) return send(res, 404, "not found");
  serveAsset(req, res, url);
});

loadStats();
server.listen(PORT, () => {
  console.log(`看板：${STATS_KEY ? "已配钥匙，/dash?key=…" : "未配 STATS_KEY，看板关闭（信标照记）"} · 数据目录 ${DATA_DIR}${VOLATILE ? "（⚠ 无持久化卷）" : ""} · 已记 ${ST.devices.size} 台设备`);
  const e = loadAsset("demo/career.html");
  console.log(`破晓 listening on ${PORT}` + (e
    ? ` · career.html ${(e.raw.length / 1024).toFixed(0)} KB → gzip ${(e.gz.length / 1024).toFixed(0)} KB / br ${(e.br.length / 1024).toFixed(0)} KB · ${e.scriptSrc.length} 段内联脚本进 CSP`
    : " · career.html 缺失"));
});
