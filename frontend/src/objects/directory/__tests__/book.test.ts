import {describe, expect, it} from "vitest";

import type {Vec3} from "../../../props/types";
import {
  bookPart,
  COVER_THICKNESS,
  coverThickness,
  PAGE_SHADE,
  PAGE_SHADOW,
  PAGE_SHADOW_DEPTH,
  pageShade,
  SPINE_BOARD,
  spineSign,
} from "../book";

const SIZE: Vec3 = [0.6, 0.2, 0.4];

describe("coverThickness", () => {
  it("厚い本では一定、薄い本では厚みに対する割合で頭打ち", () => {
    expect(coverThickness(0.2)).toBe(COVER_THICKNESS);
    expect(coverThickness(0.04)).toBeLessThan(COVER_THICKNESS);
    expect(coverThickness(0.04) * 2).toBeLessThan(0.04);
  });
});

describe("spineSign", () => {
  it("seed ごとに決まり、両方の向きが出る", () => {
    const signs = Array.from({length: 50}, (_, i) => spineSign(i * 0.618));
    expect(signs).toContain(1);
    expect(signs).toContain(-1);
    expect(spineSign(3.2)).toBe(spineSign(3.2));
  });
});

describe("bookPart", () => {
  it("上面・下面は表紙", () => {
    expect(bookPart([0, 1, 0], [0, 0.5, 0], SIZE, 1)).toBe("cover");
    expect(bookPart([0, -1, 0], [0.2, -0.5, 0.1], SIZE, -1)).toBe("cover");
  });

  it("背の側の長辺は背表紙、反対の長辺(前小口)はページ", () => {
    expect(bookPart([0, 0, 1], [0, 0, 0.5], SIZE, 1)).toBe("spine");
    expect(bookPart([0, 0, -1], [0, 0, -0.5], SIZE, 1)).toBe("pages");
    expect(bookPart([0, 0, -1], [0, 0, -0.5], SIZE, -1)).toBe("spine");
    expect(bookPart([0, 0, 1], [0, 0, 0.5], SIZE, -1)).toBe("pages");
  });

  it("小口の上下の端は、表紙の板の断面", () => {
    const inCover = 0.5 - (COVER_THICKNESS * 0.5) / SIZE[1];
    const inPages = 0.5 - (COVER_THICKNESS * 1.5) / SIZE[1];
    for (const y of [inCover, -inCover]) {
      expect(bookPart([0, 0, -1], [0, y, -0.5], SIZE, 1)).toBe("cover");
    }
    for (const y of [inPages, -inPages]) {
      expect(bookPart([0, 0, -1], [0, y, -0.5], SIZE, 1)).toBe("pages");
    }
  });

  it("天・地の面は、背の側の端だけ背表紙の板の断面で、残りはページ", () => {
    const nearSpine = 0.5 - (SPINE_BOARD * 0.5) / SIZE[2];
    expect(bookPart([1, 0, 0], [0.5, 0, nearSpine], SIZE, 1)).toBe("cover");
    expect(bookPart([1, 0, 0], [0.5, 0, 0], SIZE, 1)).toBe("pages");
    expect(bookPart([1, 0, 0], [0.5, 0, -nearSpine], SIZE, 1)).toBe("pages");
    expect(bookPart([-1, 0, 0], [-0.5, 0, -nearSpine], SIZE, -1)).toBe("cover");
  });
});

describe("pageShade", () => {
  it("表紙のすぐ下は影で暗く、離れるとページの地の明るさ。白に近い範囲に収まる", () => {
    expect(pageShade(0)).toBeCloseTo(PAGE_SHADOW);
    expect(pageShade(PAGE_SHADOW_DEPTH)).toBeCloseTo(PAGE_SHADE);
    expect(pageShade(1)).toBeCloseTo(PAGE_SHADE);
    expect(pageShade(PAGE_SHADOW_DEPTH / 2)).toBeGreaterThan(PAGE_SHADOW);
    expect(pageShade(PAGE_SHADOW_DEPTH / 2)).toBeLessThan(PAGE_SHADE);
    expect(PAGE_SHADOW).toBeGreaterThan(0.8);
  });
});
