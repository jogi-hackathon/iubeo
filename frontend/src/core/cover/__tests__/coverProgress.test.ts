import {describe, expect, it} from "vitest";

import {
  barFraction,
  bootStageCount,
  bootStageDone,
  CREEP_LIMIT,
} from "../coverProgress";

describe("barFraction", () => {
  it("段階の境界ちょうどから始まる", () => {
    expect(barFraction({done: 2, total: 6, elapsedMs: 0})).toBeCloseTo(2 / 6);
    expect(barFraction({done: 0, total: 6, elapsedMs: 0})).toBe(0);
  });

  it("段階の中では時間とともに単調に増え、次の境界には届かない", () => {
    const next = 3 / 6;
    let prev = barFraction({done: 2, total: 6, elapsedMs: 0});
    for (const elapsedMs of [100, 500, 1000, 3000, 10_000, 1_000_000]) {
      const v = barFraction({done: 2, total: 6, elapsedMs});
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThan(next);
      prev = v;
    }
    expect(prev).toBeCloseTo((2 + CREEP_LIMIT) / 6, 3);
  });

  it("段階が進んでも値は後退しない(直前の段階の上限より境界は上)", () => {
    const creepedMax = barFraction({done: 2, total: 6, elapsedMs: 1e9});
    expect(barFraction({done: 3, total: 6, elapsedMs: 0})).toBeGreaterThan(
      creepedMax,
    );
  });

  it("全段階が終わったら 1", () => {
    expect(barFraction({done: 6, total: 6, elapsedMs: 0})).toBe(1);
  });

  it("経過時間が負でも 0 扱い", () => {
    expect(barFraction({done: 1, total: 4, elapsedMs: -100})).toBe(1 / 4);
  });
});

describe("起動の段階", () => {
  it("起動のステップ数に、ウォームアップと最初のシーンの準備を足す", () => {
    expect(bootStageCount(4)).toBe(6);
  });

  it("ステップが終わったあと、ウォームアップと最初のシーンの準備を順に数える", () => {
    const total = 6;
    expect(bootStageDone({total, warmedUp: false, sceneReady: false})).toBe(4);
    expect(bootStageDone({total, warmedUp: true, sceneReady: false})).toBe(5);
    expect(bootStageDone({total, warmedUp: false, sceneReady: true})).toBe(5);
    expect(bootStageDone({total, warmedUp: true, sceneReady: true})).toBe(6);
  });
});
