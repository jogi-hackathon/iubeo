import {describe, expect, it} from "vitest";

import {EYE_HEIGHT} from "../../player/constants";
import {
  FLOOR_EYE_HEIGHT,
  RISE_DURATION_MS,
  RISE_KEYS,
  riseAt,
  riseEyeHeight,
} from "../rise";

describe("riseAt", () => {
  it("床すれすれで 80 度以上横に傾いた状態から始まる", () => {
    const start = riseAt(0);
    expect(riseEyeHeight(start.height)).toBeLessThanOrEqual(0.3);
    expect(start.roll).toBeGreaterThanOrEqual((80 * Math.PI) / 180);
    expect(start.roll).toBeLessThanOrEqual((90 * Math.PI) / 180);
  });

  it("最後は通常の一人称カメラにぴったり一致し、それ以降も動かない", () => {
    const end = riseAt(RISE_DURATION_MS);
    expect(riseEyeHeight(end.height)).toBe(EYE_HEIGHT);
    expect(end.roll).toBe(0);
    expect(end.pitch).toBe(0);
    expect(riseAt(RISE_DURATION_MS + 5000)).toEqual(end);
  });

  it("長さは 2.5〜3 秒で、キーフレームの時刻は増えていく", () => {
    expect(RISE_DURATION_MS).toBeGreaterThanOrEqual(2500);
    expect(RISE_DURATION_MS).toBeLessThanOrEqual(3000);
    RISE_KEYS.slice(1).forEach((key, i) => {
      expect(key.ms).toBeGreaterThan(RISE_KEYS[i]!.ms);
    });
  });

  it("途中で一度沈み込み(高さが戻る)、傾きは最初より中盤のほうが小さい", () => {
    const heights = RISE_KEYS.map((k) => k.height);
    expect(heights.some((h, i) => i > 0 && h < heights[i - 1]!)).toBe(true);
    expect(riseAt(RISE_DURATION_MS / 2).roll).toBeLessThan(riseAt(0).roll);
  });

  it("キーフレームの間でカメラが飛ばない", () => {
    let prev = riseAt(0);
    for (let ms = 10; ms <= RISE_DURATION_MS; ms += 10) {
      const now = riseAt(ms);
      expect(Math.abs(now.height - prev.height)).toBeLessThan(0.05);
      expect(Math.abs(now.roll - prev.roll)).toBeLessThan(0.1);
      prev = now;
    }
  });
});

describe("riseEyeHeight", () => {
  it("0 で床すれすれ、1 で通常の目の高さ", () => {
    expect(riseEyeHeight(0)).toBe(FLOOR_EYE_HEIGHT);
    expect(riseEyeHeight(1)).toBe(EYE_HEIGHT);
  });
});
