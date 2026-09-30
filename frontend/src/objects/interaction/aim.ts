/** インタラクトできる距離(m)。目の位置から測る */
export const INTERACT_DISTANCE = 2.5;

/** 視線の最初の当たり。objectId は、当たった物が属するオブジェクト(壁などコライダーだけの物は null) */
export type AimHit = {objectId: string | null; distance: number};

type AimOptions = {
  maxDistance?: number;
  /** 狙える物か(手元にあり、使用可能)。触れない物にはハイライトも付けない */
  isTargetable: (objectId: string) => boolean;
};

/**
 * 視線の最初の当たりから、狙っているオブジェクトの id を決める。
 * 最初の当たりがオブジェクトでなければ(壁などに遮られていれば)狙わない
 */
export const resolveAim = (
  firstHit: AimHit | null,
  {maxDistance = INTERACT_DISTANCE, isTargetable}: AimOptions,
): string | null => {
  if (!firstHit || firstHit.objectId === null) {
    return null;
  }
  if (firstHit.distance > maxDistance) {
    return null;
  }
  return isTargetable(firstHit.objectId) ? firstHit.objectId : null;
};
