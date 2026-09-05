/* 赛事数据与像素头像。
   game_data_2022.json 由 data/export_game.py 生成，进仓库；
   头像表由 bundle.mjs 写进 gen/avatars.js（data/avatars.json 不进仓库，没有就是空表；类型声明 gen/avatars.d.ts 进仓库）。 */
import gameData from "../../data/csv/game_data_2022.json";
import { AVATARS_JSON } from "./gen/avatars";

export const DATA: any = gameData;
export const AVATARS: Record<string, string> = JSON.parse(AVATARS_JSON);
