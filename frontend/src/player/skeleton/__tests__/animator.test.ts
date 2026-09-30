import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {JUMP_SPEED} from "../../constants";
import {
  type Animator,
  createAnimator,
  STRIDE_LENGTH,
  updateAnimator,
} from "../animator";
import {CLIPS} from "../clips";
import {J} from "../joints";
import {at, createPose, frameOf, sampleClip} from "../pose";

const state = (
  vx: number,
  vy: number,
  vz: number,
  onGround: boolean,
  yaw = 0,
) => ({
  velocity: new Vector3(vx, vy, vz),
  onGround,
  yaw,
});

/** 十分な時間を回して、表示ポーズを目標に収束させる */
const settle = (a: Animator, s: ReturnType<typeof state>, holding = false) =>
  updateAnimator(a, s, holding, 10);

describe("updateAnimator", () => {
  it("最初の 1 回は補間せず目標のポーズになる(静止 → 待機)", () => {
    const a = createAnimator();
    updateAnimator(a, state(0, 0, 0, true), false, 1 / 60);
    expect(Array.from(a.pose)).toEqual(Array.from(frameOf(CLIPS.idle, 0)));
  });

  it("接地して動いていれば歩行、速度に比例して位相が進む", () => {
    const a = createAnimator();
    updateAnimator(a, state(0, 0, -3, true), false, 0.1);
    expect(a.phase).toBeCloseTo((3 * 0.1) / STRIDE_LENGTH);
    const before = a.phase;
    updateAnimator(a, state(0, 0, -6, true), false, 0.1);
    expect(a.phase - before).toBeCloseTo((6 * 0.1) / STRIDE_LENGTH);
  });

  it("後退(向きと逆に動く)では位相が戻る。yaw を回しても向き基準", () => {
    const a = createAnimator();
    a.phase = 0.5;
    updateAnimator(a, state(0, 0, 3, true, 0), false, 0.1); // yaw=0 の前は -Z
    expect(a.phase).toBeLessThan(0.5);
    const b = createAnimator();
    b.phase = 0.5;
    // yaw=π/2 の前は -X
    updateAnimator(b, state(-3, 0, 0, true, Math.PI / 2), false, 0.1);
    expect(b.phase).toBeGreaterThan(0.5);
  });

  it("位相は 0..1 に収まる", () => {
    const a = createAnimator();
    a.phase = 0.99;
    updateAnimator(a, state(0, 0, -4, true), false, 0.1);
    expect(a.phase).toBeGreaterThanOrEqual(0);
    expect(a.phase).toBeLessThan(1);
  });

  it("空中は上下の速度でジャンプの上昇・頂点・落下を引く", () => {
    const expected = (u: number) => {
      const out = createPose();
      return sampleClip(out, CLIPS.jump, u);
    };
    for (const [vy, u] of [
      [JUMP_SPEED, 0],
      [0, 0.5],
      [-JUMP_SPEED, 1],
      [-3 * JUMP_SPEED, 1],
    ] as const) {
      const a = createAnimator();
      updateAnimator(a, state(0, vy, 0, false), false, 1 / 60);
      expect(Array.from(a.pose), `vy=${vy}`).toEqual(Array.from(expected(u)));
    }
  });

  it("空中では水平に動いていても歩行の位相は進まない", () => {
    const a = createAnimator();
    updateAnimator(a, state(0, 2, -4, false), false, 0.1);
    expect(a.phase).toBe(0);
  });

  it("holding は腕だけを置き換え、脚と胴は変えない", () => {
    const plain = createAnimator();
    const held = createAnimator();
    const s = state(0, 0, 0, true);
    settle(plain, s);
    settle(held, s, true);
    const hold = frameOf(CLIPS.hold, 0);
    for (const j of ["lWrist", "rWrist"] as const) {
      for (let k = 0; k < 3; k++) {
        expect(at(held.pose, J[j] * 3 + k)).toBeCloseTo(at(hold, J[j] * 3 + k));
      }
    }
    for (const j of ["head", "lShoulder", "lHip", "rKnee", "lToe"] as const) {
      for (let k = 0; k < 3; k++) {
        expect(at(held.pose, J[j] * 3 + k)).toBeCloseTo(
          at(plain.pose, J[j] * 3 + k),
        );
      }
    }
  });

  it("holding の腕は肩からの相対位置を保つ(歩行の上下動でずれない)", () => {
    const a = createAnimator();
    const hold = frameOf(CLIPS.hold, 0);
    a.phase = 0.25; // 歩行の通過姿勢で胴が高い
    updateAnimator(a, state(0, 0, -3, true), true, 10);
    const rel = (i: number) =>
      at(a.pose, J.rWrist * 3 + i) - at(a.pose, J.rShoulder * 3 + i);
    for (let k = 0; k < 3; k++) {
      expect(rel(k)).toBeCloseTo(
        at(hold, J.rWrist * 3 + k) - at(hold, J.rShoulder * 3 + k),
      );
    }
  });

  it("2 回目以降は目標へ滑らかに近づく(1 フレームでは届かない)", () => {
    const a = createAnimator();
    updateAnimator(a, state(0, 0, 0, true), false, 1 / 60);
    const before = at(a.pose, J.lToe * 3 + 2);
    updateAnimator(a, state(0, 0, 0, false), false, 1 / 60); // 空中へ
    const target = at(a.target, J.lToe * 3 + 2);
    const after = at(a.pose, J.lToe * 3 + 2);
    expect(target).not.toBeCloseTo(before);
    expect(Math.abs(after - before)).toBeGreaterThan(0);
    expect(Math.abs(after - target)).toBeGreaterThan(0);
  });
});
