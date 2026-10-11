import {Quaternion, Vector3} from "three";

export type Cursor = {x: number; y: number};

export const CENTER_CURSOR: Readonly<Cursor> = {x: 0, y: 0};

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

export const moveCursor = (
  cursor: Cursor,
  dx: number,
  dy: number,
  viewport: {width: number; height: number},
): Cursor => {
  cursor.x = clamp(cursor.x + (dx / viewport.width) * 2);
  cursor.y = clamp(cursor.y - (dy / viewport.height) * 2);
  return cursor;
};

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
