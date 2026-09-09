/* 小红书九图 · 从 content.json 生成 card-01..09.html
   改文字只改 content.json，改完跑 node build.mjs                       */
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, "content.json"), "utf8"));
const has = (f) => f && fs.existsSync(path.join(DIR, "photos", f));
const esc = (s = "") => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const br = (s = "") => esc(s).replace(/\n/g, "<br>");

/* 标题字号按最长一行的字数收，保证不撑破安全区 */
function titleSize(t = "") {
  const n = Math.max(...t.split("\n").map((l) => l.length));
  if (n <= 4) return 168;
  if (n <= 7) return 128;
  if (n <= 10) return 100;
  return 84;
}

const BASE = `*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1440px;overflow:hidden;position:relative;
  font-family:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif;
  color:#e8eef7;background:#0b1320}
.frame{position:absolute;inset:34px;border:1px solid rgba(201,169,97,.4);z-index:5;pointer-events:none;
  clip-path:polygon(46px 0,100% 0,100% calc(100% - 46px),calc(100% - 46px) 100%,0 100%,0 46px)}
.eyebrow{font-size:30px;letter-spacing:.5em;color:#c9a961;margin-bottom:24px}
.credit{position:absolute;right:74px;bottom:52px;font-size:22px;color:rgba(232,238,247,.5);z-index:6;letter-spacing:.04em}
.title{font-weight:900;line-height:1.2;letter-spacing:.02em;text-shadow:0 4px 40px rgba(0,0,0,.6)}
.sub{font-size:38px;line-height:1.7;color:#c3d2e4;margin-top:30px;text-shadow:0 2px 20px rgba(0,0,0,.6)}`;

const PHOTO = `.ph{position:absolute;inset:0;z-index:0}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.scrim{position:absolute;inset:0;z-index:1;
  background:linear-gradient(180deg,rgba(6,10,18,.55) 0%,rgba(6,10,18,0) 26%,rgba(6,10,18,.35) 52%,rgba(6,10,18,.92) 88%)}
.slot{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;
  background:repeating-linear-gradient(45deg,#0e1a2c,#0e1a2c 22px,#0b1320 22px,#0b1320 44px)}
.slot .box{border:3px dashed rgba(201,169,97,.55);padding:64px;max-width:820px;text-align:left}
.slot h3{font-size:44px;color:#c9a961;margin-bottom:28px;letter-spacing:.06em}
.slot p{font-size:31px;line-height:1.85;color:#9fb3cc}
.slot b{color:#e8eef7;font-weight:700}
.body{position:absolute;left:92px;right:92px;bottom:120px;z-index:3}
.top{position:absolute;left:92px;top:104px;z-index:3}`;

const STAT = `body.stat{background:
  radial-gradient(1000px 700px at 85% -10%,rgba(201,169,97,.16),transparent 60%),
  radial-gradient(900px 900px at -10% 110%,rgba(40,120,150,.22),transparent 60%),
  linear-gradient(168deg,#0b1320 0%,#0e1a2c 46%,#091019 100%)}
.grid{position:absolute;inset:0;opacity:.05;
  background-image:linear-gradient(#5aa 1px,transparent 1px),linear-gradient(90deg,#5aa 1px,transparent 1px);
  background-size:72px 72px}
.inner{position:absolute;inset:0;padding:150px 92px 120px;display:flex;flex-direction:column;z-index:3}
.years{margin-top:auto;margin-bottom:auto;display:flex;flex-direction:column;gap:24px}
.y{display:flex;align-items:baseline;justify-content:space-between;
  border-bottom:1px solid rgba(120,150,180,.25);padding-bottom:22px}
.y .s{font-size:44px;color:#7d8ea6;letter-spacing:.14em}
.y .c{font-size:78px;font-weight:900;color:#e07a72;letter-spacing:.04em}`;

const GAME = `body.game{background:linear-gradient(168deg,#0b1320 0%,#0e1a2c 46%,#091019 100%)}
.gwrap{position:absolute;inset:0;padding:150px 92px 120px;display:flex;flex-direction:column;z-index:3}
.shotbox{border:1px solid rgba(201,169,97,.42);background:rgba(9,16,25,.6);padding:16px;margin:auto 0}
.shotbox img{width:100%;display:block}
.foot{border-top:1px solid rgba(120,150,180,.25);padding-top:40px;display:flex;
  align-items:baseline;justify-content:space-between}
.url{font-size:60px;font-weight:900;color:#c9a961;letter-spacing:.03em}
.dis{font-size:24px;color:#8ea2b8;text-align:right;max-width:420px;line-height:1.6}`;

function slot(c) {
  const s = c.shot || {};
  return `<div class="slot"><div class="box">
    <h3>把照片放这里 → photos/${esc(c.photo)}</h3>
    <p><b>要什么：</b>${esc(s.want || "")}<br>
       <b>去哪找：</b>${esc(s.where || "")}<br>
       <b>怎么裁：</b>${esc(s.crop || "")}</p>
  </div></div>`;
}

function render(c) {
  const b = cfg.brand;
  if (c.type === "stat") {
    return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>${BASE}${STAT}</style></head>
<body class="stat"><div class="grid"></div><div class="frame"></div><div class="inner">
  <div class="eyebrow">${esc(c.eyebrow)}</div>
  <div class="title" style="font-size:${titleSize(c.title)}px">${br(c.title)}</div>
  <div class="years">${c.years.map((y) =>
    `<div class="y"><div class="s">${esc(y.s)}</div><div class="c">${esc(y.c)}</div></div>`).join("")}</div>
  <div class="sub">${br(c.sub)}</div>
</div></body></html>`;
  }
  if (c.type === "game") {
    return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>${BASE}${GAME}</style></head>
<body class="game"><div class="frame"></div><div class="gwrap">
  <div class="title" style="font-size:${titleSize(c.title)}px">${br(c.title)}</div>
  <div class="sub">${br(c.sub)}</div>
  <div class="shotbox"><img src="photos/${esc(c.photo)}" alt=""></div>
  ${c.footer ? `<div class="foot"><div class="url">${esc(b.url)}</div>
    <div class="dis">浏览器直接玩 · 免费<br>${esc(b.disclaimer)}</div></div>` : ""}
</div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>${BASE}${PHOTO}</style></head>
<body>
  ${has(c.photo) ? `<div class="ph"><img src="photos/${esc(c.photo)}" alt=""></div>` : slot(c)}
  <div class="scrim"></div><div class="frame"></div>
  ${c.eyebrow ? `<div class="top"><div class="eyebrow">${esc(c.eyebrow)}</div></div>` : ""}
  <div class="body">
    <div class="title" style="font-size:${titleSize(c.title)}px">${br(c.title)}</div>
    ${c.sub ? `<div class="sub">${br(c.sub)}</div>` : ""}
  </div>
  ${has(c.photo) && c.credit ? `<div class="credit">${esc(c.credit)}</div>` : ""}
</body></html>`;
}

for (const c of cfg.cards) {
  const f = path.join(DIR, `card-${c.id}.html`);
  fs.writeFileSync(f, render(c));
  console.log(`card-${c.id}.html  ${c.type}${c.photo ? (has(c.photo) ? "  [有图]" : "  [占位槽]") : ""}`);
}
