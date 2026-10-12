import {BoxGeometry, Mesh, MeshBasicMaterial, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {type Collider} from "../../../core/bvh";
import {CLIPS} from "../clips";
import {J, JOINT_COUNT} from "../joints";
import {at, frameOf} from "../pose";
import {
  createRagdoll,
  RAGDOLL_JOINT_RADIUS,
  startRagdoll,
  stepRagdoll,
} from "../ragdoll";

const floor = (): Collider => {
  const geometry = new BoxGeometry(20, 1, 20);
  geometry.computeBoundsTree();
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.position.set(0, -0.5, 0);
  return {mesh, enabled: true};
};

const idle = frameOf(CLIPS.idle, 0);

const dist = (p: ArrayLike<number>, a: number, b: number) =>
  Math.hypot(
    at(p, b * 3) - at(p, a * 3),
    at(p, b * 3 + 1) - at(p, a * 3 + 1),
    at(p, b * 3 + 2) - at(p, a * 3 + 2),
  );

const fall = (seconds: number, random = () => 0.5) => {
  const r = createRagdoll();
  startRagdoll(r, idle, new Vector3(0, 0.02, 0), 0, new Vector3(), random);
  const colliders = [floor()];
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepRagdoll(r, 1 / 60, colliders);
  }
  return r;
};

describe("ragdoll", () => {
  it("始めた瞬間は yaw と位置を反映したワールド座標のポーズになる", () => {
    const r = createRagdoll();
    startRagdoll(r, idle, new Vector3(1, 2, 3), Math.PI / 2, new Vector3());
    const head = J.head * 3;
    expect(at(r.pos, head)).toBeCloseTo(1 + at(idle, head + 2));
    expect(at(r.pos, head + 1)).toBeCloseTo(2 + at(idle, head + 1));
    const ls = J.lShoulder * 3;
    expect(at(r.pos, ls + 2)).toBeCloseTo(3 - at(idle, ls));
  });

  it("倒れても骨の長さがほぼ保たれる", () => {
    const r = fall(3);
    for (const [a, b] of [
      [J.lHip, J.lKnee],
      [J.lShoulder, J.lElbow],
      [J.rKnee, J.rAnkle],
    ] as const) {
      expect(dist(r.pos, a, b)).toBeCloseTo(dist(idle, a, b), 1);
    }
  });

  it("床に倒れ込み、床を突き抜けない", () => {
    const r = fall(3);
    for (let i = 0; i < JOINT_COUNT; i++) {
      expect(at(r.pos, i * 3 + 1)).toBeGreaterThan(RAGDOLL_JOINT_RADIUS * 0.5);
    }
    expect(at(r.pos, J.head * 3 + 1)).toBeLessThan(0.5);
  });

  it("頭を押されて後ろ(+Z、yaw=0)へ倒れる", () => {
    const r = fall(3);
    const hips = (at(r.pos, J.lHip * 3 + 2) + at(r.pos, J.rHip * 3 + 2)) / 2;
    expect(at(r.pos, J.head * 3 + 2)).toBeGreaterThan(hips + 0.3);
  });

  it("乱数で倒れる向きが左右にばらつく", () => {
    const left = at(fall(3, () => 0).pos, J.head * 3);
    const right = at(fall(3, () => 1).pos, J.head * 3);
    expect(left).toBeLessThan(-0.2);
    expect(right).toBeGreaterThan(0.2);
  });

  it("止まったら眠り、以後は動かない", () => {
    const r = fall(6);
    expect(r.sleeping).toBe(true);
    const before = r.pos.slice();
    stepRagdoll(r, 1 / 60, [floor()]);
    expect(Array.from(r.pos)).toEqual(Array.from(before));
  });
});
