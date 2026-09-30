import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {EYE_FORWARD, EYE_HEIGHT} from "../../constants";
import {CLIPS} from "../clips";
import {HELD_ITEM_OFFSET, writeHeldItemPosition} from "../held";
import {frameOf} from "../pose";

/** GameCanvas のカメラ(縦 fov 75)の、上下それぞれの半角(度) */
const HALF_FOV_DEG = 37.5;
/** HeldItem の箱の一辺(0.1)の半分 */
const HALF_SIZE = 0.05;

describe("writeHeldItemPosition", () => {
  const hold = frameOf(CLIPS.hold, 0);

  it("両手首の中点に、オフセットを足した位置を書く", () => {
    const out = writeHeldItemPosition(new Vector3(), hold);
    // ホールドの手首は左右対称で、中点の x は 0
    expect(out.x).toBeCloseTo(HELD_ITEM_OFFSET[0]);
    expect(out.y).toBeCloseTo(1.48 + HELD_ITEM_OFFSET[1]);
    expect(out.z).toBeCloseTo(-0.51 + HELD_ITEM_OFFSET[2]);
  });

  it("一人称で、アイテム全体が視野の下側に収まる(見下ろさなくても見える)", () => {
    const p = writeHeldItemPosition(new Vector3(), hold);
    // 目(高さ EYE_HEIGHT、前 EYE_FORWARD)から見た、前方距離と下方距離
    const forward = -p.z - EYE_FORWARD;
    const below = EYE_HEIGHT - p.y;
    expect(forward).toBeGreaterThan(0.2);

    const angle = (below: number, forward: number) =>
      (Math.atan2(below, forward) * 180) / Math.PI;
    // 中心は視線より下にある
    expect(angle(below, forward)).toBeGreaterThan(10);
    // 一番手前・下の角(HeldItem の一辺の半分だけずれた点)まで、視野の端にかからない
    expect(angle(below + HALF_SIZE, forward - HALF_SIZE)).toBeLessThan(
      HALF_FOV_DEG - 3,
    );
  });
});
