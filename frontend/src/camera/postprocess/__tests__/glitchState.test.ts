import {describe, expect, it} from "vitest";

import {createGlitchPulse, GLITCH_PEAK, glitchEnvelope} from "../glitchState";

describe("glitchEnvelope", () => {
  it("範囲の外は 0、ピークで 1、ピークの前後でなだらかに変わる", () => {
    expect(glitchEnvelope(-0.1)).toBe(0);
    expect(glitchEnvelope(0)).toBe(0);
    expect(glitchEnvelope(1)).toBe(0);
    expect(glitchEnvelope(1.5)).toBe(0);
    expect(glitchEnvelope(GLITCH_PEAK)).toBeCloseTo(1);
    expect(glitchEnvelope(GLITCH_PEAK / 2)).toBeGreaterThan(0);
    expect(glitchEnvelope(GLITCH_PEAK / 2)).toBeLessThan(1);
    expect(glitchEnvelope(0.6)).toBeGreaterThan(glitchEnvelope(0.9));
  });
});

describe("createGlitchPulse", () => {
  const setup = (reducedMotion = false) => {
    let now = 1000;
    const pulses: number[] = [];
    const glitch = createGlitchPulse({
      now: () => now,
      reducedMotion: () => reducedMotion,
      onPulse: (ms) => pulses.push(ms),
    });
    return {
      glitch,
      pulses,
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it("パルスの前は 0、ピークで 1、終わると 0 に戻る", () => {
    const {glitch, advance} = setup();
    expect(glitch.strength()).toBe(0);
    glitch.pulse(400);
    expect(glitch.strength()).toBe(0);
    advance(400 * GLITCH_PEAK);
    expect(glitch.strength()).toBeCloseTo(1);
    advance(400);
    expect(glitch.strength()).toBe(0);
  });

  it("パルス中にもう一度 pulse すると、そこから数え直す", () => {
    const {glitch, advance} = setup();
    glitch.pulse(400);
    advance(300);
    glitch.pulse(400);
    advance(400 * GLITCH_PEAK);
    expect(glitch.strength()).toBeCloseTo(1);
  });

  it("視差効果を減らす設定のときは、パルスを出さない", () => {
    const {glitch, advance} = setup(true);
    glitch.pulse(400);
    advance(100);
    expect(glitch.strength()).toBe(0);
  });

  it("onPulse は新しいパルスで 1 回だけ呼び、パルス中の pulse では呼ばない。減らす設定でも呼ぶ", () => {
    const {glitch, advance, pulses} = setup();
    glitch.pulse(400);
    advance(300);
    glitch.pulse(400);
    expect(pulses).toEqual([400]);
    advance(400);
    glitch.pulse(450);
    expect(pulses).toEqual([400, 450]);

    const reduced = setup(true);
    reduced.glitch.pulse(400);
    expect(reduced.pulses).toEqual([400]);
  });
});
