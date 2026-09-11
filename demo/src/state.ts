/* 全局状态 S：整局的一切都在这一个对象上，存档就是它的 JSON。
   ES 模块的 import 绑定是只读的，所以要换整个对象时（开局、读档）走 setS()。
   GameState 先只列最常用的字段，其余用索引签名放行；哪个模块开了类型检查就顺手补哪些。 */
export type Step = "create" | "pre" | "offer" | "season" | "prep" | "match" | "offseason" | "end";
export type Dim = "操作" | "运营" | "心态" | "指挥" | "体质";

export interface GameState {
  step: Step;
  name: string;
  pos: string | null;
  origin: string;
  ageIdx: number | null;
  age?: number;
  si?: number;                       // 赛季下标 0..4（S12–S16）
  week?: number;
  attrs?: Record<Dim, number>;
  talent?: Record<Dim, number>;
  fatigue?: number;
  ap?: number;
  money?: number;
  fans?: number;
  heat?: number;
  team?: string | null;
  career?: any;
  contract?: any;
  pre?: any;
  world?: any;
  standings?: any;
  seed?: number;                     // 随机数种子：开局写进存档，同一存档可复现
  rng?: number;                      // 随机数当前状态（每次取数后更新）
  statFlags?: Record<string, 1>;
  [k: string]: any;
}

/** screenCreate() 之前是 null；之后永远是一个完整对象 */
export let S: GameState = null as unknown as GameState;
export function setS(v: GameState): void { S = v; }

/* ---------- 纪元切换的挂钩（2026-09-08）----------
   纪元 = 一个自带名单、赛制、标尺的世界（见 eras.ts）。作者定的两条：
   **不同纪元的数据不共通，每个纪元用自己的标尺** —— 所以不需要跨年代校准，
   每个纪元内部自洽就行。

   实现上不去改那 96 处 `SEASONS[...]` 的读取点：各模块把自己那几张表从 const 改成 let，
   在这里登记一个「换纪元时重新赋值」的回调。state.ts 不 import 任何模块，
   所以谁都能往这里登记而不产生循环引用。applyEra 在开局和读档时各调一次。 */
const _eraHooks: Array<(k: string) => void> = [];
export function onEra(fn: (k: string) => void): void { _eraHooks.push(fn); }
export function applyEra(k: string): void { _eraHooks.forEach(fn => fn(k || "s12")); }
