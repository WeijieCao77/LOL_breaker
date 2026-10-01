/* 玩家信箱 —— 玩家在游戏里写一条建议，作者看过之后展示出来，大家投票，作者照着赞多的往下修。
   （作者 2026-10-01：「给 lol breaker 也加一个信箱功能」，照 val_player 的 box.js 移植）

   server.js 只负责把 /api/box/* 和 /dash/box 转到这里，存储、接口、审核页都在这个文件里。

   ================== 这条线不许越过 ==================

   统计那边「不记玩家打进去的任何文字」的规矩一个字不改：信箱是另一套文件、另一套接口、另一套
   聚合，两边不共用任何存储（作者 2026-10-01：「别把我以前的数据弄没了」——stats.json、ev-*.jsonl
   和设备表这里一个字节都不碰）。信箱当然要存玩家打的字——那是它的全部意义——但除了这些字和一个
   随机设备号，什么都不存：

   · 不记 IP。限流用的地址只活在内存的一张表里，一秒都不落盘、不进日志、不上审核页。
   · 不记 User-Agent，不记位置，不记存档内容，不记任何和统计对得上的东西。
   · 身份就是统计已经在用的那个设备号（浏览器第一次打开时自己生成的 16 位随机串，stats.ts）。
     审核页也不显示原文，只显示 sha256 的前 6 位——够你认出「这 8 条是同一台设备刷的」，
     又不是一个能拿去别处对的号。

   ================== 先审后展示 ==================

   玩家写的每一个字都会被别的玩家看到，这页是作者自己的站，出什么事都是作者担着。所以新投稿一律
   pending：除了提交的那台设备和作者，谁都看不见；作者在 /dash/box 按「展示」才上榜。
   「不展示」把已展示的收回成 hidden，内容还在、随时能再展示；真要清掉是另一个按钮。
   提交的人永远看得到自己那条和它的状态，所以信箱不会看起来像坏了。

   脏话表、字数上限、挡链接、挡重复，都只是第一道闸，不是唯一一道：就算有人绕过词表，没有作者
   点「展示」，别的玩家一个字都看不到。

   ================== 存储 ==================

   和统计同一个目录（DATA_DIR），自己的文件 box.jsonl：一行一条操作（new / vote / st / pin /
   del / merge / set），追加前后都带换行，避免写到一半的坏尾粘住下一条成功记录。启动时按顺序重放，
   空行、坏行跳过。追加成功才更新内存，写不进去就回一句中文。文件到上限就压实（每条一行 set）。

   信箱出任何毛病都不该变成游戏打不开：每个入口自己把错兜住，记一行，进程继续服务 demo/。 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ---------- 封顶 ----------
   公网是敌意的。一条这么长、一共这么多条、待审核最多排这么多、日志到这么大就压实。 */
const MAX_BODY = 8 * 1024;
/** 一条建议的字数（按码点数，一个汉字就是一个） */
const MAX_TEXT = 200, MIN_TEXT = 4;
/** 信箱里一共留这么多条（含未展示的）。到顶只挡新投稿，点赞不受影响 */
const MAX_ITEMS = 600;
/** 待审核排队上限：作者还没看完，就先别再收 */
const MAX_PENDING = 200;
/** 一条最多记这么多个投票设备（真实永远到不了，防的是脚本） */
const MAX_VOTERS = 5000;
/** 日志到这么大就压实成每条一行；压实之后仍到硬上限就只收减量操作 */
const COMPACT_AT = 4 * 1024 * 1024, HARD_BYTES = 8 * 1024 * 1024;
/** 公开榜只取前这么多条；「我的」不分页 */
const LIST_MAX = 200, MINE_MAX = MAX_ITEMS;

const ID_RE = /^[0-9a-f]{8}$/;
const STATES = new Set(["pending", "shown", "hidden", "taken", "fixed", "merged"]);
/** 上榜的三种状态：别人看得见的就这三种 */
const PUBLIC_STATES = new Set(["shown", "taken", "fixed"]);
const STATE_CN = { pending: "待审核", shown: "已展示", hidden: "已收回", taken: "已采纳", fixed: "已修复", merged: "已合并" };

/* 挡回去的词：第一道闸而已，真正的闸是「作者没点展示就谁都看不见」。
   只挡明显的垃圾引流，不做情绪审查——骂游戏难、骂数值不合理都该收得到。 */
const BLOCK = ["加微信", "加qq", "威信", "薇信", "代练", "外挂", "开挂", "辅助器", "私聊我", "加群领",
  "色情", "博彩", "赌博", "彩票", "贷款", "刷单", "套现", "发票", "优惠券", "折扣群", "带货"];
const LINKY = /(https?:\/\/|www\.|\.com|\.cn\b|\.net\b|\.xyz\b|t\.me|qq\.com)/i;
/** 连着 8 位以上数字：手机号 / QQ 号 / 微信号，先挡住再说 */
const DIGITS = /\d{8,}/;

const BOX = { dir: "", file: "", bytes: 0, errCount: 0, lastErr: "", ready: false, volatile: false };
const ITEMS = new Map();

function logErr(where, e) {
  BOX.errCount++;
  // 地址永远不许进日志：socket 出错时 Node 会把对端地址写进 message
  BOX.lastErr = String(`${where}: ${e && e.message ? e.message : String(e)}`)
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip]")
    .replace(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi, "[ip]");
  if (BOX.errCount <= 50) console.error("[信箱] " + BOX.lastErr);
}

/* ---------- 重放与落盘 ---------- */
/** 合并的终点：顺着链条走到一条还活着、没再被合并的；成环、断链都返回 null */
function mergeTarget(id, items, source) {
  const seen = new Set(source ? [source] : []);
  while (typeof id === "string" && ID_RE.test(id) && !seen.has(id)) {
    seen.add(id);
    const it = items.get(id);
    if (!it) return null;
    if (it.state !== "merged") return it;
    id = it.mergedTo;
  }
  return null;
}

function applyOp(o, items) {
  if (!o || typeof o !== "object") return;
  const id = typeof o.id === "string" ? o.id : "";
  if (!ID_RE.test(id)) return;
  if (o.o === "new" || o.o === "set") {
    const it = {
      id,
      t: Number.isFinite(o.t) ? o.t : 0,
      dev: typeof o.dev === "string" ? o.dev : "",
      text: typeof o.text === "string" ? o.text : "",
      state: STATES.has(o.s) ? o.s : "pending",
      pin: o.p ? 1 : 0,
      votes: new Set(Array.isArray(o.v) ? o.v.filter(x => typeof x === "string").slice(0, MAX_VOTERS) : []),
      mergedTo: typeof o.mergedTo === "string" ? o.mergedTo : "",
      mergedAt: Number.isFinite(o.mergedAt) ? o.mergedAt : 0,
    };
    if (it.state === "merged") { it.votes.clear(); it.pin = 0; }
    else if (o.o === "new" && it.dev) it.votes.add(it.dev);     // 提了一条就是投了自己一票
    items.set(id, it);
    return;
  }
  const it = items.get(id);
  if (!it) return;
  if (o.o === "vote") {
    if (it.state === "merged") return;
    if (typeof o.dev !== "string" || !o.dev) return;
    if (o.on) { if (it.votes.size < MAX_VOTERS) it.votes.add(o.dev); } else it.votes.delete(o.dev);
  } else if (o.o === "st") {
    if (it.state !== "merged" && o.s !== "merged" && STATES.has(o.s)) it.state = o.s;
  } else if (o.o === "pin") {
    if (it.state !== "merged") it.pin = o.v ? 1 : 0;
  } else if (o.o === "del") {
    items.delete(id);
  } else if (o.o === "merge") {
    if (it.state === "merged") return;
    const to = mergeTarget(o.to, items, id);
    if (!to) return;
    const votes = new Set([...to.votes, ...it.votes]);
    if (votes.size > MAX_VOTERS) return;
    /* 合并时把指过来的回执一起改到新终点：中间那条以后被删掉，原作者也不会断在半路 */
    for (const r of items.values()) {
      if (r.state === "merged") { const t = mergeTarget(r.mergedTo, items, r.id); if (t && t.id === id) r.mergedTo = to.id; }
    }
    to.votes = votes;
    it.state = "merged"; it.mergedTo = to.id;
    it.mergedAt = Number.isFinite(o.t) ? o.t : Date.now();
    it.votes.clear(); it.pin = 0;
  }
}

/** 一条操作：追加成功才记账。写不进去回 false，调用方显示失败。 */
function write(o) {
  if (!BOX.ready) return false;
  let line;
  /* 不能只在启动时检查坏尾：同一进程的 append 也可能写了一半才抛错。
     每条都先隔开前面的残片；重放本就忽略空行，旧日志无需迁移。 */
  try { line = "\n" + JSON.stringify(o) + "\n"; } catch (e) { logErr("序列化", e); return false; }
  const add = Buffer.byteLength(line);
  // 到硬上限：先在副本里演算「压实 + 这一笔」，算得出来才原子替换；减量操作（删除 / 合并）照旧放行
  if (BOX.bytes + add >= HARD_BYTES) {
    const draft = new Map();
    for (const [k, v] of ITEMS) draft.set(k, { ...v, votes: new Set(v.votes) });
    applyOp(o, draft);
    const body = snapshot(draft);
    if (Buffer.byteLength(body) >= HARD_BYTES) { logErr("满", new Error("信箱文件到硬上限，这一笔不收")); return false; }
    if (!replaceSnapshot(body)) return false;
    ITEMS.clear(); for (const [k, v] of draft) ITEMS.set(k, v);
    return true;
  }
  try { fs.appendFileSync(BOX.file, line); } catch (e) { logErr("追加", e); return false; }
  BOX.bytes += add;
  applyOp(o, ITEMS);
  if (BOX.bytes >= COMPACT_AT) { try { compact(); } catch (e) { logErr("压实", e); } }
  return true;
}

/** 当前状态压成「每条一行 set」 */
function snapshot(items) {
  let s = "";
  for (const it of items.values()) {
    s += JSON.stringify({ o: "set", id: it.id, t: it.t, dev: it.dev, text: it.text, s: it.state,
      p: it.pin, v: [...it.votes], ...(it.state === "merged" ? { mergedTo: it.mergedTo, mergedAt: it.mergedAt } : {}) }) + "\n";
  }
  return s;
}

/** 原子替换：先写临时文件，再 rename；中途断电也不会留半截正文 */
function replaceSnapshot(body) {
  const tmp = BOX.file + ".tmp";
  try {
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, BOX.file);
    BOX.bytes = Buffer.byteLength(body);
    return true;
  } catch (e) {
    logErr("压实替换", e);
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return false;
  }
}

function compact() { replaceSnapshot(snapshot(ITEMS)); }

/** server.js 启动时叫一次：读盘、重放。读不出来就当空信箱，游戏照常 */
function initBox(opt) {
  try {
    BOX.dir = (opt && opt.dir) || "";
    BOX.volatile = !!(opt && opt.volatile);
    BOX.file = path.join(BOX.dir, "box.jsonl");
    let raw = "";
    try { raw = fs.readFileSync(BOX.file, "utf8"); } catch (e) { raw = ""; }
    BOX.bytes = Buffer.byteLength(raw);
    raw.split("\n").forEach(ln => {
      const s = ln.trim();
      if (!s) return;
      let o = null;
      try { o = JSON.parse(s); } catch (e) { return; }   // 坏行跳过：半截的、被截断的都不认
      try { applyOp(o, ITEMS); } catch (e) { logErr("重放", e); }
    });
    BOX.ready = true;
    return { items: ITEMS.size, bytes: BOX.bytes };
  } catch (e) {
    logErr("启动", e);
    BOX.ready = false;
    return { items: 0, bytes: 0 };
  }
}

/** 看板那一块：待审核多少、榜上多少、一共多少 */
function boxCounts() {
  let pending = 0, shown = 0;
  for (const it of ITEMS.values()) {
    if (it.state === "pending") pending++;
    else if (PUBLIC_STATES.has(it.state)) shown++;
  }
  return { pending, shown, total: ITEMS.size, ready: BOX.ready };
}

/* ---------- 过闸的几道检查 ---------- */
function clean(v) {
  if (typeof v !== "string") return "";
  let s = "";
  for (const ch of v) {
    const c = ch.codePointAt(0);
    s += (c <= 31 || c === 127) ? " " : ch;
    if (s.length > 4 * MAX_TEXT) break;            // 长度另外核；这里只是不让一串怪字把后面的活撑大
  }
  return s.replace(/\s+/g, " ").trim();
}
/** 查重用的样子：去掉空白和标点，只比字 */
const normal = s => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
const short = vid => crypto.createHash("sha256").update(String(vid)).digest("hex").slice(0, 6);
/** 设备号：统计那个 16 位十六进制（stats.ts 生成） */
const devOk = s => typeof s === "string" && /^[0-9a-f]{16}$/.test(s);

/* ---------- 限流：只在内存里 ----------
   地址只活在这张表里，不写盘、不进日志、不上审核页。 */
const WIN = new Map(), WIN_MAX_KEYS = 8000;
function limit(key, max, ms) {
  const now = Date.now();
  let r = WIN.get(key);
  if (!r || now - r.t0 > ms) {
    if (!r && WIN.size >= WIN_MAX_KEYS) {
      for (const [k, v] of WIN) if (now - v.t0 > v.ms) WIN.delete(k);
      if (WIN.size >= WIN_MAX_KEYS) return false;
    }
    r = { n: 0, t0: now, ms }; WIN.set(key, r);
  }
  return ++r.n <= max;
}
/** 看一眼还剩不剩，不计数 */
function over(key, max) {
  const r = WIN.get(key);
  return !!(r && Date.now() - r.t0 <= r.ms && r.n >= max);
}
const HOUR = 3600e3, DAY = 86400e3, TEN_MIN = 10 * 60e3;
const env = (k, d) => Number(process.env[k]) || d;
/** 每台设备：投稿 3 条/小时、10 条/天；投票 60 次/10 分钟 */
const NEW_PER_HOUR = env("BOX_NEW_HOUR", 3), NEW_PER_DAY = env("BOX_NEW_DAY", 10), VOTE_PER_TEN = env("BOX_VOTE_TEN", 60);
/** 每个来源：写 30 次/10 分钟、读 120 次/分钟；全站写 600 次/10 分钟 */
const IP_WRITE = env("BOX_RATE_IP", 30), IP_READ = env("BOX_RATE_READ", 120), ALL_WRITE = env("BOX_RATE_ALL", 600);

/* ---------- 回话 ---------- */
function json(res, code, obj) {
  let body = '{"ok":false}';
  try { body = JSON.stringify(obj); } catch (e) {}
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(body);
}
const no = (res, why, code) => json(res, code || 200, { ok: false, why });

function readBody(req) {
  return new Promise(resolve => {
    let chunks = [], len = 0, over2 = false;
    req.on("data", c => {
      len += c.length;
      if (len > MAX_BODY) { over2 = true; chunks = []; req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(over2 ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

/** 合并回执：只发给提交者本人 */
function mergeReceipt(it) {
  const target = mergeTarget(it.mergedTo, ITEMS, it.id);
  if (!target) return { availability: "missing" };
  if (!PUBLIC_STATES.has(target.state)) return { availability: "private" };
  return { availability: "public", target: { id: target.id, text: target.text, state: target.state, votes: target.votes.size } };
}
/** 发给玩家的样子：绝不带 dev（别人的设备号谁都不该拿到） */
const wire = (it, vid) => Object.assign({
  id: it.id, t: it.t, text: it.text, votes: it.votes.size, state: it.state, pin: it.pin,
  mine: !!vid && !!it.dev && it.dev === vid,
  voted: !!vid && it.votes.has(vid),
}, (it.state === "merged" && !!vid && it.dev === vid) ? { merge: mergeReceipt(it) } : {});

/** 榜的顺序：置顶的在前，然后票多的，一样多的新的在前 */
const rank = (a, b) => (b.pin - a.pin) || (b.votes.size - a.votes.size) || (b.t - a.t);

/* ---------- 三个公开接口 ---------- */
async function apiList(req, res, ip) {
  if (!limit("r:" + ip, IP_READ, 60e3)) return no(res, "太快了，歇一会儿。", 429);
  const body = await readBody(req);
  let b = null;
  try { b = body ? JSON.parse(body) : null; } catch (e) { b = null; }
  const vid = b && devOk(b.vid) ? b.vid : "";
  const all = [...ITEMS.values()];
  const items = all.filter(it => PUBLIC_STATES.has(it.state)).sort(rank).slice(0, LIST_MAX).map(it => wire(it, vid));
  const mine = vid ? all.filter(it => it.dev === vid).sort((a, b2) => b2.t - a.t).slice(0, MINE_MAX).map(it => wire(it, vid)) : [];
  json(res, 200, { ok: true, items, mine, max: MAX_TEXT, min: MIN_TEXT, full: ITEMS.size >= MAX_ITEMS });
}

async function apiNew(req, res, ip) {
  const body = await readBody(req);
  if (body === null) return no(res, "这条太长了，说重点就行。");
  let b = null;
  try { b = JSON.parse(body); } catch (e) { b = null; }
  if (!b || typeof b !== "object" || b.v !== 1) return no(res, "没看懂这条，刷新一下再试。");
  if (!devOk(b.vid)) return no(res, "没认出你的浏览器，刷新一下再试。");
  if (!limit("w:" + ip, IP_WRITE, TEN_MIN) || !limit("w:all", ALL_WRITE, TEN_MIN)) return no(res, "发得太快了，过一会儿再来。", 429);
  const text = clean(b.text);
  const n = [...text].length;
  if (n < MIN_TEXT) return no(res, `太短了，至少 ${MIN_TEXT} 个字，把想说的说清楚。`);
  if (n > MAX_TEXT) return no(res, `一条最多 ${MAX_TEXT} 个字，长了就分两条。`);
  const low = text.toLowerCase();
  if (BLOCK.some(w => low.includes(w))) return no(res, "这条里有不能挂在公开榜上的词，换个说法再发。");
  if (LINKY.test(text)) return no(res, "先别放链接，直接说问题就行。");
  if (DIGITS.test(text)) return no(res, "别留联系方式，作者在这儿就看得到你写的。");
  // 同一台设备提过一模一样的话：挡回去。别人提过同样的话照收，审核页会标「疑似重复」，作者可以合并
  const key = normal(text);
  for (const it of ITEMS.values()) {
    if (it.dev === b.vid && normal(it.text) === key) return no(res, "这条你已经提过了，在「我的」里能看到。");
  }
  if (ITEMS.size >= MAX_ITEMS) return no(res, "信箱满了，作者清一清就好。先去给已有的建议点个赞吧。");
  let pending = 0;
  for (const it of ITEMS.values()) if (it.state === "pending") pending++;
  if (pending >= MAX_PENDING) return no(res, "作者还没看完排队的建议，过两天再来。");
  if (over("nh:" + b.vid, NEW_PER_HOUR)) return no(res, `一小时最多发 ${NEW_PER_HOUR} 条，攒一攒再来。`, 429);
  if (over("nd:" + b.vid, NEW_PER_DAY)) return no(res, `一天最多发 ${NEW_PER_DAY} 条，明天再来。`, 429);
  limit("nh:" + b.vid, NEW_PER_HOUR, HOUR);
  limit("nd:" + b.vid, NEW_PER_DAY, DAY);
  let id = "";
  for (let i = 0; i < 8 && !id; i++) { const c = crypto.randomBytes(4).toString("hex"); if (!ITEMS.has(c)) id = c; }
  if (!id) return no(res, "这会儿发不出去，等会儿再试。");
  if (!write({ o: "new", id, t: Date.now(), dev: b.vid, text, s: "pending" })) {
    return no(res, "作者的服务器一时写不进去，等会儿再发一次。");
  }
  json(res, 200, { ok: true, item: wire(ITEMS.get(id), b.vid) });
}

async function apiVote(req, res, ip) {
  const body = await readBody(req);
  let b = null;
  try { b = body ? JSON.parse(body) : null; } catch (e) { b = null; }
  if (!b || typeof b !== "object" || b.v !== 1) return no(res, "没看懂，刷新一下再试。");
  if (!devOk(b.vid) || typeof b.id !== "string" || !ID_RE.test(b.id)) return no(res, "没认出这一条，刷新一下再试。");
  if (!limit("w:" + ip, IP_WRITE, TEN_MIN) || !limit("w:all", ALL_WRITE, TEN_MIN)) return no(res, "点太快了，歇一会儿。", 429);
  if (!limit("vt:" + b.vid, VOTE_PER_TEN, TEN_MIN)) return no(res, "点太快了，歇一会儿。", 429);
  const it = ITEMS.get(b.id);
  // 没审核的条目对别人根本不存在：连「有没有这一条」都不该被问出来
  if (!it || !PUBLIC_STATES.has(it.state)) return no(res, "这条已经不在榜上了。");
  if (it.dev === b.vid) return no(res, "这条是你自己提的，已经算你一票了。");
  const on = !!b.on;
  if (it.votes.has(b.vid) === on) return json(res, 200, { ok: true, id: it.id, votes: it.votes.size, on });
  if (on && it.votes.size >= MAX_VOTERS) return no(res, "这条的赞已经记满了。");
  if (!write({ o: "vote", id: it.id, dev: b.vid, on: on ? 1 : 0 })) return no(res, "这一下没记上，再点一次。");
  json(res, 200, { ok: true, id: it.id, votes: it.votes.size, on });
}

/** /api/box/* ——接住了回 true。任何一处抛错都只记一行，游戏那边照样拿到一句中文。 */
function handleBoxApi(req, res, p, ip) {
  const act = p === "/api/box/list" ? apiList : p === "/api/box/new" ? apiNew : p === "/api/box/vote" ? apiVote : null;
  if (!act) return false;
  if (req.method !== "POST") { json(res, 405, { ok: false, why: "方法不对" }); return true; }
  if (!BOX.ready) { json(res, 200, { ok: false, why: "信箱这会儿没开，游戏不受影响。" }); return true; }
  act(req, res, ip).catch(e => {
    logErr("接口", e);
    try { no(res, "信箱这会儿不太舒服，游戏没事。"); } catch (e2) {}
  });
  return true;
}

/* ================= 审核页 =================
   纯服务端渲染、零 JS、纯表单——没有脚本就没有 XSS 面。玩家打的字在这里也只是数据：
   每一处都过 esc()，一次都不许原样插进 HTML。 */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const when = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");

/* 批量：一百多条一条条点太慢（val_player 的作者 2026-09-25 原话）。每行一个勾，页底一条动作条，
   一次表单 POST 改完所有勾上的。只做可逆的；删除和合并仍然一条一条来。 */
const BULK = {
  shown: ["st", "shown", "展示"], hidden: ["st", "hidden", "不展示"],
  taken: ["st", "taken", "已采纳"], fixed: ["st", "fixed", "已修复"],
  pin: ["pin", 1, "置顶"], unpin: ["pin", 0, "取消置顶"],
};
const GROUPS = [
  ["wait", "待审核", it => it.state === "pending"],
  ["live", "榜上", it => PUBLIC_STATES.has(it.state)],
  ["away", "已收回 / 已合并", it => it.state === "hidden" || it.state === "merged"],
];

/** 疑似重复：正文抹掉标点空白之后一样的，标给作者看，他决定合不合 */
function dupMap() {
  const byKey = new Map(), dup = new Map();
  for (const it of [...ITEMS.values()].sort((a, b) => a.t - b.t)) {
    if (it.state === "merged") continue;
    const k = normal(it.text);
    if (!k) continue;
    if (byKey.has(k)) dup.set(it.id, byKey.get(k)); else byKey.set(k, it.id);
  }
  return dup;
}

function row(it, dupOf) {
  const tag = `<span class="st s-${it.state}">${STATE_CN[it.state] || it.state}</span>`;
  const btn = (act, label) => `<button name="act" value="${act}:${it.id}">${label}</button>`;
  const acts = it.state === "merged" ? "" : [
    it.state === "pending" || it.state === "hidden" ? btn("shown", "展示") : btn("hidden", "不展示"),
    btn("taken", "采纳"), btn("fixed", "修复"),
    it.pin ? btn("unpin", "取消置顶") : btn("pin", "置顶"),
    btn("del", "删除"),
  ].join(" ");
  const merge = it.state === "merged"
    ? `<span class="dim">已并入 ${esc(it.mergedTo || "—")}</span>`
    : `<input form="one" name="to" placeholder="并入 id" size="10" maxlength="8"> ${dupOf ? `<span class="dup">疑似重复 ${esc(dupOf)}</span>` : ""}`;
  return `<tr>
    <td><input type="checkbox" form="bulk" name="id" value="${it.id}"${it.state === "merged" ? " disabled" : ""}></td>
    <td class="id">${it.id}<div class="dim">${when(it.t)}</div></td>
    <td class="txt">${esc(it.text)}<div class="dim">设备 ${esc(short(it.dev || "-"))} · ${it.votes.size} 赞${it.pin ? " · 置顶" : ""}</div></td>
    <td>${tag}</td>
    <td class="acts">${acts}<div class="mg">${merge}${it.state === "merged" ? "" : `<button name="act" value="merge:${it.id}">合并</button>`}</div></td>
  </tr>`;
}

function boxHtml(msg) {
  const dup = dupMap();
  const all = [...ITEMS.values()];
  const sec = GROUPS.map(([key, name, pick]) => {
    const list = all.filter(pick).sort(key === "wait" ? (a, b) => a.t - b.t : rank);
    if (!list.length) return `<h2>${name}<span class="dim"> · 0</span></h2><p class="dim">这一组现在是空的。</p>`;
    return `<h2>${name}<span class="dim"> · ${list.length}</span></h2>
    <table><tr><th></th><th>编号</th><th>正文</th><th>状态</th><th>操作</th></tr>
    ${list.map(it => row(it, dup.get(it.id))).join("")}</table>`;
  }).join("");
  const c = boxCounts();
  const bulkBtns = Object.entries(BULK).map(([k, v]) => `<button name="bulk" value="${k}">${v[2]}</button>`).join(" ");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>破晓 · 玩家信箱</title>
<style>
body{margin:0;background:#0b0f14;color:#dfe7f1;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;padding:24px 16px 120px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;color:#8fa2b8;margin:26px 0 10px;font-weight:600}
a{color:#5bc6cf}.sub{color:#7d8ea6;font-size:12px}.dim{color:#5d6c80;font-size:12px}
.msg{background:#10261f;border:1px solid #1f5c46;color:#9ae6c4;padding:8px 12px;border-radius:8px;margin:12px 0;font-size:13px}
.grid{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}
.st{display:inline-block;border-radius:999px;padding:1px 8px;font-size:12px;background:#1f2b3a;color:#8fa2b8}
.s-shown{background:#123;color:#5bc6cf}.s-taken{background:#1b2c18;color:#9ad67f}.s-fixed{background:#16301f;color:#6fd6a0}
.s-pending{background:#2c2415;color:#d8b25e}.s-hidden{background:#2a1c1c;color:#c88}
table{border-collapse:collapse;width:100%;max-width:1100px;margin-bottom:6px}
td,th{padding:6px 8px;border-bottom:1px solid #1f2b3a;text-align:left;font-size:13px;vertical-align:top}
th{color:#8fa2b8;font-weight:600}.id{white-space:nowrap;color:#8fa2b8;font-family:ui-monospace,monospace}
.txt{min-width:260px}.acts{white-space:nowrap}.mg{margin-top:6px}
.dup{color:#d8b25e;font-size:12px}
button{background:#182533;color:#dfe7f1;border:1px solid #2b3a4d;border-radius:6px;padding:3px 8px;margin:1px;font-size:12px;cursor:pointer}
button:hover{border-color:#5bc6cf}
input[type=text],input[name=to]{background:#0f1620;color:#dfe7f1;border:1px solid #2b3a4d;border-radius:6px;padding:3px 6px;font-size:12px}
.bar{position:fixed;left:0;right:0;bottom:0;background:#101823;border-top:1px solid #1f2b3a;padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
</style></head><body>
<h1>破晓 · 玩家信箱</h1>
<div class="sub">和看板同一把钥匙 · 新投稿只有提交的那台设备和你看得见，按「展示」才上榜 · <a href="/dash">← 回看板</a></div>
${msg ? `<div class="msg">${esc(msg)}</div>` : ""}
<div class="grid"><span class="st s-pending">待审核 ${c.pending}</span><span class="st s-shown">榜上 ${c.shown}</span><span class="st">一共 ${c.total}</span><span class="st">文件 ${(BOX.bytes / 1024).toFixed(0)} KB</span>${BOX.volatile ? '<span class="st s-hidden">⚠ 无持久化卷</span>' : ""}</div>
<form id="one" method="post" action="/dash/box"></form>
<form id="bulk" method="post" action="/dash/box"></form>
${sec}
<div class="bar" ><span class="dim">勾选之后：</span>${bulkBtns}<span class="dim">（删除和合并请用每行自己的按钮）</span></div>
<div class="sub" style="margin-top:18px">不记 IP、不记 User-Agent；设备只显示哈希前 6 位。${BOX.errCount ? ` · 信箱内部错误 ${BOX.errCount} 次（最近：${esc(BOX.lastErr)}）` : ""}</div>
</body></html>`;
}

/* 表单回来：解析 application/x-www-form-urlencoded */
function parseForm(s) {
  const out = { id: [] };
  String(s || "").split("&").forEach(kv => {
    if (!kv) return;
    const i = kv.indexOf("=");
    const k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, " "));
    const v = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
    if (k === "id") out.id.push(v); else out[k] = v;
  });
  return out;
}

/** 同源才认：浏览器发过来的表单必须带本站的 Origin / Referer */
function sameOrigin(req) {
  const host = String(req.headers.host || "");
  const o = String(req.headers.origin || "");
  if (o) { try { return new URL(o).host === host; } catch (e) { return false; } }
  const r = String(req.headers.referer || "");
  if (r) { try { return new URL(r).host === host; } catch (e) { return false; } }
  return false;
}

/** 审核页：GET 画页面，POST 执行动作再画 */
async function handleBoxAdmin(req, res) {
  if (!BOX.ready) return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }) || res.end("<meta charset=utf-8>信箱没开起来（看服务端日志）。游戏不受影响。");
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": BOX_CSP, "x-frame-options": "DENY" });
    return res.end(boxHtml(""));
  }
  if (req.method !== "POST") { res.writeHead(405, { "content-type": "text/plain; charset=utf-8" }); return res.end("method not allowed"); }
  if (!sameOrigin(req)) { res.writeHead(403, { "content-type": "text/plain; charset=utf-8" }); return res.end("跨站提交不认"); }
  const body = await readBody(req);
  const f = parseForm(body);
  let msg = "";
  if (f.act) {
    const i = String(f.act).indexOf(":");
    const act = String(f.act).slice(0, i), id = String(f.act).slice(i + 1);
    const it = ID_RE.test(id) ? ITEMS.get(id) : null;
    if (!it) msg = "这一条找不到了。";
    else if (act === "del") msg = write({ o: "del", id }) ? `删掉了 ${id}。` : "删不掉，写盘失败。";
    else if (act === "pin" || act === "unpin") msg = write({ o: "pin", id, v: act === "pin" ? 1 : 0 }) ? "改好了。" : "没写进去。";
    else if (act === "merge") {
      const to = String(f.to || "").trim();
      if (!ID_RE.test(to) || !ITEMS.has(to)) msg = "要并到的编号填错了。";
      else if (to === id) msg = "不能并到自己身上。";
      else msg = write({ o: "merge", id, to, t: Date.now() }) ? `${id} 已并入 ${to}，票数合并去重。` : "合并没写进去。";
    } else if (BULK[act]) {
      const [kind, val] = BULK[act];
      msg = write(kind === "st" ? { o: "st", id, s: val } : { o: "pin", id, v: val }) ? "改好了。" : "没写进去。";
    } else msg = "没看懂这个操作。";
  } else if (f.bulk && BULK[f.bulk]) {
    const [kind, val, label] = BULK[f.bulk];
    const ids = [...new Set(f.id.filter(x => ID_RE.test(x)))].slice(0, MAX_ITEMS);
    let ok = 0, skip = 0;
    for (const id of ids) {
      const it = ITEMS.get(id);
      if (!it || it.state === "merged") { skip++; continue; }
      if (write(kind === "st" ? { o: "st", id, s: val } : { o: "pin", id, v: val })) ok++; else skip++;
    }
    msg = `批量「${label}」：改了 ${ok} 条${skip ? `，跳过 ${skip} 条（已合并或写盘失败）` : ""}。`;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": BOX_CSP, "x-frame-options": "DENY" });
  res.end(boxHtml(msg));
}

module.exports = { initBox, handleBoxApi, handleBoxAdmin, boxCounts, MAX_TEXT, MIN_TEXT,
  _state: { ITEMS, BOX, applyOp, write, clean, normal, snapshot } };
