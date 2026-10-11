import type {Vector3Tuple} from "three";

import {J} from "./joints";
import {at} from "./pose";

export const HELD_ITEM_OFFSET: Vector3Tuple = [0, 0, 0];

export const writeHeldItemPosition = <
  T extends {set: (x: number, y: number, z: number) => unknown},
>(
  out: T,
  points: ArrayLike<number>,
): T => {
  const mid = (k: number) =>
    (at(points, J.lWrist * 3 + k) + at(points, J.rWrist * 3 + k)) / 2 +
    (HELD_ITEM_OFFSET[k] ?? 0);
  out.set(mid(0), mid(1), mid(2));
  return out;
};
