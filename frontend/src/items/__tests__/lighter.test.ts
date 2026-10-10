import {describe, expect, it} from "vitest";

import {
  heldLighterPose,
  LIGHTER_IGNITE_DELAY_MS,
  LIGHTER_IGNITE_MS,
  LIGHTER_LID_OPEN_ANGLE,
  LIGHTER_OPEN_MS,
} from "../lighter";

describe("heldLighterPose", () => {
  it("持った瞬間は蓋が閉じていて、火はついていない", () => {
    expect(heldLighterPose(0)).toEqual({lidAngle: -0, flame: 0});
  });

  it("蓋は LIGHTER_OPEN_MS で開ききり、途中は一直線より先に進む(ease-out)", () => {
    const half = heldLighterPose(LIGHTER_OPEN_MS / 2).lidAngle;
    expect(half / LIGHTER_LID_OPEN_ANGLE).toBeGreaterThan(0.5);
    expect(heldLighterPose(LIGHTER_OPEN_MS).lidAngle).toBeCloseTo(
      LIGHTER_LID_OPEN_ANGLE,
    );
    expect(heldLighterPose(10_000).lidAngle).toBeCloseTo(
      LIGHTER_LID_OPEN_ANGLE,
    );
  });

  it("蓋は開ききった角度を超えず(止めに当たる)、当たった後に少し戻ってから収まる", () => {
    const steps = Array.from(
      {length: 51},
      (_, i) => heldLighterPose((LIGHTER_OPEN_MS * i) / 50).lidAngle,
    );
    for (const angle of steps) {
      // 開く向きは負なので、開ききった角度より小さく(手前に)ならない
      expect(angle).toBeGreaterThanOrEqual(LIGHTER_LID_OPEN_ANGLE - 1e-9);
    }
    const hit = steps.findIndex(
      (a) => Math.abs(a - LIGHTER_LID_OPEN_ANGLE) < 1e-9,
    );
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeLessThan(50);
    // 当たった後に一度戻る(角度の絶対値が小さくなる)
    const rebound = Math.min(
      ...steps.slice(hit + 1, 50).map((a) => Math.abs(a)),
    );
    expect(rebound).toBeLessThan(Math.abs(LIGHTER_LID_OPEN_ANGLE));
  });

  it("火は蓋が開ききった後につき始め、一気に膨らんでから LIGHTER_IGNITE_MS で落ち着く", () => {
    expect(LIGHTER_IGNITE_DELAY_MS).toBeGreaterThanOrEqual(LIGHTER_OPEN_MS);
    expect(heldLighterPose(LIGHTER_IGNITE_DELAY_MS).flame).toBe(0);
    const steps = Array.from(
      {length: 51},
      (_, i) =>
        heldLighterPose(LIGHTER_IGNITE_DELAY_MS + (LIGHTER_IGNITE_MS * i) / 50)
          .flame,
    );
    // 途中で落ち着いた大きさ(1)を超えて膨らむ
    expect(Math.max(...steps)).toBeGreaterThan(1);
    // 根元から膨らみ始める(いきなり大きくならない)
    expect(steps[1]).toBeLessThan(0.5);
    expect(
      heldLighterPose(LIGHTER_IGNITE_DELAY_MS + LIGHTER_IGNITE_MS).flame,
    ).toBeCloseTo(1);
    expect(heldLighterPose(10_000).flame).toBe(1);
  });
});
