import {Box3, Vector3} from "three";

import type {Collider} from "../../core/bvh";
import {GRAVITY, PHYSICS_STEP} from "../constants";
import {
  prepareSphereTargets,
  resolveSphere,
  type SphereTarget,
} from "../physics";
import {BONES, J, JOINT_COUNT, NECK} from "./joints";
import {at} from "./pose";

export const RAGDOLL_ITERATIONS = 8;
export const RAGDOLL_DAMPING = 0.995;
export const RAGDOLL_FRICTION = 0.4;
export const RAGDOLL_JOINT_RADIUS = 0.06;
export const RAGDOLL_HEAD_RADIUS = 0.11;
export const RAGDOLL_HEAD_KNOCKBACK = 3;
export const RAGDOLL_HEAD_SIDEWAYS = 1.5;
export const RAGDOLL_SLEEP_SPEED = 0.05;
export const RAGDOLL_SLEEP_SECONDS = 0.5;
export const RAGDOLL_HIP_STIFFNESS = 0.05;
export const RAGDOLL_NEAR_MARGIN = 1;

type Link = readonly [number, number, number?];

const LINKS: readonly Link[] = [
  ...BONES.filter(([a, b]) => a !== NECK && b !== NECK),
  [J.head, J.lShoulder],
  [J.head, J.rShoulder],
  [J.head, J.lHip],
  [J.head, J.rHip],
  [J.lShoulder, J.rHip],
  [J.rShoulder, J.lHip],
  [J.lHip, J.lAnkle],
  [J.rHip, J.rAnkle],
  [J.lShoulder, J.lKnee, RAGDOLL_HIP_STIFFNESS],
  [J.rShoulder, J.rKnee, RAGDOLL_HIP_STIFFNESS],
];

export interface Ragdoll {
  active: boolean;
  sleeping: boolean;
  still: number;
  carry: number;
  pos: Float32Array;
  prev: Float32Array;
  rest: Float32Array;
}

export const createRagdoll = (): Ragdoll => ({
  active: false,
  sleeping: false,
  still: 0,
  carry: 0,
  pos: new Float32Array(JOINT_COUNT * 3),
  prev: new Float32Array(JOINT_COUNT * 3),
  rest: new Float32Array(LINKS.length),
});

const distance = (p: Float32Array, a: number, b: number): number =>
  Math.hypot(
    at(p, b * 3) - at(p, a * 3),
    at(p, b * 3 + 1) - at(p, a * 3 + 1),
    at(p, b * 3 + 2) - at(p, a * 3 + 2),
  );

export const startRagdoll = (
  r: Ragdoll,
  localPoints: ArrayLike<number>,
  position: Vector3,
  yaw: number,
  velocity: Vector3,
  random: () => number = Math.random,
): void => {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const side = (random() * 2 - 1) * RAGDOLL_HEAD_SIDEWAYS;
  const pushX = sin * RAGDOLL_HEAD_KNOCKBACK + cos * side;
  const pushZ = cos * RAGDOLL_HEAD_KNOCKBACK - sin * side;
  for (let i = 0; i < JOINT_COUNT; i++) {
    const x = at(localPoints, i * 3);
    const y = at(localPoints, i * 3 + 1);
    const z = at(localPoints, i * 3 + 2);
    const wx = position.x + x * cos + z * sin;
    const wy = position.y + y;
    const wz = position.z - x * sin + z * cos;
    r.pos[i * 3] = wx;
    r.pos[i * 3 + 1] = wy;
    r.pos[i * 3 + 2] = wz;
    const push = i === J.head ? 1 : 0;
    r.prev[i * 3] = wx - (velocity.x + pushX * push) * PHYSICS_STEP;
    r.prev[i * 3 + 1] = wy - velocity.y * PHYSICS_STEP;
    r.prev[i * 3 + 2] = wz - (velocity.z + pushZ * push) * PHYSICS_STEP;
  }
  for (const [k, [a, b]] of LINKS.entries()) {
    r.rest[k] = distance(r.pos, a, b);
  }
  r.active = true;
  r.sleeping = false;
  r.still = 0;
  r.carry = 0;
};

const satisfyLinks = (r: Ragdoll): void => {
  const p = r.pos;
  for (const [k, [a, b, stiffness = 1]] of LINKS.entries()) {
    const d = distance(p, a, b);
    if (d < 1e-6) {
      continue;
    }
    const diff = ((d - at(r.rest, k)) / d / 2) * stiffness;
    for (let c = 0; c < 3; c++) {
      const delta = (at(p, b * 3 + c) - at(p, a * 3 + c)) * diff;
      p[a * 3 + c] = at(p, a * 3 + c) + delta;
      p[b * 3 + c] = at(p, b * 3 + c) - delta;
    }
  }
};

const joint = new Vector3();
const pushOut = new Vector3();
const near = new Box3();

const collide = (r: Ragdoll, targets: readonly SphereTarget[]): void => {
  for (let i = 0; i < JOINT_COUNT; i++) {
    joint.fromArray(r.pos, i * 3);
    const radius = i === J.head ? RAGDOLL_HEAD_RADIUS : RAGDOLL_JOINT_RADIUS;
    resolveSphere(joint, radius, targets, pushOut);
    if (pushOut.lengthSq() < 1e-12) {
      continue;
    }
    joint.add(pushOut).toArray(r.pos, i * 3);
    for (let c = 0; c < 3; c++) {
      const prev = at(r.prev, i * 3 + c);
      r.prev[i * 3 + c] =
        prev + (at(r.pos, i * 3 + c) - prev) * RAGDOLL_FRICTION;
    }
  }
};

const substep = (
  r: Ragdoll,
  h: number,
  targets: readonly SphereTarget[],
): number => {
  const {pos, prev} = r;
  let maxMove = 0;
  for (let i = 0; i < pos.length; i++) {
    const current = at(pos, i);
    const gravity = i % 3 === 1 ? -GRAVITY * h * h : 0;
    pos[i] = current + (current - at(prev, i)) * RAGDOLL_DAMPING + gravity;
    prev[i] = current;
  }
  for (let iter = 0; iter < RAGDOLL_ITERATIONS; iter++) {
    satisfyLinks(r);
    collide(r, targets);
  }
  for (let i = 0; i < pos.length; i++) {
    maxMove = Math.max(maxMove, Math.abs(at(pos, i) - at(prev, i)));
  }
  return maxMove / h;
};

export const stepRagdoll = (
  r: Ragdoll,
  dt: number,
  colliders: readonly Collider[],
): void => {
  if (!r.active || r.sleeping || dt <= 0) {
    return;
  }
  near.makeEmpty();
  for (let i = 0; i < JOINT_COUNT; i++) {
    near.expandByPoint(joint.fromArray(r.pos, i * 3));
  }
  near.expandByScalar(RAGDOLL_NEAR_MARGIN);
  const targets = prepareSphereTargets(colliders, near);
  r.carry += dt;
  while (r.carry >= PHYSICS_STEP) {
    r.carry -= PHYSICS_STEP;
    const speed = substep(r, PHYSICS_STEP, targets);
    r.still = speed < RAGDOLL_SLEEP_SPEED ? r.still + PHYSICS_STEP : 0;
  }
  if (r.still >= RAGDOLL_SLEEP_SECONDS) {
    r.sleeping = true;
  }
};
