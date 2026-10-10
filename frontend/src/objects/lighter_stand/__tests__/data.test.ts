import {describe, expect, it} from "vitest";

import {parseLighterStandData} from "../data";

describe("parseLighterStandData", () => {
  it("hasLighter をそのまま読む", () => {
    expect(parseLighterStandData({hasLighter: true})).toEqual({
      hasLighter: true,
    });
    expect(parseLighterStandData({hasLighter: false})).toEqual({
      hasLighter: false,
    });
  });

  it.each([
    ["null", null],
    ["配列", [true]],
    ["hasLighter が無い", {}],
    ["hasLighter が真偽値でない", {hasLighter: "true"}],
  ])("読めない data(%s)は、ライターが無いとみなす", (_, data) => {
    expect(parseLighterStandData(data)).toEqual({hasLighter: false});
  });
});
