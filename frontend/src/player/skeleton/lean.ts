import {J, NECK} from "./joints";
import {at} from "./pose";

export const TORSO_PITCH_RATIO = 0.4;
export const MAX_LEAN_FORWARD = 0.6;
export const MAX_LEAN_BACK = 0.3;
export const MAX_NECK_BEND = 0.8;

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const lean = (
  points: Float32Array,
  i: number,
  pivotY: number,
  pivotZ: number,
  angle: number,
): void => {
  const y = at(points, i * 3 + 1) - pivotY;
  const z = at(points, i * 3 + 2) - pivotZ;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  points[i * 3 + 1] = pivotY + y * cos + z * sin;
  points[i * 3 + 2] = pivotZ - y * sin + z * cos;
};

const UPPER_BODY = [
  J.lShoulder,
  J.rShoulder,
  J.lElbow,
  J.rElbow,
  J.lWrist,
  J.rWrist,
  NECK,
] as const;

export const applyLean = (points: Float32Array, pitch: number): void => {
  const pivotY = (at(points, J.lHip * 3 + 1) + at(points, J.rHip * 3 + 1)) / 2;
  const pivotZ = (at(points, J.lHip * 3 + 2) + at(points, J.rHip * 3 + 2)) / 2;

  const torso = clamp(
    -pitch * TORSO_PITCH_RATIO,
    -MAX_LEAN_BACK,
    MAX_LEAN_FORWARD,
  );
  for (const i of [...UPPER_BODY, J.head]) {
    lean(points, i, pivotY, pivotZ, torso);
  }

  const neck = bend(-pitch - torso);
  lean(
    points,
    J.head,
    at(points, NECK * 3 + 1),
    at(points, NECK * 3 + 2),
    neck,
  );
};

const bend = (angle: number): number =>
  clamp(angle, -MAX_NECK_BEND, MAX_NECK_BEND);
