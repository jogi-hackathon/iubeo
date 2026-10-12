import {Matrix4, Quaternion, Vector3} from "three";

import {SLIP_LENGTH} from "./strip";
import {STAGE_MS, stageStart} from "./terminal";

export const SLIP_ZOOM_MS = 350;
export const SLIP_ZOOM_FILL = 0.8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => t * t * (3 - 2 * t);

export const slipZoomBlend = (elapsedMs: number): number => {
  const start = stageStart("look");
  const end = start + STAGE_MS.look;
  const zoomIn = clamp01((elapsedMs - start) / SLIP_ZOOM_MS);
  const zoomOut = clamp01((end - elapsedMs) / SLIP_ZOOM_MS);
  return easeInOut(Math.min(zoomIn, zoomOut));
};

export const fitDistance = (height: number, fov: number, fill: number) =>
  height / 2 / fill / Math.tan((fov * Math.PI) / 360);

export const heldSlipWorld = new Matrix4();

const scale = new Vector3();
const center = new Vector3();
const forward = new Vector3();

export const slipZoomPose = (
  slipWorld: Matrix4,
  fov: number,
  position: Vector3,
  quaternion: Quaternion,
): void => {
  slipWorld.decompose(position, quaternion, scale);
  const height = SLIP_LENGTH * scale.y;
  center.set(0, SLIP_LENGTH / 2, 0).applyMatrix4(slipWorld);
  forward.set(0, 0, 1).applyQuaternion(quaternion);
  position
    .copy(center)
    .addScaledVector(forward, fitDistance(height, fov, SLIP_ZOOM_FILL));
};
