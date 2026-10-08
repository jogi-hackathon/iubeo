import {DESK_HEIGHT} from "../../objects/workspace/desk";
import {START_POSITION} from "../../player/constants";
import type {Vec3} from "../../props/types";

// 実サーバーとつなぐときの配置。サーバーは位置を持たず(state-schema.md §6)、オブジェクトの id と
// プレイヤーの席だけを配るので、フロントがここで置き場所を決める。
// 値は、これまでサーバー(backend/internal/session/layout.go)が持っていた仮の配置をそのまま移したもの。
// サンドボックス(#14)ができたら、ここを差し替える

const DIRECTORY_POSITION: Vec3 = [14, 0, 1];

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

const ORIGIN: Vec3 = [0, 0, 0];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** サーバーとの約束の id(directory-1 / workspace-{席} / lighter_stand-{席})から位置を決める。知らない id は原点 */
export const objectPosition = (id: string): Vec3 => {
  if (id === "directory-1") {
    return DIRECTORY_POSITION;
  }
  const m = /^(workspace|lighter_stand)-(\d+)$/.exec(id);
  const desk = m ? WORKSPACE_POSITIONS[Number(m[2])] : undefined;
  if (!m || !desk) {
    return ORIGIN;
  }
  return m[1] === "workspace" ? desk : add(desk, LIGHTER_STAND_OFFSET);
};

/** 席の初期位置。サーバーは最初の transform を受け取るまで位置を持たない */
export const spawnPosition = (seat: number): Vec3 => [
  START_POSITION[0] + (SPAWN_OFFSET_X[seat] ?? 0),
  START_POSITION[1],
  START_POSITION[2],
];
