import {PerspectiveCamera, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {
  horizonFromTopAt,
  isSkyActive,
  pitchForHorizon,
  SKY_EYE_HEIGHT,
  SKY_FOV_DEG,
  SKY_HORIZON_FROM_TOP,
} from "../skyView";

describe("pitchForHorizon", () => {
  it("水平線が画面の中央なら真正面を向く", () => {
    expect(pitchForHorizon(SKY_FOV_DEG, 0.5)).toBeCloseTo(0);
  });

  it("水平線を画面の下に置くには少し見上げる", () => {
    expect(pitchForHorizon(SKY_FOV_DEG, SKY_HORIZON_FROM_TOP)).toBeGreaterThan(
      0,
    );
  });

  it("求めた向きで水平線が指定の位置に来る", () => {
    for (const h of [0.25, 0.5, 2 / 3, 0.8]) {
      const pitch = pitchForHorizon(SKY_FOV_DEG, h);
      expect(horizonFromTopAt(SKY_FOV_DEG, pitch)).toBeCloseTo(h);
    }
  });
});

describe("カメラに当てたときの水平線", () => {
  it("遠くの水平線が画面の上から指定の位置に映る", () => {
    const camera = new PerspectiveCamera(SKY_FOV_DEG, 16 / 9, 0.1, 1e7);
    camera.position.set(0, SKY_EYE_HEIGHT, 0);
    camera.rotation.x = pitchForHorizon(SKY_FOV_DEG, SKY_HORIZON_FROM_TOP);
    camera.updateMatrixWorld();
    const ndc = new Vector3(0, SKY_EYE_HEIGHT, -1e6).project(camera);
    expect((1 - ndc.y) / 2).toBeCloseTo(SKY_HORIZON_FROM_TOP, 3);
  });
});

describe("isSkyActive", () => {
  it("入れかわってから暗転するまでの間だけ描く", () => {
    expect(isSkyActive(false, false)).toBe(false);
    expect(isSkyActive(true, false)).toBe(true);
    expect(isSkyActive(true, true)).toBe(false);
  });
});
