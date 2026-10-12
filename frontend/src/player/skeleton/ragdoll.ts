import {Box3, Vector3} from "three";

import type {Collider} from "../../core/bvh";
import {GRAVITY} from "../constants";
import {
  prepareSphereTargets,
  resolveSphere,
  type SphereTarget,
  sweepSphere,
} from "../physics";
import {BONES, J, JOINT_COUNT, NECK} from "./joints";
import {at} from "./pose";

/**
 * ラグドールの計算の刻み。プレイヤーの移動(PHYSICS_STEP)より粗くして軽くする。
 * 描くときは writeRagdollPose で直前の 2 ステップの間を補間する
 */
export const RAGDOLL_STEP = 1 / 60;
export const RAGDOLL_ITERATIONS = 8;
/**
 * 衝突は反復の何回に 1 回解くか(最後の反復では必ず解く)。
 * 衝突がラグドールの計算のほとんどを占めるので、骨の長さを保つ反復より少なくする
 */
export const RAGDOLL_COLLIDE_EVERY = 4;
export const RAGDOLL_DAMPING = 0.995;
export const RAGDOLL_FRICTION = 0.6;
export const RAGDOLL_JOINT_RADIUS = 0.06;
export const RAGDOLL_HEAD_RADIUS = 0.11;
export const RAGDOLL_HEAD_KNOCKBACK = 12;
export const RAGDOLL_HEAD_SIDEWAYS = 6;
export const RAGDOLL_SHOULDER_PUSH = 0.3;
export const RAGDOLL_SLEEP_SPEED = 0.05;
export const RAGDOLL_SLEEP_SECONDS = 0.5;
export const RAGDOLL_HIP_STIFFNESS = 0.05;
export const RAGDOLL_NECK_STIFFNESS = 0.05;
export const RAGDOLL_NEAR_MARGIN = 1;
export const RAGDOLL_LIMB_GAP = 0.14;
export const RAGDOLL_TORSO_RADIUS = 0.14;
export const RAGDOLL_MAX_SEPARATION = 0.02;

type Link = readonly [number, number, number?];

const LINKS: readonly Link[] = [
  ...BONES.filter(([a, b]) => a !== NECK && b !== NECK),
  [J.head, J.lShoulder],
  [J.head, J.rShoulder],
  [J.head, J.lHip, RAGDOLL_NECK_STIFFNESS],
  [J.head, J.rHip, RAGDOLL_NECK_STIFFNESS],
  [J.lShoulder, J.rHip],
  [J.rShoulder, J.lHip],
  [J.lHip, J.lAnkle],
  [J.rHip, J.rAnkle],
  [J.lShoulder, J.lKnee, RAGDOLL_HIP_STIFFNESS],
  [J.rShoulder, J.rKnee, RAGDOLL_HIP_STIFFNESS],
];

const SEPARATED: readonly (readonly [number, number])[] = [
  [J.lKnee, J.rKnee],
  [J.lAnkle, J.rAnkle],
  [J.lToe, J.rToe],
];

const ARM_POINTS = [J.lElbow, J.rElbow, J.lWrist, J.rWrist] as const;

const BONE_SAMPLES: readonly (readonly [number, number, number])[] = [
  ...(
    [
      [J.lHip, J.lKnee],
      [J.rHip, J.rKnee],
      [J.lKnee, J.lAnkle],
      [J.rKnee, J.rAnkle],
      [J.lShoulder, J.lHip],
      [J.rShoulder, J.rHip],
    ] as const
  ).flatMap(([a, b]) => [[a, b, 1 / 3] as const, [a, b, 2 / 3] as const]),
  [J.lShoulder, J.lElbow, 0.5],
  [J.rShoulder, J.rElbow, 0.5],
  [J.lElbow, J.lWrist, 0.5],
  [J.rElbow, J.rWrist, 0.5],
];

export interface Ragdoll {
  active: boolean;
  sleeping: boolean;
  still: number;
  carry: number;
  pos: Float32Array;
  /** 最後のステップを進める前の pos(描くときの補間用) */
  last: Float32Array;
  prev: Float32Array;
  contact: Float32Array;
  rest: Float32Array;
}

export const createRagdoll = (): Ragdoll => ({
  active: false,
  sleeping: false,
  still: 0,
  carry: 0,
  pos: new Float32Array(JOINT_COUNT * 3),
  last: new Float32Array(JOINT_COUNT * 3),
  prev: new Float32Array(JOINT_COUNT * 3),
  contact: new Float32Array(JOINT_COUNT * 3),
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
    const push =
      i === J.head
        ? 1
        : i === J.lShoulder || i === J.rShoulder
          ? RAGDOLL_SHOULDER_PUSH
          : 0;
    r.prev[i * 3] = wx - (velocity.x + pushX * push) * RAGDOLL_STEP;
    r.prev[i * 3 + 1] = wy - velocity.y * RAGDOLL_STEP;
    r.prev[i * 3 + 2] = wz - (velocity.z + pushZ * push) * RAGDOLL_STEP;
  }
  for (const [k, [a, b]] of LINKS.entries()) {
    r.rest[k] = distance(r.pos, a, b);
  }
  r.last.set(r.pos);
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
const other = new Vector3();
const pushOut = new Vector3();
const near = new Box3();

const addContact = (r: Ragdoll, i: number, push: Vector3, w: number) => {
  for (let c = 0; c < 3; c++) {
    const k = i * 3 + c;
    const d = push.getComponent(c) * w;
    r.pos[k] = at(r.pos, k) + d;
    r.contact[k] = at(r.contact, k) + d;
  }
};

const collide = (r: Ragdoll, targets: readonly SphereTarget[]): void => {
  for (const [a, b, t] of BONE_SAMPLES) {
    joint.fromArray(r.pos, a * 3).lerp(other.fromArray(r.pos, b * 3), t);
    resolveSphere(joint, RAGDOLL_JOINT_RADIUS, targets, pushOut);
    if (pushOut.lengthSq() < 1e-12) {
      continue;
    }
    const scale = 1 / ((1 - t) ** 2 + t ** 2);
    addContact(r, a, pushOut, (1 - t) * scale);
    addContact(r, b, pushOut, t * scale);
  }
  for (let i = 0; i < JOINT_COUNT; i++) {
    joint.fromArray(r.pos, i * 3);
    const radius = i === J.head ? RAGDOLL_HEAD_RADIUS : RAGDOLL_JOINT_RADIUS;
    resolveSphere(joint, radius, targets, pushOut);
    if (pushOut.lengthSq() >= 1e-12) {
      addContact(r, i, pushOut, 1);
    }
  }
};

const shift = (p: Float32Array, i: number, v: Vector3, w: number): void => {
  for (let c = 0; c < 3; c++) {
    p[i * 3 + c] = at(p, i * 3 + c) + v.getComponent(c) * w;
  }
};

const right = new Vector3();

const bodyRight = (p: Float32Array, out: Vector3): Vector3 =>
  out
    .fromArray(p, J.rShoulder * 3)
    .sub(other.fromArray(p, J.lShoulder * 3))
    .add(other.fromArray(p, J.rHip * 3))
    .sub(other.fromArray(p, J.lHip * 3));

const separateLegs = (p: Float32Array): void => {
  if (bodyRight(p, right).lengthSq() < 1e-9) {
    return;
  }
  right.normalize();
  for (const [l, r] of SEPARATED) {
    const gap = other
      .fromArray(p, r * 3)
      .sub(joint.fromArray(p, l * 3))
      .dot(right);
    if (gap >= RAGDOLL_LIMB_GAP) {
      continue;
    }
    const half = Math.min(RAGDOLL_MAX_SEPARATION, (RAGDOLL_LIMB_GAP - gap) / 2);
    shift(p, l, right, -half);
    shift(p, r, right, half);
  }
};

const torsoTop = new Vector3();
const torsoBottom = new Vector3();
const torsoAxis = new Vector3();
const closest = new Vector3();

const keepArmsOutOfTorso = (p: Float32Array): void => {
  torsoTop
    .fromArray(p, J.lShoulder * 3)
    .add(other.fromArray(p, J.rShoulder * 3))
    .multiplyScalar(0.5);
  torsoBottom
    .fromArray(p, J.lHip * 3)
    .add(other.fromArray(p, J.rHip * 3))
    .multiplyScalar(0.5);
  torsoAxis.subVectors(torsoTop, torsoBottom);
  const lengthSq = torsoAxis.lengthSq();
  if (lengthSq < 1e-9) {
    return;
  }
  for (const i of ARM_POINTS) {
    joint.fromArray(p, i * 3);
    const t = Math.min(
      1,
      Math.max(
        0,
        other.subVectors(joint, torsoBottom).dot(torsoAxis) / lengthSq,
      ),
    );
    closest.copy(torsoBottom).addScaledVector(torsoAxis, t);
    other.subVectors(joint, closest);
    const d = other.length();
    if (d >= RAGDOLL_TORSO_RADIUS || d < 1e-6) {
      continue;
    }
    shift(p, i, other, (RAGDOLL_TORSO_RADIUS - d) / d);
  }
};

const start = new Vector3();

const stopTunneling = (r: Ragdoll, targets: readonly SphereTarget[]): void => {
  for (let i = 0; i < JOINT_COUNT; i++) {
    start.fromArray(r.prev, i * 3);
    joint.fromArray(r.pos, i * 3);
    const radius = i === J.head ? RAGDOLL_HEAD_RADIUS : RAGDOLL_JOINT_RADIUS;
    if (!sweepSphere(start, joint, radius, targets)) {
      continue;
    }
    pushOut
      .fromArray(r.pos, i * 3)
      .negate()
      .add(joint);
    addContact(r, i, pushOut, 1);
  }
};

const normal = new Vector3();
const motion = new Vector3();
const tangent = new Vector3();

const applyFriction = (r: Ragdoll): void => {
  for (let i = 0; i < JOINT_COUNT; i++) {
    normal.fromArray(r.contact, i * 3);
    const depth = normal.length();
    if (depth < 1e-9) {
      continue;
    }
    normal.divideScalar(depth);
    joint.fromArray(r.pos, i * 3);
    motion
      .fromArray(r.prev, i * 3)
      .sub(joint)
      .negate();
    tangent.copy(motion).addScaledVector(normal, -motion.dot(normal));
    const slide = tangent.length();
    const kept = Math.max(0, slide - RAGDOLL_FRICTION * depth);
    motion.addScaledVector(tangent, slide > 0 ? kept / slide - 1 : 0);
    joint.sub(motion).toArray(r.prev, i * 3);
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
  r.contact.fill(0);
  for (let iter = 0; iter < RAGDOLL_ITERATIONS; iter++) {
    satisfyLinks(r);
    separateLegs(r.pos);
    keepArmsOutOfTorso(r.pos);
    if ((RAGDOLL_ITERATIONS - 1 - iter) % RAGDOLL_COLLIDE_EVERY === 0) {
      collide(r, targets);
    }
  }
  stopTunneling(r, targets);
  applyFriction(r);
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
  while (r.carry >= RAGDOLL_STEP) {
    r.carry -= RAGDOLL_STEP;
    r.last.set(r.pos);
    const speed = substep(r, RAGDOLL_STEP, targets);
    r.still = speed < RAGDOLL_SLEEP_SPEED ? r.still + RAGDOLL_STEP : 0;
  }
  if (r.still >= RAGDOLL_SLEEP_SECONDS) {
    r.sleeping = true;
  }
};

/**
 * 描く姿勢を out に書く。計算の刻みは画面のフレームより粗いので、最後のステップの前後を余り時間(carry)で補間する
 * (1 ステップ遅れて描く代わりに、フレームごとのステップ数のばらつきでカクつかない)
 */
export const writeRagdollPose = (r: Ragdoll, out: Float32Array): void => {
  const t = Math.min(1, r.carry / RAGDOLL_STEP);
  for (let i = 0; i < r.pos.length; i++) {
    out[i] = at(r.last, i) + (at(r.pos, i) - at(r.last, i)) * t;
  }
};
