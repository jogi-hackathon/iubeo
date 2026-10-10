import {describe, expect, it} from "vitest";

import {CLIPS} from "../clips";
import {J, type JointName} from "../joints";
import {at, frameOf, type Pose} from "../pose";

const dist = (p: Pose, a: JointName, b: JointName): number =>
  Math.hypot(
    at(p, J[a] * 3) - at(p, J[b] * 3),
    at(p, J[a] * 3 + 1) - at(p, J[b] * 3 + 1),
    at(p, J[a] * 3 + 2) - at(p, J[b] * 3 + 2),
  );

const allFrames = Object.entries(CLIPS).flatMap(([name, clip]) =>
  clip.frames.map((pose, i) => ({label: `${name}[${i}]`, pose})),
);

const LIMBS: readonly [JointName, JointName, number][] = [
  ["lHip", "lKnee", 0.4],
  ["rHip", "rKnee", 0.4],
  ["lKnee", "lAnkle", 0.4],
  ["rKnee", "rAnkle", 0.4],
  ["lShoulder", "lElbow", 0.26],
  ["rShoulder", "rElbow", 0.26],
  ["lElbow", "lWrist", 0.24],
  ["rElbow", "rWrist", 0.24],
];
const TOLERANCE = 0.15;

describe("CLIPS", () => {
  it("全フレームの値が有限で、足が床(y=0)より下に潜らない", () => {
    for (const {label, pose} of allFrames) {
      expect(pose.every(Number.isFinite), label).toBe(true);
      for (const toe of ["lToe", "rToe"] as const) {
        expect(
          at(pose, J[toe] * 3 + 1),
          `${label} ${toe}`,
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("肢の長さが基準から大きくずれない", () => {
    for (const {label, pose} of allFrames) {
      for (const [a, b, len] of LIMBS) {
        const d = dist(pose, a, b);
        expect(
          Math.abs(d - len) / len,
          `${label} ${a}-${b}=${d.toFixed(3)}`,
        ).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });

  it("歩行は 4 フレームの循環で、後半が前半の左右反転になっている", () => {
    const [c, p, c2, p2] = [0, 1, 2, 3].map((i) => frameOf(CLIPS.walk, i)) as [
      Pose,
      Pose,
      Pose,
      Pose,
    ];
    expect(CLIPS.walk.loop).toBe(true);
    expect(at(c, J.lToe * 3 + 2)).toBeLessThan(at(c, J.rToe * 3 + 2));
    expect(at(c2, J.rToe * 3 + 2)).toBeLessThan(at(c2, J.lToe * 3 + 2));
    expect(at(c, J.lHip * 3 + 1)).toBeLessThan(at(p, J.lHip * 3 + 1));
    expect(at(c2, J.lHip * 3 + 1)).toBeLessThan(at(p2, J.lHip * 3 + 1));
  });

  it("ホールドの肘は、肩と手首を結ぶ線より下にある(肘が反って見えない)", () => {
    const h = frameOf(CLIPS.hold, 0);
    for (const side of ["l", "r"] as const) {
      const [s, e, w] = [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`].map(
        (name) => J[name as JointName] * 3,
      ) as [number, number, number];
      const t = (at(h, e + 2) - at(h, s + 2)) / (at(h, w + 2) - at(h, s + 2));
      const lineY = at(h, s + 1) + t * (at(h, w + 1) - at(h, s + 1));
      expect(at(h, e + 1)).toBeLessThan(lineY - 0.01);
    }
  });

  it("ホールドは両手首を胸の前(肩より前)で近づける", () => {
    const h = frameOf(CLIPS.hold, 0);
    for (const w of ["lWrist", "rWrist"] as const) {
      expect(at(h, J[w] * 3 + 2)).toBeLessThan(-0.2);
    }
    expect(dist(h, "lWrist", "rWrist")).toBeLessThan(0.3);
  });
});
