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
