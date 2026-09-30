import type {Vector3Tuple} from "three";

import {J} from "./joints";
import {at} from "./pose";

/**
 * 手元のアイテムを、両手首の中点からどれだけずらして置くか(プレイヤーのローカル空間、-Z が前)。
 * 今は 0(両手でアイテムを挟む位置)。ずらすと手から浮いて見えるので、通常は 0 のまま、手首(ホールドの姿勢)を動かして調整する
 */
export const HELD_ITEM_OFFSET: Vector3Tuple = [0, 0, 0];

/** points(関節の座標)から、手元のアイテムを置く位置を out に書く */
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
