import { Box3, Line3, Matrix4, Vector3 } from "three";
import type { ExtendedTriangle } from "three-mesh-bvh";
import type { Collider } from "../core/bvh";
import {
  AIR_ACCEL,
  CAPSULE_RADIUS,
  GRAVITY,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  PHYSICS_STEP,
  PLAYER_HEIGHT,
  WALK_SPEED,
} from "./constants";
import type { MoveInput, PlayerState } from "./types";

/** yaw(Y 軸回転)が 0 のとき -Z 方向が前。水平面の速度を out に書く */
export const walkVelocity = (
  input: MoveInput,
  yaw: number,
  out: Vector3,
): Vector3 => {
  const f = Number(input.forward) - Number(input.back);
  const r = Number(input.right) - Number(input.left);
  const len = Math.hypot(f, r);
  if (len === 0) return out.set(0, 0, 0);
  const s = WALK_SPEED / len;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return out.set((-sin * f + cos * r) * s, 0, (-cos * f - sin * r) * s);
};

const wish = new Vector3();

/** 空中: 水平速度は保持し、入力方向への加速だけ許す(その方向の速度が WALK_SPEED に達したら加速しない) */
const airControl = (
  velocity: Vector3,
  input: MoveInput,
  yaw: number,
  h: number,
): void => {
  walkVelocity(input, yaw, wish);
  if (wish.lengthSq() === 0) return;
  wish.divideScalar(WALK_SPEED);
  const room = WALK_SPEED - (velocity.x * wish.x + velocity.z * wish.z);
  if (room <= 0) return;
  const a = Math.min(AIR_ACCEL * h, room);
  velocity.x += wish.x * a;
  velocity.z += wish.z * a;
};

const segment = new Line3();
const localSegment = new Line3();
const localBox = new Box3();
const inverse = new Matrix4();
const triPoint = new Vector3();
const capPoint = new Vector3();
const push = new Vector3();
const normal = new Vector3();
const before = new Vector3();
const delta = new Vector3();
const scaleVec = new Vector3();
const warned = new WeakSet<object>();

/** BVH を失ったコライダー(geometry の差し替えなど)は判定から漏れるため、開発時に 1 回だけ警告する */
const warnMissingBvh = (mesh: Collider["mesh"]): void => {
  if (!import.meta.env.DEV || warned.has(mesh)) return;
  warned.add(mesh);
  console.warn(
    "[physics] boundsTree のないコライダーをスキップしました。geometry が差し替わった可能性があります(BVHCollider の再マウントが必要)",
    mesh,
  );
};

/** カプセルをコライダー群から押し出す。戻り値は position に加えた補正量(delta に書く) */
export const resolveCollisions = (
  position: Vector3,
  colliders: readonly Collider[],
  out: Vector3,
): Vector3 => {
  const r = CAPSULE_RADIUS;
  segment.start.set(position.x, position.y + r, position.z);
  segment.end.set(position.x, position.y + PLAYER_HEIGHT - r, position.z);
  before.copy(segment.start);

  for (const { mesh, enabled } of colliders) {
    if (!enabled) continue;
    const bvh = mesh.geometry.boundsTree;
    if (!bvh) {
      warnMissingBvh(mesh);
      continue;
    }
    mesh.updateWorldMatrix(true, false);
    inverse.copy(mesh.matrixWorld).invert();
    // 一様スケール前提。ローカル空間では半径を 1/scale に換算する
    const scale = scaleVec.setFromMatrixScale(mesh.matrixWorld).x;
    const lr = r / scale;

    localSegment.copy(segment).applyMatrix4(inverse);
    localBox.makeEmpty();
    localBox.expandByPoint(localSegment.start);
    localBox.expandByPoint(localSegment.end);
    localBox.min.addScalar(-lr);
    localBox.max.addScalar(lr);

    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(localBox),
      intersectsTriangle: (tri: ExtendedTriangle) => {
        const dist = tri.closestPointToSegment(
          localSegment,
          triPoint,
          capPoint,
        );
        if (dist >= lr) return;
        push.subVectors(capPoint, triPoint);
        if (dist > 1e-6) push.normalize();
        else push.copy(tri.getNormal(normal));
        const depth = lr - dist;
        localSegment.start.addScaledVector(push, depth);
        localSegment.end.addScaledVector(push, depth);
      },
    });

    segment.copy(localSegment).applyMatrix4(mesh.matrixWorld);
  }

  return out.subVectors(segment.start, before);
};

/** 1 フレーム分の移動・重力・衝突を state に反映する(小ステップに分割して積分) */
export const stepPlayer = (
  state: PlayerState,
  input: MoveInput,
  yaw: number,
  dt: number,
  colliders: readonly Collider[],
): void => {
  const steps = Math.max(1, Math.ceil(dt / PHYSICS_STEP));
  const h = dt / steps;
  const { position, velocity } = state;
  let jump = input.jump;
  let grounded = false;

  for (let i = 0; i < steps; i++) {
    const wasGround = i === 0 ? state.onGround : grounded;
    const vy = velocity.y;
    if (wasGround) walkVelocity(input, yaw, velocity).setY(vy);
    else airControl(velocity, input, yaw, h);
    if (jump && wasGround) {
      velocity.y = JUMP_SPEED;
      jump = false;
    }
    velocity.y = Math.max(velocity.y - GRAVITY * h, -MAX_FALL_SPEED);
    position.addScaledVector(velocity, h);

    grounded = false;
    for (let iter = 0; iter < 2; iter++) {
      resolveCollisions(position, colliders, delta);
      if (delta.lengthSq() < 1e-12) break;
      position.add(delta);
      if (delta.y > Math.abs(h * velocity.y) * 0.25) grounded = true;
      if (delta.y > 1e-6 && velocity.y < 0) velocity.y = 0;
      else if (delta.y < -1e-6 && velocity.y > 0) velocity.y = 0;
    }
  }
  state.onGround = grounded;
};
