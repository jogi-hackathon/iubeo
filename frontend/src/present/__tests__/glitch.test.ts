import {describe, expect, it} from "vitest";

import {glitchSlicesAt} from "../glitch";

describe("glitchSlicesAt", () => {
  it("決まった時間の中だけ帯が乱れる", () => {
    expect(glitchSlicesAt(0, 900)).toEqual([]);
    expect(glitchSlicesAt(900, 900)).toEqual([]);
    expect(glitchSlicesAt(225, 900).length).toBeGreaterThan(0);
  });

  it("同じ時刻なら同じ乱れ方になり、帯は画面の内側に収まる", () => {
    const slices = glitchSlicesAt(240, 900);
    expect(slices).toEqual(glitchSlicesAt(240, 900));
    for (const s of slices) {
      expect(s.top).toBeGreaterThanOrEqual(0);
      expect(s.top + s.height).toBeLessThanOrEqual(100.0001);
    }
  });
});
