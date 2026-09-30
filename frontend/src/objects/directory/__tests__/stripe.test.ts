import {describe, expect, it} from "vitest";

import {
  AVG_FACTOR,
  LINE_STRENGTH,
  STRIPE_PITCH,
  stripeFactor,
  stripePhase,
} from "../stripe";

describe("stripePhase", () => {
  it("束の高さが違っても、縞の間隔はワールド単位で一定(1 本ぶんの高さが STRIPE_PITCH)", () => {
    for (const height of [0.05, 0.35, 0.7, 2]) {
      const dy = STRIPE_PITCH / height;
      expect(
        stripePhase(0.4 + dy, height) - stripePhase(0.4, height),
      ).toBeCloseTo(1);
    }
  });

  it("底で 0、高さに比例して増える", () => {
    expect(stripePhase(0, 0.35)).toBe(0);
    expect(stripePhase(1, 0.36)).toBeCloseTo(0.36 / STRIPE_PITCH);
    expect(stripePhase(0.5, 0.7)).toBeCloseTo(stripePhase(1, 0.35));
  });
});

describe("stripeFactor", () => {
  const sample = (from: number, to: number, seed = 0) =>
    Array.from({length: 200}, (_, i) =>
      stripeFactor(from + ((to - from) * i) / 200, seed),
    );

  it("地の紙(1)から、控えめな暗さ(1 - LINE_STRENGTH)の範囲に収まる", () => {
    for (const f of sample(0, 30)) {
      expect(f).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(1 - LINE_STRENGTH);
    }
  });

  it("縞の 1 周期に、線(暗い所)と地(明るい所)がある", () => {
    for (let i = 0; i < 20; i++) {
      const f = sample(i, i + 1);
      expect(Math.min(...f)).toBeLessThan(0.95);
      expect(Math.max(...f)).toBeGreaterThan(0.99);
    }
  });

  it("線は少し不規則(線ごとに濃さ・位置が違う)で、seed が違えば並びも変わる", () => {
    const darkest = Array.from({length: 20}, (_, i) =>
      Math.min(...sample(i, i + 1)),
    );
    expect(new Set(darkest.map((d) => d.toFixed(3))).size).toBeGreaterThan(10);
    expect(sample(0, 5, 0)).not.toEqual(sample(0, 5, 42));
  });

  it("平均の明るさ係数は、線の暗さと地の間にある", () => {
    expect(AVG_FACTOR).toBeLessThan(1);
    expect(AVG_FACTOR).toBeGreaterThan(1 - LINE_STRENGTH);
  });
});
