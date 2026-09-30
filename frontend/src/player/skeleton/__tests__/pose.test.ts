import {describe, expect, it} from "vitest";

import {CLIPS} from "../clips";
import {BONES, J, JOINT_COUNT, NECK} from "../joints";
import {
  type Clip,
  at,
  createPose,
  frameOf,
  lerpPose,
  mirrorPose,
  sampleClip,
  writePoints,
} from "../pose";

const constPose = (v: number) => createPose().fill(v);

describe("mirrorPose", () => {
  it("左右の関節を入れ替えて x を反転する", () => {
    const src = frameOf(CLIPS.idle, 0);
    const m = mirrorPose(src);
    for (const [l, r] of [
      [J.lKnee, J.rKnee],
      [J.lWrist, J.rWrist],
    ] as const) {
      expect(at(m, l * 3)).toBeCloseTo(-at(src, r * 3));
      expect(at(m, l * 3 + 1)).toBeCloseTo(at(src, r * 3 + 1));
      expect(at(m, l * 3 + 2)).toBeCloseTo(at(src, r * 3 + 2));
    }
  });

  it("2 回かけると元に戻る", () => {
    const src = frameOf(CLIPS.walk, 0);
    expect(Array.from(mirrorPose(mirrorPose(src)))).toEqual(Array.from(src));
  });

  it("head は入れ替わらず x だけ反転する", () => {
    const src = createPose();
    src.set([0.3, 1.6, 0.1], J.head * 3);
    const m = mirrorPose(src);
    expect(at(m, J.head * 3)).toBeCloseTo(-0.3);
    expect(at(m, J.head * 3 + 1)).toBeCloseTo(1.6);
    expect(at(m, J.head * 3 + 2)).toBeCloseTo(0.1);
  });
});

describe("lerpPose", () => {
  it("w で a から b へ混ざり、out は a と同じ配列でもよい", () => {
    const a = constPose(0);
    lerpPose(a, a, constPose(10), 0.25);
    expect(at(a, 0)).toBeCloseTo(2.5);
    expect(at(a, a.length - 1)).toBeCloseTo(2.5);
  });
});

describe("sampleClip", () => {
  const clip = (loop: boolean): Clip => ({
    loop,
    frames: [constPose(0), constPose(10), constPose(20)],
  });
  const first = (c: Clip, t: number) => at(sampleClip(createPose(), c, t), 0);

  it("loop: フレームは等間隔で、最後から最初へ補間して繋がる", () => {
    const c = clip(true);
    expect(first(c, 0)).toBeCloseTo(0);
    expect(first(c, 1 / 3)).toBeCloseTo(10);
    expect(first(c, 0.5)).toBeCloseTo(15);
    expect(first(c, 5 / 6)).toBeCloseTo(10); // 20 → 0 の中間
  });

  it("loop: t は 1 で回り込み、負でも回り込む", () => {
    const c = clip(true);
    expect(first(c, 1.5)).toBeCloseTo(first(c, 0.5));
    expect(first(c, -0.25)).toBeCloseTo(first(c, 0.75));
  });

  it("非 loop: 両端で止まり、範囲外は端に張り付く", () => {
    const c = clip(false);
    expect(first(c, 0)).toBeCloseTo(0);
    expect(first(c, 0.5)).toBeCloseTo(10);
    expect(first(c, 1)).toBeCloseTo(20);
    expect(first(c, -3)).toBeCloseTo(0);
    expect(first(c, 3)).toBeCloseTo(20);
  });

  it("1 フレームのクリップはそのまま返す", () => {
    const c: Clip = {loop: true, frames: [constPose(7)]};
    expect(first(c, 0.3)).toBeCloseTo(7);
  });
});

describe("writePoints", () => {
  it("首は両肩の中点になる", () => {
    const pose = constPose(0);
    pose.set([-1, 2, 3], J.lShoulder * 3);
    pose.set([3, 4, 5], J.rShoulder * 3);
    const points = new Float32Array((JOINT_COUNT + 1) * 3);
    writePoints(points, pose);
    expect(Array.from(points.subarray(NECK * 3))).toEqual([1, 3, 4]);
  });
});

describe("BONES", () => {
  it("端点は関節か首で、自分自身とは繋がない", () => {
    for (const [a, b] of BONES) {
      expect(a).not.toBe(b);
      for (const i of [a, b]) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(NECK);
      }
    }
  });
});
