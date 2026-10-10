import {describe, expect, it} from "vitest";

import {fireParamsFor} from "../fire";
import {MOUNTAIN_SIZES} from "../mountain";

describe("fireParamsFor", () => {
  it.each(["large", "small"] as const)(
    "%s の山: 粒は山の内側(半径・高さとも山より小さい)から出て、大きさ・昇る高さは小さい順",
    (size) => {
      const m = MOUNTAIN_SIZES[size];
      const p = fireParamsFor(size);
      expect(p.count).toBeGreaterThan(0);
      expect(p.radiusBottom).toBeLessThan(m.radiusBottom);
      expect(p.radiusTop).toBeLessThan(m.radiusTop);
      expect(p.height).toBeLessThan(m.heightMin);
      expect(p.sizeMin).toBeLessThan(p.sizeMax);
      expect(p.riseMin).toBeLessThan(p.riseMax);
    },
  );

  it("小さい山は、粒が少なく、小さい", () => {
    const large = fireParamsFor("large");
    const small = fireParamsFor("small");
    expect(small.count).toBeLessThan(large.count);
    expect(small.sizeMax).toBeLessThan(large.sizeMax);
  });
});

describe("侵食の長さ", () => {
  it("山が抜けきるのは、サーバーが火から決着をつけるまで(既定 10 秒)より前", async () => {
    const {CORRUPT_SECONDS} = await import("../corruption");
    expect(CORRUPT_SECONDS).toBeLessThan(10);
  });
});
