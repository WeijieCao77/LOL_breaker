/* 游戏自己的随机数：带种子的 mulberry32，种子和当前状态都记在存档上。
   · 开局时抽一个 32 位种子写进 S.seed，S.rng 从种子起
   · 每取一次数 S.rng 前进一步，存档带着它——读档回来接着同一条序列，
     同一份存档、同样的操作，结果一样（玩家发存档就能复现 bug）
   · 老存档没有 seed：第一次取数时补上，从那一刻起可复现
   · 界面自己的随机（背景音乐洗牌、统计设备号、无头测试的种子）不走这里 */
import { S } from "./state";

export function rngSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
export function rngInit(seed?: number): void {
  const s = (typeof seed === "number" ? seed : rngSeed()) >>> 0;
  S.seed = s; S.rng = s;
}
export function rnd(): number {
  if (!S) return Math.random();                       // screenCreate 之前不该有人取数；兜底
  if (typeof S.rng !== "number") rngInit(S.seed);     // 老存档 / 没初始化过
  S.rng = (S.rng + 0x6D2B79F5) >>> 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
