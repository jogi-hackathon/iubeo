import type {Vector3} from "three";

import {
  ROOM_INNER_X,
  WINDOW_CENTER_Z,
  WINDOW_SILL_HEIGHT,
  WINDOW_SIZE,
} from "../layout";

/** 窓を見続けてクレジットが流れ出すまで(秒) */
export const GAZE_SECONDS = 20;

/** 窓の前とみなす範囲。壁(室内側の面)からの奥行きと、窓の中心からの横幅 */
const ZONE_DEPTH = 1.5;
const ZONE_HALF_WIDTH = 1.2;

const WINDOW_X = -ROOM_INNER_X;
const WINDOW_BOTTOM = WINDOW_SILL_HEIGHT;
const WINDOW_TOP = WINDOW_SILL_HEIGHT + WINDOW_SIZE;
const WINDOW_NORTH = WINDOW_CENTER_Z - WINDOW_SIZE / 2;
const WINDOW_SOUTH = WINDOW_CENTER_Z + WINDOW_SIZE / 2;

/** 足もと(x, z)が窓の前の範囲に入っているか */
export const inWindowZone = (x: number, z: number): boolean =>
  x >= WINDOW_X &&
  x <= WINDOW_X + ZONE_DEPTH &&
  Math.abs(z - WINDOW_CENTER_Z) <= ZONE_HALF_WIDTH;

/**
 * 目(origin)から向き(direction)へ伸ばした視線が、窓の空洞(左の壁の室内側の面)を通るか。
 * 窓の空洞には見えない当たり判定がはまっていてレイキャストでは毎回それに当たるので、面との交点を直に解く
 */
export const gazesAtWindow = (origin: Vector3, direction: Vector3): boolean => {
  if (direction.x >= 0) {
    return false;
  }
  const t = (WINDOW_X - origin.x) / direction.x;
  if (t < 0) {
    return false;
  }
  const y = origin.y + direction.y * t;
  const z = origin.z + direction.z * t;
  return (
    y >= WINDOW_BOTTOM &&
    y <= WINDOW_TOP &&
    z >= WINDOW_NORTH &&
    z <= WINDOW_SOUTH
  );
};

/** 見続けている秒数を進める。条件が一度でも外れたら 0 から数え直す */
export const stepGaze = (
  elapsed: number,
  gazing: boolean,
  dt: number,
): number => (gazing ? elapsed + dt : 0);
