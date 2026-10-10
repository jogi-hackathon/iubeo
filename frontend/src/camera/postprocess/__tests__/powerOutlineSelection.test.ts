import {Object3D, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {
  addPowerOutline,
  POWER_OUTLINE_FADE_END,
  POWER_OUTLINE_FADE_START,
  powerOutlineFade,
  powerOutlineFadeAt,
  powerOutlineSelection,
  updatePowerOutline,
} from "../powerOutlineSelection";

const at = (x: number): Object3D => {
  const o = new Object3D();
  o.position.set(x, 0, 0);
  o.updateMatrixWorld();
  return o;
};
const CAMERA = new Vector3(0, 0, 0);

describe("powerOutlineFadeAt", () => {
  it("FADE_START までは 1、FADE_END から先は 0、間は単調に落ちる", () => {
    expect(powerOutlineFadeAt(0)).toBe(1);
    expect(powerOutlineFadeAt(POWER_OUTLINE_FADE_START)).toBe(1);
    const mid = powerOutlineFadeAt(
      (POWER_OUTLINE_FADE_START + POWER_OUTLINE_FADE_END) / 2,
    );
    expect(mid).toBeCloseTo(0.5);
    expect(powerOutlineFadeAt(POWER_OUTLINE_FADE_START + 0.2)).toBeGreaterThan(
      mid,
    );
    expect(powerOutlineFadeAt(POWER_OUTLINE_FADE_END)).toBe(0);
    expect(powerOutlineFadeAt(100)).toBe(0);
  });
});

describe("updatePowerOutline", () => {
  it("消えきる距離より近い物だけを選び、濃さは一番近い物の濃さ。配列の参照は変わらない", () => {
    const ref = powerOutlineSelection;
    const near = at(1);
    const fading = at((POWER_OUTLINE_FADE_START + POWER_OUTLINE_FADE_END) / 2);
    const far = at(POWER_OUTLINE_FADE_END + 1);
    const offs = [near, fading, far].map((o) => addPowerOutline(o));

    updatePowerOutline(CAMERA);
    expect(powerOutlineSelection).toEqual([near, fading]);
    expect(powerOutlineSelection).toBe(ref);
    expect(powerOutlineFade.value).toBe(1);

    offs[0]?.();
    updatePowerOutline(CAMERA);
    expect(powerOutlineSelection).toEqual([fading]);
    expect(powerOutlineFade.value).toBeCloseTo(0.5);

    for (const off of offs) {
      off();
    }
    updatePowerOutline(CAMERA);
    expect(powerOutlineSelection).toEqual([]);
    expect(powerOutlineFade.value).toBe(0);
  });

  it("ignoreDistance の物は、遠くても濃さ 1 で選ぶ。2 回外しても他の物は外れない", () => {
    const warm = at(100);
    const other = at(1);
    const offWarm = addPowerOutline(warm, {ignoreDistance: true});
    const offOther = addPowerOutline(other);

    updatePowerOutline(CAMERA);
    expect(powerOutlineSelection).toEqual([warm, other]);
    expect(powerOutlineFade.value).toBe(1);

    offWarm();
    offWarm();
    updatePowerOutline(CAMERA);
    expect(powerOutlineSelection).toEqual([other]);
    offOther();
  });
});
