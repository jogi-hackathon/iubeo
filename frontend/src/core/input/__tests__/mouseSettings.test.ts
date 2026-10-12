import {describe, expect, it} from "vitest";

import {
  MAX_SENSITIVITY,
  MIN_SENSITIVITY,
  parseMouseSettings,
} from "../mouseSettings";

describe("parseMouseSettings", () => {
  it("壊れた値や欠けた値は既定(1)にする", () => {
    expect(parseMouseSettings(null)).toEqual({sensitivity: 1});
    expect(parseMouseSettings({})).toEqual({sensitivity: 1});
    expect(parseMouseSettings({sensitivity: "fast"})).toEqual({sensitivity: 1});
    expect(parseMouseSettings({sensitivity: Number.NaN})).toEqual({
      sensitivity: 1,
    });
  });

  it("範囲の外は端に収める", () => {
    expect(parseMouseSettings({sensitivity: 0}).sensitivity).toBe(
      MIN_SENSITIVITY,
    );
    expect(parseMouseSettings({sensitivity: 99}).sensitivity).toBe(
      MAX_SENSITIVITY,
    );
    expect(parseMouseSettings({sensitivity: 1.5}).sensitivity).toBe(1.5);
  });
});
