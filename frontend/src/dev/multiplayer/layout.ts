import {
  directoryItem,
  type LayoutItem,
  type SceneLayout,
} from "../../objects/layout";
import {DESK_HEIGHT} from "../../objects/workspace/desk";
import {START_POSITION} from "../../player/constants";
import type {Vec3} from "../../props/types";

// 実サーバーとつなぐときの配置。サーバーは位置を持たず(state-schema.md §6)、オブジェクトの id と
// プレイヤーの席だけを配るので、フロントがここで置き場所を決める(レイアウトは、サーバーの id に位置をつける表)。
// 値は、これまでサーバー(backend/internal/session/layout.go)が持っていた仮の配置をそのまま移したもの。
// サンドボックス(#14)ができたら、ここを差し替える

/** 席ごとのワークスペース(机)の位置。机は 1.6m x 0.8m なので、2.5m 間隔で 0.9m 空く */
const WORKSPACE_POSITIONS: Record<number, Vec3> = {
  1: [14, 0, -5],
  2: [11.5, 0, -5],
  3: [16.5, 0, -5],
};

/** ライターの置き場は、机の天板の上面の右手前(作業スペース・ペン立て・紙の束と重ならない) */
const LIGHTER_STAND_OFFSET: Vec3 = [0.55, DESK_HEIGHT, 0.2];

/** 席ごとの初期位置の x のずれ(START_POSITION から) */
const SPAWN_OFFSET_X: Record<number, number> = {1: 0, 2: -1.5, 3: 1.5};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** 席 seat の机とライターの項目(項目名は id と同じ) */
const seatItems = (seat: number): [string, LayoutItem][] => {
  const desk = WORKSPACE_POSITIONS[seat] ?? [0, 0, 0];
  const workspace = `workspace-${seat}`;
  const lighter = `lighter_stand-${seat}`;
  return [
    [workspace, {id: workspace, position: desk}],
    [lighter, {id: lighter, position: add(desk, LIGHTER_STAND_OFFSET)}],
  ];
};

/** マルチプレイのレイアウト(サーバーの id に、ここで置き場所をつける) */
export const MULTIPLAYER_LAYOUT: SceneLayout = Object.fromEntries([
  ["directory", directoryItem({id: "directory-1", position: [14, 0, 1]})],
  ...[1, 2, 3].flatMap(seatItems),
]);

/** 席の初期位置。サーバーは最初の transform を受け取るまで位置を持たない */
export const spawnPosition = (seat: number): Vec3 => [
  START_POSITION[0] + (SPAWN_OFFSET_X[seat] ?? 0),
  START_POSITION[1],
  START_POSITION[2],
];
