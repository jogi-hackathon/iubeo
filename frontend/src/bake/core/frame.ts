import {Vector3} from "three";

import {
  EMBEDDED,
  HIDDEN_AO_EPS,
  HIDDEN_BURIED_RATIO,
  HIDDEN_VOID_MAX_NY,
  HIDDEN_VOID_RATIO,
} from "./params";

const _t = new Vector3();
const _b = new Vector3();
const _n = new Vector3();

export const tangentFrame = (
  nx: number,
  ny: number,
  nz: number,
): {t: Vector3; b: Vector3} => {
  _n.set(nx, ny, nz);
  _t.set(Math.abs(nx) < 0.9 ? 1 : 0, Math.abs(nx) < 0.9 ? 0 : 1, 0)
    .cross(_n)
    .normalize();
  _b.crossVectors(_n, _t);
  return {t: _t, b: _b};
};

export const rotatedFrame = (
  nx: number,
  ny: number,
  nz: number,
  rot: number,
  out: number[] | Float32Array | Float64Array,
): void => {
  const {t, b} = tangentFrame(nx, ny, nz);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  out[0] = c * t.x + s * b.x;
  out[1] = c * t.y + s * b.y;
  out[2] = c * t.z + s * b.z;
  out[3] = -s * t.x + c * b.x;
  out[4] = -s * t.y + c * b.y;
  out[5] = -s * t.z + c * b.z;
};

export interface ProbePoint {
  ao: number;
  backHits: number;
  misses: number;
  ny: number;
}

export const isHiddenPoint = (p: ProbePoint, rays: number): boolean => {
  if (p.ao === EMBEDDED || p.ao / 255 < HIDDEN_AO_EPS) {
    return true;
  }
  if (p.backHits >= rays * HIDDEN_BURIED_RATIO) {
    return true;
  }
  return p.ny <= HIDDEN_VOID_MAX_NY && p.misses >= rays * HIDDEN_VOID_RATIO;
};

export const decideHidden = (
  points: readonly ProbePoint[],
  rays: number,
): boolean => {
  if (points.length === 0) {
    return false;
  }
  return points.every((p) => isHiddenPoint(p, rays));
};
