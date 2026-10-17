import {describe, expect, it} from "vitest";

import {
  cellHash,
  glitchPulseAt,
  largeBlockWeightOf,
  shiftStepAt,
  shiftedBlocksAt,
  revealClipPath,
} from "../glitch";

const W = 1920;
const H = 1080;

describe("glitchPulseAt", () => {
  it("決まった時間の中だけ強くなり、1/4 の時点で山になる", () => {
    expect(glitchPulseAt(0, 900)).toBe(0);
    expect(glitchPulseAt(900, 900)).toBe(0);
    expect(glitchPulseAt(225, 900)).toBeCloseTo(1);
  });
});

describe("cellHash", () => {
  it("同じ入力なら同じ値で、0 以上 1 未満に収まる", () => {
    for (let i = 0; i < 200; i++) {
      const v = cellHash(i, i * 3, i * 7, 100);
      expect(v).toBe(cellHash(i, i * 3, i * 7, 100));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shiftStepAt", () => {
  it("時間に対して単調に増え、同じ区間の中では変わらない", () => {
    let prev = -1;
    for (let ms = 0; ms < 3000; ms += 7) {
      const step = shiftStepAt(ms);
      expect(step).toBeGreaterThanOrEqual(prev);
      prev = step;
    }
    expect(shiftStepAt(1)).toBe(shiftStepAt(2));
    expect(shiftStepAt(1000)).toBe(24);
  });
});

describe("shiftedBlocksAt", () => {
  it("強さが 0 なら何もずらさない", () => {
    expect(largeBlockWeightOf(0)).toBe(0);
    for (let step = 0; step < 30; step++) {
      expect(shiftedBlocksAt(step, 0, W, H)).toEqual([]);
    }
  });

  it("同じ入力なら同じブロックがずれる", () => {
    expect(shiftedBlocksAt(5, 1, W, H)).toEqual(shiftedBlocksAt(5, 1, W, H));
  });

  it("強いほど多くずれ、上限の 10 を超えない", () => {
    const counts = [0.3, 0.6, 1].map((strength) =>
      Array.from({length: 40}, (_, step) =>
        shiftedBlocksAt(step, strength, W, H),
      ).map((blocks) => blocks.length),
    );
    const sums = counts.map((c) => c.reduce((a, b) => a + b, 0));
    expect(sums[1]!).toBeGreaterThan(sums[0]!);
    expect(sums[2]!).toBeGreaterThan(sums[1]!);
    expect(Math.max(...counts.flat())).toBeLessThanOrEqual(10);
  });

  it("ずれ幅はブロック幅の ±1〜3 倍で、画面内のブロックを選ぶ", () => {
    for (let step = 0; step < 40; step++) {
      for (const b of shiftedBlocksAt(step, 1, W, H)) {
        const blocks = b.shift / b.width;
        expect(Number.isInteger(blocks)).toBe(true);
        expect(Math.abs(blocks)).toBeGreaterThanOrEqual(1);
        expect(Math.abs(blocks)).toBeLessThanOrEqual(3);
        expect(b.x).toBeLessThan(W);
        expect(b.y).toBeLessThan(H);
      }
    }
  });
});

describe("revealClipPath", () => {
  const rects = (clip: string) =>
    Array.from(clip.matchAll(/M(\d+) (\d+)h(-?\d+)v(\d+)/g), (m) =>
      m.slice(1, 5).map(Number),
    );

  it("始まりは何も見せず、終わりは画面を全部覆う", () => {
    expect(revealClipPath(0, 1280, 720)).toBe("inset(50%)");
    const full = rects(revealClipPath(1, 1280, 720));
    const area = full.reduce((sum, [, , w, h]) => sum + w! * h!, 0);
    expect(area).toBeGreaterThanOrEqual(1280 * 720);
  });

  it("途中は中央のブロックから開き、ブロックは格子に揃う", () => {
    const mid = rects(revealClipPath(0.3, 1280, 720));
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.every(([x, y]) => x! % 18 === 0 && y! % 18 === 0)).toBe(true);
    const ys = mid.map(([, y]) => y!);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(720 - 18);
  });
});
