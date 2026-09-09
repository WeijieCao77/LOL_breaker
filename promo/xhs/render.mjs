/* 把 card-*.html 渲染成 1080×1440 的 PNG，输出到 out/
   用法：node render.mjs        （需要 playwright，没有就装：npm i -D playwright） */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, "out");
fs.mkdirSync(OUT, { recursive: true });

let chromium;
for (const id of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(id)); break; } catch {}
  try { ({ chromium } = createRequire(import.meta.url)(id)); break; } catch {}
}
if (!chromium) { console.error("没找到 playwright，先 npm i -D playwright && npx playwright install chromium"); process.exit(1); }

const files = fs.readdirSync(DIR).filter((f) => /^card-\d+\.html$/.test(f)).sort();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 2 });
for (const f of files) {
  await p.goto("file://" + path.join(DIR, f), { waitUntil: "networkidle" });
  await p.waitForTimeout(150);
  const out = path.join(OUT, f.replace(".html", ".png"));
  await p.screenshot({ path: out });
  console.log("→", path.relative(DIR, out));
}
await b.close();
