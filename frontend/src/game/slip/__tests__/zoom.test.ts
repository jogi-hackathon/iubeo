import {Matrix4, Quaternion, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {SLIP_LENGTH} from "../strip";
import {STAGE_MS, stageStart} from "../terminal";
import {
  fitDistance,
  SLIP_ZOOM_FILL,
  SLIP_ZOOM_MS,
  slipZoomBlend,
  slipZoomPose,
} from "../zoom";

describe("slipZoomBlend", () => {
  const look = stageStart("look");
  const end = look + STAGE_MS.look;

  it("千切って見る段の間だけ寄り、飛ぶ前に戻りきる", () => {
    expect(slipZoomBlend(0)).toBe(0);
    expect(slipZoomBlend(look)).toBe(0);
    expect(slipZoomBlend(look + SLIP_ZOOM_MS)).toBe(1);
    expect(slipZoomBlend((look + end) / 2)).toBe(1);
    expect(slipZoomBlend(end - SLIP_ZOOM_MS)).toBe(1);
    expect(slipZoomBlend(end)).toBe(0);
    expect(slipZoomBlend(stageStart("fly") + 100)).toBe(0);
  });

  it("寄りきって見ている時間を 2 秒は取る", () => {
    expect(STAGE_MS.look - 2 * SLIP_ZOOM_MS).toBeGreaterThanOrEqual(2000);
  });
});

describe("slipZoomPose", () => {
  it("伝票の真ん中の正面(表の向き)から、伝票と同じ向きで見る", () => {
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 2,
    );
    const world = new Matrix4().compose(
      new Vector3(1, 2, 3),
      rotation,
      new Vector3(1, 1, 1),
    );
    const position = new Vector3();
    const quaternion = new Quaternion();
    slipZoomPose(world, 75, position, quaternion);
    const distance = fitDistance(SLIP_LENGTH, 75, SLIP_ZOOM_FILL);
    expect(position.x).toBeCloseTo(1 + distance);
    expect(position.y).toBeCloseTo(2 + SLIP_LENGTH / 2);
    expect(position.z).toBeCloseTo(3);
    expect(quaternion.angleTo(rotation)).toBeCloseTo(0);
  });

  it("画角に収まる距離は、高さの半分を fill と画角の半分の tan で割ったもの", () => {
    expect(fitDistance(0.2, 90, 0.5)).toBeCloseTo(0.2);
  });
});
