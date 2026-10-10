import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {EYE_FORWARD, EYE_HEIGHT} from "../../constants";
import {CLIPS} from "../clips";
import {HELD_ITEM_OFFSET, writeHeldItemPosition} from "../held";
import {frameOf} from "../pose";

const HALF_FOV_DEG = 37.5;
const HALF_SIZE = 0.05;

describe("writeHeldItemPosition", () => {
  const hold = frameOf(CLIPS.hold, 0);

  it("両手首の中点に、オフセットを足した位置を書く", () => {
    const out = writeHeldItemPosition(new Vector3(), hold);
    expect(out.x).toBeCloseTo(HELD_ITEM_OFFSET[0]);
    expect(out.y).toBeCloseTo(1.48 + HELD_ITEM_OFFSET[1]);
    expect(out.z).toBeCloseTo(-0.51 + HELD_ITEM_OFFSET[2]);
  });

  it("一人称で、アイテム全体が視野の下側に収まる(見下ろさなくても見える)", () => {
    const p = writeHeldItemPosition(new Vector3(), hold);
    const forward = -p.z - EYE_FORWARD;
    const below = EYE_HEIGHT - p.y;
    expect(forward).toBeGreaterThan(0.2);

    const angle = (below: number, forward: number) =>
      (Math.atan2(below, forward) * 180) / Math.PI;
    expect(angle(below, forward)).toBeGreaterThan(10);
    expect(angle(below + HALF_SIZE, forward - HALF_SIZE)).toBeLessThan(
      HALF_FOV_DEG - 3,
    );
  });
});
