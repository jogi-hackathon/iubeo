import {BoxGeometry, Mesh, MeshBasicMaterial, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {type Collider} from "../../../core/bvh";
import {CLIPS} from "../clips";
import {J, JOINT_COUNT} from "../joints";
import {at, frameOf} from "../pose";
import {
  createRagdoll,
  RAGDOLL_JOINT_RADIUS,
  RAGDOLL_STEP,
  startRagdoll,
  stepRagdoll,
  writeRagdollPose,
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
    const xs = [0, 0.25, 0.75, 1].map((u) =>
      at(fall(3, () => u).pos, J.head * 3),
    );
    expect(Math.min(...xs)).toBeLessThan(-0.3);
    expect(Math.max(...xs)).toBeGreaterThan(0.3);
  });

  describe("いろいろな倒れ方", () => {
    const results = Array.from({length: 12}, (_, k) => {
      let seed = k + 1;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const clip = k % 2 ? CLIPS.walk : CLIPS.idle;
      const pose = frameOf(clip, k % clip.frames.length);
      const r = createRagdoll();
      const speed = k % 2 ? 4 : 0;
      startRagdoll(
        r,
        pose,
        new Vector3(0, 0.02, 0),
        random() * Math.PI * 2,
        new Vector3(random() - 0.5, 0, random() - 0.5)
          .normalize()
          .multiplyScalar(speed),
        random,
      );
      const colliders = [floor()];
      let lowest = Infinity;
      for (let f = 0; f < 600; f++) {
        stepRagdoll(r, 1 / 60, colliders);
        for (let i = 1; i < r.pos.length; i += 3) {
          lowest = Math.min(lowest, at(r.pos, i));
        }
      }
      return {r, lowest};
    });

    const v = (p: Float32Array, i: number) => new Vector3().fromArray(p, i * 3);

    it("脚が左右で入れ替わらない", () => {
      for (const {r} of results) {
        const p = r.pos;
        const right = v(p, J.rShoulder)
          .sub(v(p, J.lShoulder))
          .add(v(p, J.rHip))
          .sub(v(p, J.lHip));
        for (const [l, rr] of [
          [J.lKnee, J.rKnee],
          [J.lAnkle, J.rAnkle],
        ] as const) {
          expect(v(p, rr).sub(v(p, l)).dot(right)).toBeGreaterThan(0);
        }
      }
    });

    it("肘と手首が胴体に埋まらない", () => {
      for (const {r} of results) {
        const p = r.pos;
        const top = v(p, J.lShoulder)
          .add(v(p, J.rShoulder))
          .multiplyScalar(0.5);
        const bottom = v(p, J.lHip).add(v(p, J.rHip)).multiplyScalar(0.5);
        const axis = top.clone().sub(bottom);
        for (const i of [J.lElbow, J.rElbow, J.lWrist, J.rWrist]) {
          const q = v(p, i);
          const t = Math.min(
            1,
            Math.max(0, q.clone().sub(bottom).dot(axis) / axis.lengthSq()),
          );
          const nearest = bottom.clone().addScaledVector(axis, t);
          expect(q.distanceTo(nearest)).toBeGreaterThan(0.12);
        }
      }
    });

    it("床に潜らず、やがて止まる", () => {
      for (const {r, lowest} of results) {
        expect(lowest).toBeGreaterThan(-0.03);
        expect(r.sleeping).toBe(true);
      }
    });
  });

  it("関節のない骨の途中でも細い棒をすり抜けない", () => {
    const bar = (x: number): Collider => {
      const geometry = new BoxGeometry(0.04, 0.04, 4);
      geometry.computeBoundsTree();
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      mesh.position.set(x, 0.2, 0);
      return {mesh, enabled: true};
    };
    const lying = new Float32Array(JOINT_COUNT * 3);
    for (let i = 0; i < JOINT_COUNT; i++) {
      lying[i * 3] = at(idle, i * 3 + 1);
      lying[i * 3 + 1] = 0.4;
      lying[i * 3 + 2] = at(idle, i * 3);
    }
    const r = createRagdoll();
    startRagdoll(r, lying, new Vector3(), 0, new Vector3(), () => 0.5);
    r.prev.set(r.pos);
    const bars = [bar(0.7), bar(1)];
    for (let f = 0; f < 60; f++) {
      stepRagdoll(r, 1 / 60, bars);
    }
    expect(at(r.pos, J.lHip * 3 + 1)).toBeGreaterThan(0.2);
  });

  it("止まったら眠り、以後は動かない", () => {
    const r = fall(6);
    expect(r.sleeping).toBe(true);
    const before = r.pos.slice();
    stepRagdoll(r, 1 / 60, [floor()]);
    expect(Array.from(r.pos)).toEqual(Array.from(before));
  });

  it("描く姿勢は、最後のステップの前後を余り時間で補間する", () => {
    const r = createRagdoll();
    startRagdoll(r, idle, new Vector3(0, 0.02, 0), 0, new Vector3());
    stepRagdoll(r, RAGDOLL_STEP * 1.5, [floor()]);
    const out = new Float32Array(r.pos.length);
    writeRagdollPose(r, out);
    for (let i = 0; i < out.length; i++) {
      expect(at(out, i)).toBeCloseTo((at(r.last, i) + at(r.pos, i)) / 2, 6);
    }
    expect(Array.from(r.last)).not.toEqual(Array.from(r.pos));
  });
});
