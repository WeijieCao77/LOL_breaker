/* 一次性小工具：无头扫种子，找一局「八年打满 + 破局者及以上」的生涯，
   把最终存档按游戏自己的格式导出成 JSON——再在浏览器里导入、出生涯名片图。
   截图要用真打出来的，不编。

   结局判定（main.ts 的表）：
     传奇   = 世界赛三连 + MSI + 26 岁后夺冠
     王朝   = 世界赛三连
     破局者 = MSI≥1 且 世界赛≥1     ← 目标
     两冠   = 世界赛≥2

   用法：npx tsx demo/find-ending.ts [起始种子] [扫多少个] [strong]        */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playOne, A } from "./test.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const from = Number(process.argv[2] || 1);
const n = Number(process.argv[3] || 400);
const strong = process.argv[4] === "strong";

let best: any = null, scanned = 0, ended8 = 0;

for (let seed = from; seed < from + n; seed++) {
  let r: any;
  // encore：S16 收官时选「再打三年」，凑满八年（这是玩家的选择，不是门槛）
  try { r = playOne({ seed, strong, encore: true }); } catch { continue; }
  scanned++;
  const S: any = A.S();
  const c = S.career || {};
  const worlds = c.worlds || 0, msi = c.msi || 0;
  const eightYears = !!r.extended;                 // 五年后又打了三年 = 八年
  if (eightYears) ended8++;

  const tier = (worlds >= 1 && msi >= 1) ? "破局者+" : worlds >= 2 ? "两冠" : worlds === 1 ? "世界冠军" : msi >= 1 ? "半程加冕" : "";
  if (eightYears && tier === "破局者+") {
    console.log(`HIT seed=${seed}  世界赛${worlds} MSI${msi} 联赛${c.leagueTitles || 0}  八年=${eightYears}  五维=${r.attrsAvg}`);
    // 按 save.ts 的格式序列化
    const SKIP: string[] = A.SAVE_SKIP || [];
    const data: any = {};
    Object.keys(S).forEach(k => { if (!SKIP.includes(k)) data[k] = S[k]; });
    const blob = { ver: A.SAVE_VER, at: Date.now(), reason: "promo", gameVer: A.GAME_VER, S: data };
    const out = path.join(HERE, "..", "promo", "xhs", `save-破局者-seed${seed}.json`);
    fs.writeFileSync(out, JSON.stringify(blob), "utf8");
    console.log("存档已导出:", out);
    best = { seed, worlds, msi };
    break;
  }
  if (scanned % 40 === 0) process.stderr.write(`  …扫 ${scanned} 局（八年局 ${ended8}）\n`);
}

if (!best) console.log(`\n扫完 ${scanned} 局，八年局 ${ended8}，没找到八年+破局者。`);
