import {Vector3} from "three";

import type {Collider} from "../core/bvh";
import {CAPSULE_RADIUS} from "./constants";
import {resolveCollisions} from "./physics";

// 紙は衝突の登録がないので、CPU はこの円の外へ押し出す。sandbox の紙の山(large、シード directory-1、中心は原点)で実測 3.98m
export const PAPER_RING_RADIUS = 4;

const pushOutOfPaperRing = (position: Vector3): void => {
  const lim = PAPER_RING_RADIUS + CAPSULE_RADIUS;
  const r = Math.hypot(position.x, position.z);
  if (r >= lim) {
    return;
  }
  if (r < 1e-9) {
    position.z = lim;
    return;
  }
  const k = lim / r;
  position.x *= k;
  position.z *= k;
};

const delta = new Vector3();

export const keepCpuClear = (
  position: Vector3,
  colliders: readonly Collider[],
): void => {
  resolveCollisions(position, colliders, delta);
  position.add(delta);
  pushOutOfPaperRing(position);
};
