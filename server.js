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

   2026-09-07 第二轮审计（Codex）后补的：
   · 信标限流只在受信代理后面看 X-Forwarded-For、且取代理追加的最后一段（第一段是客户端自己写的），
     另加全站每分钟总量封顶，限流表满了清过期项而不是整表清空；
   · 聚合表异步落盘期间来的新事件不再被旧回调的 dirty=false 抹掉（按代数判断），两次落盘不并发；
   · 看板钥匙不再留在 URL：改成浏览器自带的密码框（HTTP Basic），打开 /dash 输一次钥匙就记住；
     脚本 curl -u :钥匙；
   · /api/bgm 报歌单里实际存在的文件，客户端据此藏掉没有音乐的 ♪ 钮。

   Railway 会注入 PORT，本地默认 3000。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
/* 玩家信箱（box.js）：另一套文件、另一套接口，和统计不共用任何存储 */
const BOX = require("./box");

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
                      ".woff": "font/woff", ".woff2": "font/woff2",   // /fonts/：界面重做第三期的自托管宋体子集
                      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };   // /img/：主视觉、分享图
function serveMedia(req, res, url) {
  const m = /^\/(bgm|fonts|img)\/([a-z0-9_-]+)(\.[a-z0-9]+)$/i.exec(url);   // /img/：主视觉、分享图（demo/img/）
  const type = m && MEDIA_TYPES[m[3].toLowerCase()];
  if (!type) return send(res, 404, "not found");
  if (m[1] === "fonts" && !/^font\//.test(type)) return send(res, 404, "not found");
  if (m[1] === "bgm" && !/^audio\//.test(type)) return send(res, 404, "not found");
  if (m[1] === "img" && !/^image\//.test(type)) return send(res, 404, "not found");
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

/* 收哪些事件。原来只有六个，客户端一直在发的「交流群」「生涯名片图」被默默丢掉；
   2026-10-01 补齐，并加上看板新几节要的那些（都是枚举，不收任何玩家打进去的文字）。 */
const EVENTS = ["view", "beat", "start", "career", "end", "support",
  "community", "community_auto", "sharecard", "box_open", "box_new",
  "week1", "season1", "match", "savefail", "jserr"];
/* 事件可以带几个<b>枚举</b>字段。每一个都在这里核过格式才记——
   服务端不认客户端传来的任何自由文本，报错也只收「文件:行:列」。 */
const FIELD_OK = {
  k: /^[A-Za-z0-9_\-]{1,24}$/,                    // 结局 key
  o: /^(academy|streamer)$/,                      // 出身
  y: /^(2016|2022)$/,                             // 入场年份
  p: /^(top|jng|mid|bot|sup)$/,                   // 位置
  rg: /^[A-Z]{2,6}$/,                             // 赛区
  dv: /^(m|t|d)$/,                                // 设备：手机 / 平板 / 电脑
  wd: /^\d{3,4}(\+|-\d{3,4})$/,                  // 屏宽档
  m: /^(w|s)$/,                                   // 比赛：打完 / 快进
  er: /^[A-Za-z0-9_.\-]{1,40}:\d{1,6}:\d{1,6}$/,  // 前端报错的位置
};
function fields(o) {
  const out = {};
  Object.keys(FIELD_OK).forEach(k => {
    const v = o[k];
    if (typeof v === "string" && v.length <= 24 && FIELD_OK[k].test(v)) out[k] = v;
  });
  return out;
}
/* gen：每记一笔加一；异步落盘拿着开始时的代数，写完只有代数没变才敢把 dirty 放下 */
const ST = { days: {}, devices: new Set(), todayIds: new Set(), day: "", dirty: false, flushedAt: 0, gen: 0, flushedGen: 0, flushing: false };

/* 按北京时间归日：玩家几乎全在国内，看板上的「一天」要和他们的一天对齐 */
function dayStr(t) { return new Date((t || Date.now()) + 8 * 3600e3).toISOString().slice(0, 10); }
function evFile(day) { return path.join(DATA_DIR, "ev-" + day + ".jsonl"); }
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const DEV_FILE = path.join(DATA_DIR, "devices.log");

/* 一天的聚合。上面那排是老字段，<b>一个都不改</b>——老的 stats.json 直接读得动（作者 2026-10-01：
   「别把我以前的数据弄没了」）。下面那排是 2026-10-01 新加的，老的日子里没有，看板按空处理：
   act 当天活跃设备的下标、sec 各自的分钟、f 漏斗每一步的设备、endK 结局、st/yr/rl/rg 开局构成、
   dv/wd 设备与屏宽（与 act 同序）、m 打完还是快进、sf 存档失败、er 前端报错位置。 */
function blankDay() {
  return { pv: 0, uv: 0, nu: 0, min: 0, start: 0, career: 0, end: 0, support: 0, ver: {},
    act: [], sec: [], dv: [], wd: [],
    f: { profile: [], week1: [], season1: [], ending: [] },
    endK: {}, st: {}, yr: {}, rl: {}, rg: {}, m: {}, sf: 0, er: {}, box: {} };
}
/* 老格式的日子读进来缺哪补哪：只补默认值，不动已有的数 */
function fillDay(a) {
  const b = blankDay();
  Object.keys(b).forEach(k => {
    if (a[k] === undefined || a[k] === null) a[k] = b[k];
    else if (k === "f") ["profile", "week1", "season1", "ending"].forEach(x => { if (!Array.isArray(a.f[x])) a.f[x] = []; });
  });
  return a;
}

/* 设备登记表：devices.txt 本来就是「首见日 + 设备号」一行一台，这里顺手读成下标表。
   下标只在聚合里当数字用（act / 漏斗），设备号本身不进 stats.json。 */
const REG = { vids: [], idx: new Map(), firstDay: {} };
function vidIdx(id, day) {
  let i = REG.idx.get(id);
  if (i === undefined) { i = REG.vids.length; REG.vids.push(id); REG.idx.set(id, i); REG.firstDay[id] = day || dayStr(); }
  return i;
}

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
      if (/^[0-9a-f]{16}$/.test(id)) { ST.devices.add(id); vidIdx(id, ln.slice(0, 10)); }
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
  const pos = ST.pos = new Map();      // 全局下标 → 当天 act 里的位置
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
      applyEvent(agg, ST.todayIds, o, pos, day);
    });
  } catch (e) {}
  agg.uv = ST.todayIds.size;
  agg.nu = newToday.size;
  ST.days[day] = agg;
  ST.dirty = true; ST.gen++;
}

/* 这台设备在当天 act 里的位置（没有就加一格）。pos 是「全局下标 → 当天下标」的临时表，
   重启时 rebuildToday 会重新建一张，不进存档。 */
function slot(agg, pos, id, day) {
  if (!id) return -1;
  const gi = vidIdx(id, day);
  let i = pos.get(gi);
  if (i === undefined) {
    i = agg.act.length; pos.set(gi, i);
    agg.act.push(gi); agg.sec.push(0); agg.dv.push(""); agg.wd.push("");
  }
  return i;
}
const bump = (o, k) => { if (k) o[k] = (o[k] || 0) + 1; };
/** 漏斗某一步记上这台设备（去重） */
function step(agg, name, i) { if (i >= 0 && agg.f[name].indexOf(i) < 0) agg.f[name].push(i); }

function applyEvent(agg, ids, o, pos, day) {
  fillDay(agg);
  const i = slot(agg, pos || new Map(), o.id, day);
  if (o.e === "view") {
    agg.pv++;
    if (o.id) ids.add(o.id);
    if (o.v) agg.ver[o.v] = (agg.ver[o.v] || 0) + 1;
    if (i >= 0) { if (o.dv) agg.dv[i] = o.dv; if (o.wd) agg.wd[i] = o.wd; }
  }
  else if (o.e === "beat") { agg.min++; if (i >= 0) agg.sec[i] = (agg.sec[i] || 0) + 1; }
  else if (o.e === "start" || o.e === "career" || o.e === "end" || o.e === "support") {
    agg[o.e] = (agg[o.e] || 0) + 1;   // 老聚合表没有 support 字段
    if (o.e === "start") { step(agg, "profile", i); bump(agg.st, o.o); bump(agg.yr, o.y); bump(agg.rl, o.p); }
    if (o.e === "career") bump(agg.rg, o.rg);
    if (o.e === "end") { step(agg, "ending", i); bump(agg.endK, o.k); }
  }
  else if (o.e === "week1") step(agg, "week1", i);
  else if (o.e === "season1") step(agg, "season1", i);
  else if (o.e === "match") bump(agg.m, o.m);
  else if (o.e === "savefail") agg.sf = (agg.sf || 0) + 1;
  else if (o.e === "jserr") bump(agg.er, o.er);
  else if (o.e === "box_open" || o.e === "box_new") bump(agg.box, o.e === "box_new" ? "new" : "open");
  else if (o.e === "community" || o.e === "community_auto" || o.e === "sharecard") bump(agg.box, o.e);
}

function record(e, id, v, x) {
  const day = dayStr();
  if (day !== ST.day) {           // 跨天：昨天的聚合已在内存里，落盘后重开今天
    flush(true);
    ST.day = day; ST.todayIds = new Set(); ST.pos = new Map(); ST.days[day] = blankDay();
    pruneEvents();
  }
  const o = Object.assign({ t: Date.now(), e, id, v }, x || {});
  try { fs.appendFile(evFile(day), JSON.stringify(o) + "\n", () => {}); } catch (err) {}
  const agg = ST.days[day] = ST.days[day] || blankDay();
  const before = ST.todayIds.size;
  applyEvent(agg, ST.todayIds, o, ST.pos || (ST.pos = new Map()), day);
  if (ST.todayIds.size > before) {
    agg.uv = ST.todayIds.size;
    if (!ST.devices.has(id)) {
      ST.devices.add(id); agg.nu++;
      try { fs.appendFile(DEV_FILE, day + " " + id + "\n", () => {}); } catch (err) {}
    }
  }
  ST.dirty = true; ST.gen++;
}

/* 落盘。异步路径原来有个丢数据的竞态（外部审计 P2）：写盘开始前快照，写完无条件 dirty=false——
   写盘期间来的事件把 dirty 置回 true 又被旧回调抹掉；之后没流量、跨日后重启，这些事件不再从 JSONL 重放。
   现在：写完只有代数没变才放下 dirty；两次异步落盘不并发（/dash 每次都会触发一次）；
   同步落盘（退出、跨日）用自己的临时文件名，异步那份如果落在它后面、代数更旧，就丢掉不覆盖。 */
function flush(sync) {
  if (!ST.dirty) return;
  const gen = ST.gen;
  const body = JSON.stringify({ days: ST.days, savedAt: Date.now() });
  try {
    if (sync) {
      const tmp = STATS_FILE + ".tmp-sync";
      try { fs.copyFileSync(STATS_FILE, STATS_FILE + ".bak"); } catch (e) {}
      fs.writeFileSync(tmp, body); fs.renameSync(tmp, STATS_FILE);
      ST.dirty = false; ST.flushedAt = Date.now(); ST.flushedGen = gen;
    } else {
      if (ST.flushing) return;
      ST.flushing = true;
      const tmp = STATS_FILE + ".tmp";
      fs.writeFile(tmp, body, err => {
        if (err) { ST.flushing = false; return; }
        fs.copyFile(STATS_FILE, STATS_FILE + ".bak", () => {
          if (gen < ST.flushedGen) { ST.flushing = false; fs.unlink(tmp, () => {}); return; }   // 中途已有更新的一份同步落了盘
          fs.rename(tmp, STATS_FILE, e2 => {
            ST.flushing = false;
            if (e2) return;
            ST.flushedAt = Date.now(); ST.flushedGen = gen;
            if (ST.gen === gen) ST.dirty = false;   // 写盘期间又记了事件：dirty 留着，30 秒后再落
          });
        });
      });
    }
  } catch (e) { ST.flushing = false; }
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

/* ---------- 信标入口（POST /api/t）----------
   客户端 IP：X-Forwarded-For 只在受信代理（Railway 边缘）后面才看，而且取代理追加的最后一段——
   第一段是客户端自己想写什么写什么，原来取第一段等于限流可以随手绕过（外部审计 P1）。
   本地直连只认 socket 地址。别的托管把 TRUST_PROXY=1 设上即可。 */
const BEHIND_PROXY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.TRUST_PROXY);
function clientIp(req) {
  if (BEHIND_PROXY) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return String(req.socket.remoteAddress || "");
}
/* 限流：每个来源每分钟 240 次，全站每分钟 3000 次封顶（就算来源伪造成功也灌不满卷）；
   表满了先清过期项、还满就拒绝新来源——原来是整表清空，正好给刷子放行 */
const RATE = new Map();   // ip -> {n, t0}
const RATE_PER_IP = 240, RATE_GLOBAL = 3000, RATE_MAX_KEYS = 5000;
const RATE_ALL = { n: 0, t0: 0 };
function rateOk(ip) {
  const now = Date.now();
  if (now - RATE_ALL.t0 > 60e3) { RATE_ALL.n = 0; RATE_ALL.t0 = now; }
  if (++RATE_ALL.n > RATE_GLOBAL) return false;
  let r = RATE.get(ip);
  if (!r || now - r.t0 > 60e3) {
    if (!r && RATE.size >= RATE_MAX_KEYS) {
      for (const [k, v] of RATE) if (now - v.t0 > 60e3) RATE.delete(k);
      if (RATE.size >= RATE_MAX_KEYS) return false;
    }
    r = { n: 0, t0: now }; RATE.set(ip, r);
  }
  return ++r.n <= RATE_PER_IP;
}
function handleBeacon(req, res) {
  const ip = clientIp(req);
  if (!rateOk(ip)) return send(res, 429, "");
  let buf = [], len = 0;
  req.on("data", c => { len += c.length; if (len <= 1024) buf.push(c); else req.destroy(); });   // 多了几个枚举字段
  req.on("end", () => {
    try {
      const o = JSON.parse(Buffer.concat(buf).toString("utf8"));
      const id = String(o.id || "");
      const e = String(o.e || "");
      const v = String(o.v || "").slice(0, 24).replace(/[^0-9a-zA-Z.\-]/g, "");
      if (!/^[0-9a-f]{16}$/.test(id) || !EVENTS.includes(e)) return send(res, 204, "");
      record(e, id, v, fields(o));
    } catch (err) {}
    send(res, 204, "");
  });
  req.on("error", () => {});
}

/* ---------- 看板鉴权：浏览器自带的密码框（HTTP Basic）----------
   作者嫌 ?key= + Cookie 那套绕：现在打开 /dash 浏览器弹密码框，用户名随便（留空也行）、密码填 STATS_KEY，
   浏览器整个会话记住，还会问要不要存进密码管理器。钥匙走 Authorization 头，不进 URL、不进日志。
   脚本：curl -u :钥匙 https://www.poxiao.lol/api/export
   · 没配 STATS_KEY：仍然 404，当这页不存在
   · 钥匙错 / 没给：401 + WWW-Authenticate，浏览器就会（再）弹框；常量时间比较
   · 同一来源 10 分钟里错 30 次就 429 十分钟，别让人拿密码框慢慢猜 */
function sameSecret(a, b) { a = Buffer.from(String(a || "")); b = Buffer.from(String(b || "")); return a.length === b.length && crypto.timingSafeEqual(a, b); }
const AUTH_FAILS = new Map();   // ip -> {n, t0}
const AUTH_FAIL_MAX = 30, AUTH_FAIL_WIN = 10 * 60e3;
function authFail(ip) {
  const now = Date.now();
  let r = AUTH_FAILS.get(ip);
  if (!r || now - r.t0 > AUTH_FAIL_WIN) { r = { n: 0, t0: now }; AUTH_FAILS.set(ip, r); }
  if (AUTH_FAILS.size > 2000) for (const [k, v] of AUTH_FAILS) if (now - v.t0 > AUTH_FAIL_WIN) AUTH_FAILS.delete(k);
  r.n++;
}
function authBlocked(ip) { const r = AUTH_FAILS.get(ip); return !!(r && Date.now() - r.t0 <= AUTH_FAIL_WIN && r.n >= AUTH_FAIL_MAX); }
/* 返回 "ok"（放行）/ "ask"（弹密码框）/ "blocked"（猜太多次）/ ""（装作没有这页） */
function dashAuth(req) {
  if (!STATS_KEY) return "";
  const ip = clientIp(req);
  if (authBlocked(ip)) return "blocked";
  const auth = String(req.headers.authorization || "");
  let m, given = "";
  if ((m = /^Bearer\s+(.+)$/i.exec(auth))) given = m[1].trim();
  else if ((m = /^Basic\s+(.+)$/i.exec(auth))) {
    let raw = ""; try { raw = Buffer.from(m[1].trim(), "base64").toString("utf8"); } catch (e) {}
    const i = raw.indexOf(":");
    const user = i < 0 ? raw : raw.slice(0, i), pw = i < 0 ? "" : raw.slice(i + 1);
    given = pw || user;   // 密码填钥匙；有人把钥匙填在用户名、密码留空也认
  }
  if (!auth) return "ask";
  if (sameSecret(given, STATS_KEY)) return "ok";
  authFail(ip);
  return "ask";
}
function dashAsk(res) {
  return send(res, 401, "需要密码：用户名留空，密码填 STATS_KEY。", "text/plain; charset=utf-8",
    { "www-authenticate": 'Basic realm="poxiao dash", charset="UTF-8"' });
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

/* 结局 key → 中文（demo/src/main.ts 的 ENDING_KEY）。看板上没见过的 key 照原样单独列一行——
   宁可多出一行陌生的，也不要新加的结局在看板上凭空消失。 */
const ENDING_CN = { nosign: "没能上岸", bench: "板凳冠军", nobody: "泯然众人", dynasty: "王朝", breaker: "破局者",
  legend: "传奇", worlds: "世界冠军", twocup: "两冠", halfcrown: "半程加冕", uncrowned: "无冕之王",
  finalloss: "决赛遗恨", semiloss: "四强遗恨", quarters: "八强常客", region: "赛区功勋", domestic: "内战之王",
  evergreen: "常青树", darkage: "至暗未破", other: "（没对上的）" };
const START_CN = { academy: "青训", streamer: "主播" };
const DEV_CN = { m: "手机", t: "平板", d: "电脑" };
const MATCH_CN = { w: "打完", s: "快进" };
const BOX_CN = { open: "打开信箱", new: "写了建议", community: "点开交流群", community_auto: "交流群自动弹", sharecard: "生成名片图" };

const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + "%" : "—");
function median(a) {
  if (!a || !a.length) return 0;
  const x = a.slice().sort((p, q) => p - q), i = x.length >> 1;
  return x.length % 2 ? x[i] : (x[i - 1] + x[i]) / 2;
}
const shiftDay = (d, k) => dayStr(new Date(d + "T00:00:00+08:00").getTime() + k * 86400e3);
/** 一节「谁多少次」的小表；没有数据就说没有 */
function countTable(o, head, cn) {
  const rows = Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((t, [, n]) => t + n, 0);
  if (!rows.length) return `<table><tr><th>${head}</th><th class="num">次数</th></tr><tr><td colspan="2" class="dim">还没有数据</td></tr></table>`;
  return `<table><tr><th>${head}</th><th class="num">次数</th><th class="num">占比</th></tr>${rows.map(([k, n]) =>
    `<tr><td>${esc((cn && cn[k]) || k)}</td><td class="num">${n}</td><td class="num">${pct(n, sum)}</td></tr>`).join("")}</table>`;
}

function dashHtml() {
  const today = fillDay(ST.days[dayStr()] || blankDay());
  const D = 30;
  const d30 = lastDays(D);
  const win = d30.map(r => fillDay(r.a));
  const tot = { pv: 0, min: 0, start: 0, career: 0, end: 0, support: 0 };
  Object.values(ST.days).forEach(a => { tot.pv += a.pv; tot.min += a.min; tot.start += a.start; tot.career += a.career; tot.end += a.end; tot.support += a.support || 0; });

  // ---- 在线时长：按设备把窗口内的分钟加起来（act / sec 是 2026-10-01 之后的日子才有）
  const minByDev = new Map();
  const dayMins = [];
  win.forEach(a => {
    (a.act || []).forEach((vi, i) => {
      const m = (a.sec || [])[i] || 0;
      minByDev.set(vi, (minByDev.get(vi) || 0) + m);
      if (m) dayMins.push(m);
    });
  });
  const devMins = [...minByDev.values()];
  const totMin = devMins.reduce((t, x) => t + x, 0);

  // ---- 漏斗：按设备去重，窗口里曾经走到这一步的设备数
  const uni = pick => { const s2 = new Set(); win.forEach(a => (pick(a) || []).forEach(vi => s2.add(vi))); return s2.size; };
  const fn = [
    ["打开", uni(a => a.act)],
    ["建档", uni(a => a.f.profile)],
    ["推完第一周", uni(a => a.f.week1)],
    ["打完第一个赛季", uni(a => a.f.season1)],
    ["走到结局", uni(a => a.f.ending)],
  ];
  const fnTop = fn[0][1];
  const fnRows = fn.map(([k, n], i) => {
    const prev = i ? fn[i - 1][1] : 0;
    return `<tr><td>${k}</td><td class="num">${n}</td><td class="num">${i ? pct(n, prev) : "—"}</td><td class="num">${i ? pct(n, fnTop) : "100.0%"}</td></tr>`;
  }).join("");

  // ---- 留存：按首见日分群，次日 / 第 3 日 / 第 7 日回访率（回访 = 那天这台设备有事件）
  const todayStr = dayStr();
  const cohorts = [];
  for (let i = 14; i >= 1; i--) {
    const c = dayStr(Date.now() - i * 86400e3);
    const a0 = ST.days[c];
    if (!a0 || !a0.act || !a0.act.length) continue;
    const members = a0.act.filter(vi => REG.firstDay[REG.vids[vi]] === c);
    if (!members.length) continue;
    const set = new Set(members);
    const cell = k => {
      const d = shiftDay(c, k);
      if (d >= todayStr) return null;                 // 这一天还没过完
      const a = ST.days[d];
      if (!a || !a.act) return 0;
      let n = 0;
      a.act.forEach(vi => { if (set.has(vi)) n++; });
      return n;
    };
    cohorts.push({ c, size: members.length, r1: cell(1), r3: cell(3), r7: cell(7) });
  }
  const rcell = (n, size) => (n === null ? '<td class="num dim">—</td>' : `<td class="num">${pct(n, size)}</td>`);
  const retRows = cohorts.map(x => `<tr><td>${x.c}</td><td class="num">${x.size}</td>${rcell(x.r1, x.size)}${rcell(x.r3, x.size)}${rcell(x.r7, x.size)}</tr>`).join("");

  // ---- 分布几节
  const merge = pick => { const o = {}; win.forEach(a => Object.entries(pick(a) || {}).forEach(([k, n]) => o[k] = (o[k] || 0) + n)); return o; };
  /* 按设备去重的那几节：同一台设备活跃好几天只能算一台，所以先把窗口里每台设备的档位
     收进一张表（最后一次为准），再数。按天直接相加是错的——一台每天都来的手机会被算成三十台。 */
  const perDev = pick => {
    const last = new Map();
    win.forEach(a => (a.act || []).forEach((vi, i) => { const v = (pick(a) || [])[i]; if (v) last.set(vi, v); }));
    const o = {};
    for (const v of last.values()) o[v] = (o[v] || 0) + 1;
    return o;
  };
  const endAll = merge(a => a.endK);
  for (const k of Object.keys(ENDING_CN)) if (!(k in endAll) && k !== "other") endAll[k] = 0;   // 没人打到的结局也列出来，0 是个答案
  const endRows = Object.entries(endAll).sort((a, b) => b[1] - a[1]);
  const endSum = endRows.reduce((t, [, n]) => t + n, 0);
  const endTable = `<table><tr><th>结局</th><th>key</th><th class="num">人次</th><th class="num">占比</th></tr>${endRows.map(([k, n]) =>
    `<tr><td>${esc(ENDING_CN[k] || k)}</td><td class="dim">${esc(k)}</td><td class="num">${n}</td><td class="num">${pct(n, endSum)}</td></tr>`).join("")}</table>`;
  const mt = merge(a => a.m), mSum = (mt.w || 0) + (mt.s || 0);
  const sf = win.reduce((t, a) => t + (a.sf || 0), 0);

  const ver = {};
  lastDays(7).forEach(r => Object.entries(r.a.ver || {}).forEach(([k, n]) => ver[k] = (ver[k] || 0) + n));
  const verRows = Object.entries(ver).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, n]) => `<tr><td>${esc(k || "（未知）")}</td><td class="num">${n}</td></tr>`).join("");
  const tblRows = lastDays(14).reverse().map(r => {
    const a = fillDay(r.a);
    const mins = (a.sec || []).filter(x => x);
    return `<tr><td>${r.d}</td><td class="num">${a.pv}</td><td class="num">${a.uv}</td><td class="num">${a.nu}</td><td class="num">${a.min}</td><td class="num">${mins.length ? fmtMin(Math.round(a.min / a.uv)) : "—"}</td><td class="num">${mins.length ? fmtMin(Math.round(median(mins))) : "—"}</td><td class="num">${a.start}</td><td class="num">${a.career}</td><td class="num">${a.end}</td></tr>`;
  }).join("");

  const stat = (n, l) => `<div class="st"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  /* 玩家信箱（box.js）：一打开看板就看得见有多少条在等着审核，点一下就过去 */
  let box = { pending: 0, shown: 0, total: 0 };
  try { box = BOX.boxCounts(); } catch (e) {}
  const boxUse = merge(a => a.box);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="300"><title>破晓 · 后台看板</title>
<style>
body{margin:0;background:#0b0f14;color:#dfe7f1;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;padding:24px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;color:#8fa2b8;margin:26px 0 10px;font-weight:600}
.sub{color:#7d8ea6;font-size:12px}.dim{color:#5d6c80}
a{color:#5bc6cf}
.warn{background:#3a1518;border:1px solid #7a2b31;color:#ffb3ba;padding:10px 14px;border-radius:8px;margin:14px 0;font-size:13px}
.grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.st{background:#121923;border:1px solid #1f2b3a;border-radius:10px;padding:12px 18px;min-width:96px}
.st .n{font-size:22px;font-weight:700;color:#5bc6cf;font-variant-numeric:tabular-nums}
.st .l{font-size:12px;color:#8fa2b8}
a.st{display:block;text-decoration:none}a.st:hover{border-color:#5bc6cf}a.st .l{color:#5bc6cf}
table{border-collapse:collapse;width:100%;max-width:820px;font-variant-numeric:tabular-nums;margin-bottom:6px}
td,th{padding:5px 10px;border-bottom:1px solid #1f2b3a;text-align:left;font-size:13px}
th{color:#8fa2b8;font-weight:600}.num{text-align:right}
.chart{background:#121923;border:1px solid #1f2b3a;border-radius:10px;padding:14px;max-width:960px}
.two{display:flex;flex-wrap:wrap;gap:24px}.two>div{min-width:280px;flex:1}
.foot{margin-top:28px;color:#5d6c80;font-size:12px}
</style></head><body>
<h1>破晓 · 后台看板</h1>
<div class="sub">只有拿着钥匙的你能看到这页 · 每 5 分钟自动刷新 · 北京时间归日 · 统计窗口 ${D} 天</div>
${VOLATILE ? '<div class="warn">⚠ 未检测到持久化卷（Railway Volume）——数据现在只存在容器磁盘上，<b>重新部署或重启就会清零</b>。到 Railway 服务设置里挂一个 Volume 即可。</div>' : ""}
<h2>玩家信箱</h2>
<div class="grid"><a class="st" href="/dash/box"><div class="n">${box.pending}</div><div class="l">待审核 →</div></a>${stat(box.shown, "榜上")}${stat(box.total, "一共")}${stat(boxUse.open || 0, "打开信箱")}${stat(boxUse.new || 0, "写了建议")}</div>
<div class="sub">玩家在游戏里写的建议。你按「展示」之前，只有写的人自己看得见；点上面那块去审核页。</div>
<h2>今日</h2>
<div class="grid">${stat(today.pv, "浏览量 PV")}${stat(today.uv, "访客 UV")}${stat(today.nu, "新设备")}${stat(fmtMin(today.min), "游玩时长")}${stat(today.start, "开新档")}${stat(today.career, "签约上岸")}${stat(today.end, "打出结局")}${stat(today.support || 0, "点开支持")}</div>
<h2>累计</h2>
<div class="grid">${stat(tot.pv, "总浏览量")}${stat(ST.devices.size, "设备总数")}${stat(fmtMin(tot.min), "总游玩时长")}${stat(tot.start, "开档")}${stat(tot.career + " · " + pct(tot.career, tot.start), "上岸 · 转化")}${stat(tot.end + " · " + pct(tot.end, tot.start), "通关 · 转化")}${stat(tot.support, "点开支持")}</div>
<h2>在线时长（近 ${D} 天 · 按设备）</h2>
<div class="grid">${stat(fmtMin(devMins.length ? Math.round(totMin / devMins.length) : 0), "人均（每台设备累计）")}${stat(fmtMin(Math.round(median(devMins))), "中位（每台设备累计）")}${stat(fmtMin(dayMins.length ? Math.round(dayMins.reduce((t, x) => t + x, 0) / dayMins.length) : 0), "人均（每台设备每天）")}${stat(fmtMin(Math.round(median(dayMins))), "中位（每台设备每天）")}</div>
<div class="sub">心跳只在标签页可见、已开局、最近 3 分钟有操作时才记，同一浏览器开几个标签页只算一个。2026-10-01 之前的日子没有按设备的分钟，所以只算得出这之后的。</div>
<h2>近 ${D} 天 · 访客 UV</h2><div class="chart">${svgBars(d30, a => a.uv, "#5bc6cf")}</div>
<h2>近 ${D} 天 · 游玩分钟</h2><div class="chart">${svgBars(d30, a => a.min, "#c9a86a")}</div>
<h2>近 14 天明细</h2>
<table><tr><th>日期</th><th class="num">PV</th><th class="num">UV</th><th class="num">新设备</th><th class="num">分钟</th><th class="num">人均在线</th><th class="num">中位在线</th><th class="num">开档</th><th class="num">上岸</th><th class="num">通关</th></tr>${tblRows}</table>
<h2>漏斗（近 ${D} 天 · 按设备去重）</h2>
<table><tr><th>阶段</th><th class="num">设备数</th><th class="num">转化</th><th class="num">占打开</th></tr>${fnRows}</table>
<div class="sub">建档 = 开新档，推完第一周 = 签约后推过一周，打完第一个赛季 = 走完一个赛段结算，走到结局 = 生涯结束。</div>
<h2>留存（按首见日分群 · 回访 = 那天有事件）</h2>
<table><tr><th>首见日</th><th class="num">人数</th><th class="num">次日</th><th class="num">第 3 日</th><th class="num">第 7 日</th></tr>${retRows || '<tr><td colspan="5" class="dim">还没有满一天的群（2026-10-01 起开始按设备记）</td></tr>'}</table>
<h2>结局分布（近 ${D} 天）</h2>
${endTable}
<h2>开局构成（近 ${D} 天）</h2>
<div class="two">
<div><h2>出身</h2>${countTable(merge(a => a.st), "出身", START_CN)}</div>
<div><h2>入场年份</h2>${countTable(merge(a => a.yr), "入场年份", null)}</div>
</div>
<div class="two">
<div><h2>位置</h2>${countTable(merge(a => a.rl), "位置", null)}</div>
<div><h2>签约赛区</h2>${countTable(merge(a => a.rg), "赛区", null)}</div>
</div>
<h2>比赛：亲自打还是托管（近 ${D} 天）</h2>
<div class="grid">${stat(mt.w || 0, "亲自打完")}${stat(mt.s || 0, "托管打完")}${stat(pct(mt.w || 0, mSum), "亲自打占比")}</div>
<h2>存档失败（近 ${D} 天）</h2>
<div class="grid">${stat(sf, "存档失败次数")}</div>
<div class="sub">iPhone 的存储配额问题会先在这里露头，然后才会有人来报。</div>
<h2>前端报错（近 ${D} 天）</h2>
${countTable(merge(a => a.er), "出错位置", null)}
<div class="sub">只有出错的文件和行号，没有报错信息本身——引擎的报错会把拿到的东西原样插进去，那可以是任何东西。</div>
<h2>设备与屏幕（近 ${D} 天 · 按设备去重）</h2>
<div class="two">
<div>${countTable(perDev(a => a.dv), "设备类型", DEV_CN)}</div>
<div>${countTable(perDev(a => a.wd), "屏幕宽度", null)}</div>
</div>
<h2>其它入口（近 ${D} 天）</h2>
${countTable(Object.fromEntries(Object.entries(boxUse).filter(([k]) => k !== "open" && k !== "new")), "入口", BOX_CN)}
<h2>版本分布（近 7 天 PV）</h2>
<table><tr><th>版本</th><th class="num">次数</th></tr>${verRows || '<tr><td colspan="2" class="dim">还没有数据</td></tr>'}</table>
<div class="foot">数据目录 ${esc(DATA_DIR)} · 设备总数 ${REG.vids.length} · 上次落盘 ${ST.flushedAt ? new Date(ST.flushedAt + 8 * 3600e3).toISOString().slice(11, 19) : "尚未"} (UTC+8) · 备份：<a href="/api/export">下载聚合数据 JSON</a>（脚本：<code>curl -u :钥匙 …/api/export</code>）<br>不记 IP、不记 User-Agent、不记玩家打进去的任何文字（信箱是另一套：玩家自己写给作者的建议，见 /dash/box）。</div>
</body></html>`;
}

const DASH_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/* ---------- 歌单探测：/api/bgm ----------
   仓库不带任何 mp3（.gitignore），干净部署上 demo/bgm/ 只有 README；原来客户端只看浏览器支不支持 <audio>，
   ♪ 钮永远在，点播放连吃 21 个 404 之后按钮还亮着「已开启」（外部审计 P2）。
   这里把目录里实际存在的、符合白名单文件名的曲子报出去；目录扫描 60 秒缓存一次。 */
const BGM = { at: 0, list: [] };
function bgmList() {
  const now = Date.now();
  if (now - BGM.at < 60e3) return BGM.list;
  BGM.at = now;
  try {
    BGM.list = fs.readdirSync(path.join(ROOT, "demo", "bgm")).filter(f => /^[a-z0-9_-]+\.mp3$/.test(f)).map(f => f.slice(0, -4)).sort();
  } catch (e) { BGM.list = []; }
  return BGM.list;
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    return send(res, 400, "bad request");   // 畸形的 %xx
  }
  /* 玩家信箱（box.js）：接住了由它回话，没接住照旧往下走。统计那条路一个字没动 */
  if (url.startsWith("/api/box/")) {
    try { if (BOX.handleBoxApi(req, res, url, clientIp(req))) return; } catch (e) {
      return send(res, 200, '{"ok":false,"why":"信箱这会儿不太舒服，游戏没事。"}', "application/json; charset=utf-8");
    }
  }
  /* 信箱审核页：和 /dash 同一把钥匙、同一道门（没配 STATS_KEY 就当这页不存在） */
  if (url === "/dash/box") {
    const auth = dashAuth(req);
    if (!auth) return send(res, 404, "not found");
    if (auth === "blocked") return send(res, 429, "猜太多次了，十分钟后再试。");
    if (auth === "ask") return dashAsk(res);
    try {
      return void BOX.handleBoxAdmin(req, res).catch(e => {
        try { send(res, 500, "信箱这页算不出来了，游戏没事。"); } catch (e2) {}
      });
    } catch (e) { return send(res, 500, "信箱这页算不出来了，游戏没事。"); }
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
  // 歌单探测：demo/bgm/ 里实际有哪些曲子（仓库不带 mp3，干净部署上是空表，客户端据此藏掉 ♪）
  if (url === "/api/bgm") {
    return send(res, 200, JSON.stringify({ tracks: bgmList() }), "application/json; charset=utf-8", { "cache-control": "no-cache" });
  }
  // 作者后台：没配 STATS_KEY 或钥匙不对，一律装作没有这页
  if (url === "/dash" || url === "/api/stats" || url === "/api/export") {
    const auth = dashAuth(req);
    if (!auth) return send(res, 404, "not found");
    if (auth === "blocked") return send(res, 429, "猜太多次了，十分钟后再试。");
    if (auth === "ask") return dashAsk(res);
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

  if (url.startsWith("/bgm/") || url.startsWith("/fonts/") || url.startsWith("/img/")) return serveMedia(req, res, url);   // 背景音乐 / 自托管字体 / 主视觉
  if (!ROUTES[url]) return send(res, 404, "not found");
  serveAsset(req, res, url);
});

loadStats();
const boxInit = BOX.initBox({ dir: DATA_DIR, volatile: VOLATILE });
server.listen(PORT, () => {
  console.log(`看板：${STATS_KEY ? "已配钥匙，打开 /dash 在浏览器密码框里填钥匙；脚本 curl -u :钥匙 /api/export" : "未配 STATS_KEY，看板关闭（信标照记）"} · 数据目录 ${DATA_DIR}${VOLATILE ? "（⚠ 无持久化卷）" : ""} · 已记 ${ST.devices.size} 台设备${BEHIND_PROXY ? " · 受信代理后（X-Forwarded-For 取末段）" : ""} · 歌单 ${bgmList().length} 首 · 信箱 ${boxInit.items} 条（${(boxInit.bytes / 1024).toFixed(0)} KB）`);
  const e = loadAsset("demo/career.html");
  console.log(`破晓 listening on ${PORT}` + (e
    ? ` · career.html ${(e.raw.length / 1024).toFixed(0)} KB → gzip ${(e.gz.length / 1024).toFixed(0)} KB / br ${(e.br.length / 1024).toFixed(0)} KB · ${e.scriptSrc.length} 段内联脚本进 CSP`
    : " · career.html 缺失"));
});
