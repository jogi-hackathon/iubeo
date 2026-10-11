import {describe, expect, it} from "vitest";

import {CANVAS_ACTION_MS} from "../data";
import {
  APPEAR_SECONDS,
  denoiseProgress,
  stepAppear,
  stepFade,
  VANISH_SECONDS,
} from "../diffusion";

describe("denoiseProgress", () => {
  it("ノイズが出揃うまでは、ノイズだけ", () => {
    expect(denoiseProgress(0)).toBe(0);
    expect(denoiseProgress(APPEAR_SECONDS)).toBe(0);
  });

  it("作業が終わる前に描き上がる", () => {
    expect(denoiseProgress(CANVAS_ACTION_MS / 1000 - 0.01)).toBe(1);
  });

  it("途中は単調に進む", () => {
    const a = denoiseProgress(0.6);
    const b = denoiseProgress(1.2);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
  });
});

describe("stepAppear", () => {
  it("作業中は APPEAR_SECONDS で出揃い、1 を超えない", () => {
    expect(stepAppear(0, true, APPEAR_SECONDS / 2)).toBeCloseTo(0.5);
    expect(stepAppear(0.9, true, 1)).toBe(1);
  });

  it("作業が終わっても戻さない", () => {
    expect(stepAppear(1, false, 1)).toBe(1);
  });
});

describe("stepFade", () => {
  it("作業中はそのまま", () => {
    expect(stepFade(0.3, true, 0.01)).toBe(1);
  });

  it("作業が終わったら VANISH_SECONDS で白に戻り、0 を下回らない", () => {
    expect(stepFade(1, false, VANISH_SECONDS / 2)).toBeCloseTo(0.5);
    expect(stepFade(0.1, false, 1)).toBe(0);
  });
});
