import {Quaternion, Vector3} from "three";

import type {Cursor} from "../../core/input/virtualCursor";

const _local = new Vector3();

export const cursorRay = (
  cursor: Cursor,
  position: Vector3,
  quaternion: Quaternion,
  fovDegrees: number,
  aspect: number,
): {origin: Vector3; direction: Vector3} => {
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  _local.set(cursor.x * half * aspect, cursor.y * half, -1);
  return {
    origin: position.clone(),
    direction: _local.clone().applyQuaternion(quaternion).normalize(),
  };
};
