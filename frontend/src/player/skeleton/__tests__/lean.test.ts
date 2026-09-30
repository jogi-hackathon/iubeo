import {describe, expect, it} from "vitest";

import {CLIPS} from "../clips";
import {J, JOINT_COUNT, NECK} from "../joints";
import {applyLean} from "../lean";
import {at, frameOf, writePoints} from "../pose";

const points = (pitch: number): Float32Array => {
  const p = new Float32Array((JOINT_COUNT + 1) * 3);
  writePoints(p, frameOf(CLIPS.idle, 0));
  applyLean(p, pitch);
  return p;
};

const dist = (p: Float32Array, a: number, b: number): number =>
  Math.hypot(
    at(p, a * 3) - at(p, b * 3),
    at(p, a * 3 + 1) - at(p, b * 3 + 1),
    at(p, a * 3 + 2) - at(p, b * 3 + 2),
  );

const z = (p: Float32Array, i: number): number => at(p, i * 3 + 2);
const y = (p: Float32Array, i: number): number => at(p, i * 3 + 1);

describe("applyLean", () => {
  it("pitch=0 では何も変わらない", () => {
    expect(Array.from(points(0))).toEqual(Array.from(points(0)));
    const base = new Float32Array((JOINT_COUNT + 1) * 3);
    writePoints(base, frameOf(CLIPS.idle, 0));
    const p = points(0);
    for (let i = 0; i < base.length; i++) {
      expect(at(p, i)).toBeCloseTo(at(base, i));
    }
  });

  it("下を向くと肩・肘・頭が前(-Z)へ出て、上を向くと後ろへ引く", () => {
    const rest = points(0);
    const down = points(-1);
    const up = points(1);
    for (const j of [J.lShoulder, J.rElbow, J.head, NECK]) {
      expect(z(down, j), `down ${j}`).toBeLessThan(z(rest, j));
      expect(z(up, j), `up ${j}`).toBeGreaterThan(z(rest, j));
    }
  });

  it("頭は上半身より大きく動く(首でさらに曲がる)", () => {
    const rest = points(0);
    const down = points(-1);
    expect(z(rest, J.head) - z(down, J.head)).toBeGreaterThan(
      z(rest, J.lShoulder) - z(down, J.lShoulder),
    );
  });

  it("腰から下は動かない", () => {
    const rest = points(0);
    const down = points(-1.2);
    for (const j of [
      J.lHip,
      J.rHip,
      J.lKnee,
      J.rKnee,
      J.lAnkle,
      J.rAnkle,
      J.lToe,
      J.rToe,
    ]) {
      for (let k = 0; k < 3; k++) {
        expect(at(down, j * 3 + k)).toBeCloseTo(at(rest, j * 3 + k));
      }
    }
  });

  it("骨の長さは変わらない(剛体として回す)", () => {
    const rest = points(0);
    for (const pitch of [-1.5, -0.7, 0.5, 1.5]) {
      const p = points(pitch);
      for (const [a, b] of [
        [J.lShoulder, J.lElbow],
        [J.lElbow, J.lWrist],
        [J.rShoulder, J.rElbow],
        [J.lShoulder, J.rShoulder],
        [J.head, NECK],
        [J.lHip, J.lShoulder],
      ] as const) {
        expect(dist(p, a, b), `pitch=${pitch} ${a}-${b}`).toBeCloseTo(
          dist(rest, a, b),
          4,
        );
      }
    }
  });

  it("傾きには上限があり、それ以上見上げ・見下ろしても変わらない", () => {
    expect(Array.from(points(-10))).toEqual(Array.from(points(-20)));
    expect(Array.from(points(10))).toEqual(Array.from(points(20)));
  });

  it("下を向くと上半身が倒れて肩が低くなる(前傾)", () => {
    expect(y(points(-1.5), J.lShoulder)).toBeLessThan(
      y(points(0), J.lShoulder),
    );
  });
});
