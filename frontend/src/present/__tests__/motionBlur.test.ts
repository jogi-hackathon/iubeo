import {describe, expect, it} from "vitest";

import {blurFilterOn, isJump, smoothSpeed, verticalBlur} from "../motionBlur";
describe("motionBlur", () => {
  it("縦のぼかしは速さに比例し、上限で止まる", () => {
    expect(verticalBlur(0)).toBe(0);
    expect(verticalBlur(200)).toBeGreaterThan(0);
    expect(verticalBlur(400)).toBeCloseTo(verticalBlur(200) * 2);
    expect(verticalBlur(1e6)).toBe(verticalBlur(1e7));
  });

  it("速さは数フレームかけて追従し、一瞬の跳びではぼかしが上限に張り付かない", () => {
    const spike = smoothSpeed(0, 2500, 16);
    expect(spike).toBeGreaterThan(0);
    expect(spike).toBeLessThan(500);
    expect(verticalBlur(spike)).toBeLessThan(verticalBlur(1500));
    let speed = 0;
    for (let i = 0; i < 30; i++) {
      speed = smoothSpeed(speed, 1500, 16);
    }
    expect(verticalBlur(speed)).toBe(verticalBlur(1e6));
    expect(verticalBlur(1500)).toBeGreaterThan(verticalBlur(150));
  });

  it("ログの高さの 1/3 以上の変化は跳びとして扱う", () => {
    expect(isJump(100, 600)).toBe(false);
    expect(isJump(200, 600)).toBe(true);
    expect(isJump(-300, 600)).toBe(true);
  });

  it("フィルターは付ける閾値より外す閾値の方が低い", () => {
    expect(blurFilterOn(false, 0.3)).toBe(false);
    expect(blurFilterOn(true, 0.3)).toBe(true);
    expect(blurFilterOn(false, 0.5)).toBe(true);
    expect(blurFilterOn(true, 0.05)).toBe(false);
  });
});
