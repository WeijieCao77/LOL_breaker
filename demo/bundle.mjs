#!/usr/bin/env node
/* 构建：demo/src/boot.ts → esbuild 打成一段脚本 → 塞进模板 → 单文件 demo/career.html。
   取代原来的 build.py（Python 按占位符拼接）。产出形态不变：一个自包含的 HTML，
   样式、脚本、数据全内联，server.js / B 站 Toy / build_xhs.py 照旧吃它。
     node demo/bundle.mjs                 # 产出 demo/career.html
     node demo/bundle.mjs --out <path>    # 产到别处（check_build.py 用）
     node demo/bundle.mjs --no-avatars    # 不带像素头像（CI 上本来就没有）
     node demo/bundle.mjs --watch         # 改一处源码就重新产出，配合 node server.js 看效果 */
import { build, context } from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DEMO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(DEMO);
const args = process.argv.slice(2);
const OUT = args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : path.join(DEMO, "career.html");
const NO_AVATARS = args.includes("--no-avatars");
const WATCH = args.includes("--watch");

/* 像素头像：data/avatars.json 不进仓库（肖像素材）。写成一行 JSON 字符串常量，
   check_build.py 比对时按这一行归一（本地有头像、CI 没有，其余逐字节相同）。
   生成的是 gen/avatars.js（不进仓库）；类型在 gen/avatars.d.ts（进仓库），这样 tsc 不用先构建。 */
function writeAvatars() {
  const src = path.join(ROOT, "data", "avatars.json");
  const json = (!NO_AVATARS && fs.existsSync(src)) ? JSON.stringify(JSON.parse(fs.readFileSync(src, "utf8"))) : "{}";
  fs.mkdirSync(path.join(DEMO, "src", "gen"), { recursive: true });
  fs.writeFileSync(path.join(DEMO, "src", "gen", "avatars.js"),
    "/* 由 demo/bundle.mjs 生成，不进仓库；类型见 avatars.d.ts */\nexport const AVATARS_JSON = " + JSON.stringify(json) + ";\n");
}

/* 和原 build.py 一样的拼装：样式、页头、脚本、外层文档结构 */
function assemble(js) {
  const tpl = fs.readFileSync(path.join(DEMO, "career_template.html"), "utf8");
  const css = fs.readFileSync(path.join(DEMO, "theme.css"), "utf8");
  const hdr = fs.readFileSync(path.join(DEMO, "header.html"), "utf8");
  let out = tpl, n;
  [out, n] = replaceOnce(out, /<style>[\s\S]*?<\/style>/, "<style>\n" + css + "\n</style>");
  if (!n) throw new Error("style block not found");
  [out, n] = replaceOnce(out, /  <header class="top">[\s\S]*?<\/header>/, hdr.replace(/\s+$/, ""));
  if (!n) throw new Error("header block not found");
  [out, n] = replaceOnce(out, /<script>\/\* __BUNDLE__ \*\/<\/script>/, "<script>\n" + js + "</script>");
  if (!n) throw new Error("bundle placeholder not found");
  const m = /<title>([\s\S]*?)<\/title>/.exec(out);
  const title = m ? m[1].trim() : "破局者";
  out = out.replace(/<title>[\s\S]*?<\/title>[ \t]*\n?/, "");
  const head = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    + '<meta name="theme-color" content="#0B1220">\n<meta name="color-scheme" content="dark">\n'
    + '<link rel="icon" href="/favicon.ico">\n<title>' + title + "</title>\n";
  if (!out.includes('<div class="wrap">')) throw new Error("wrap div not found");
  out = head + out.replace('<div class="wrap">', '</head>\n<body>\n<div class="wrap">') + "\n</body>\n</html>\n";
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log(`built ${OUT} ${out.length} bytes · script ${(js.length / 1024).toFixed(0)} KB`);
}
function replaceOnce(s, re, rep) { let n = 0; const r = s.replace(re, () => { n++; return rep; }); return [r, n]; }

const OPTS = {
  entryPoints: [path.join(DEMO, "src", "boot.ts")],
  bundle: true, format: "iife", platform: "browser", target: ["es2020"],
  charset: "utf8", minify: false, sourcemap: false, legalComments: "none",
  write: false, logLevel: "warning",
};
writeAvatars();
if (WATCH) {
  const ctx = await context({ ...OPTS, plugins: [{ name: "assemble", setup(b) { b.onEnd(r => { if (!r.errors.length) assemble(r.outputFiles[0].text); }); } }] });
  await ctx.watch();
  console.log("watching demo/src …（另开一个终端 node server.js 看效果）");
} else {
  const r = await build(OPTS);
  assemble(r.outputFiles[0].text);
}
