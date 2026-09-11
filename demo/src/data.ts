/* 赛事数据与像素头像。
   game_data_2022.json 由 data/export_game.py 生成，进仓库；
   头像表由 bundle.mjs 写进 gen/avatars.js（data/avatars.json 不进仓库，没有就是空表；类型声明 gen/avatars.d.ts 进仓库）。 */
import { AVATARS_JSON } from "./gen/avatars";
import { eraDef } from "./eras";
import { onEra } from "./state";

/* 纪元切换：DATA 指向当前纪元自己的那份快照（不同纪元的数据不共通）。
   默认破晓纪元，和以前完全一致。 */
export let DATA: any = eraDef("s12").data;
onEra(k => { DATA = eraDef(k).data; });
export const AVATARS: Record<string, string> = JSON.parse(AVATARS_JSON);
