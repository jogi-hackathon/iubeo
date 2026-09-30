import { describe, expect, it } from "vitest";
import {
  type AtlasRect,
  dilateChart,
  packAtlas,
  writeChartToAtlas,
} from "../atlas";
import { texelsFor } from "../charts";
import { HIDDEN_TEXELS, PAD } from "../params";

// PAD を含めた矩形どうしが重ならないこと
const overlaps = (a: AtlasRect, b: AtlasRect): boolean => {
  const ax0 = a.x - PAD;
  const ay0 = a.y - PAD;
  const ax1 = a.x + a.w + PAD;
  const ay1 = a.y + a.h + PAD;
  const bx0 = b.x - PAD;
  const by0 = b.y - PAD;
  const bx1 = b.x + b.w + PAD;
  const by1 = b.y + b.h + PAD;
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
};

describe("packAtlas", () => {
  const packed = packAtlas(4, [0, 1, 0, 1], [1, 3, 0.5, 2], [1, 3, 0.25, 2]);

  it("hidden チャートは HIDDEN_TEXELS 四方に縮む", () => {
    for (const c of [1, 3]) {
      expect(packed.sizes[c]).toEqual({ w: HIDDEN_TEXELS, h: HIDDEN_TEXELS });
      expect(packed.rects[c]?.w).toBe(HIDDEN_TEXELS);
      expect(packed.rects[c]?.h).toBe(HIDDEN_TEXELS);
    }
  });

  it("通常チャートは texelsFor のテクセル数になる", () => {
    expect(packed.sizes[0]).toEqual({ w: texelsFor(1), h: texelsFor(1) });
    expect(packed.sizes[2]).toEqual({ w: texelsFor(0.5), h: texelsFor(0.25) });
  });

  it("rects が(PAD 込みで)重ならず、アトラス内に収まる", () => {
    const { rects, atlasW, atlasH } = packed;
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(PAD);
      expect(r.y).toBeGreaterThanOrEqual(PAD);
      expect(r.x + r.w + PAD).toBeLessThanOrEqual(atlasW);
      expect(r.y + r.h + PAD).toBeLessThanOrEqual(atlasH);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i] as AtlasRect, rects[j] as AtlasRect)).toBe(
          false,
        );
      }
    }
  });

  it("texelTotal は内側矩形の面積の合計", () => {
    const sum = packed.sizes.reduce((s, z) => s + z.w * z.h, 0);
    expect(packed.texelTotal).toBe(sum);
  });
});

describe("dilateChart", () => {
  it("無効テクセルを有効な 8 近傍の平均で埋める", () => {
    // 3x1: [0, 無効, 100] -> 真ん中は平均 50
    const out = dilateChart(Int32Array.from([0, -1, 100]), 3, 1);
    expect(Array.from(out)).toEqual([0, 50, 100]);
  });

  it("有効テクセルはそのまま保つ", () => {
    const out = dilateChart(Int32Array.from([10, 20, 30, 40]), 2, 2);
    expect(Array.from(out)).toEqual([10, 20, 30, 40]);
  });

  it("離れた無効テクセルも反復して埋める", () => {
    const out = dilateChart(Int32Array.from([80, -1, -1, -1]), 4, 1);
    expect(Array.from(out)).toEqual([80, 80, 80, 80]);
  });

  it("全部無効なら 0", () => {
    const out = dilateChart(new Int32Array(9).fill(-1), 3, 3);
    expect(Array.from(out)).toEqual(new Array(9).fill(0));
  });
});

describe("writeChartToAtlas", () => {
  it("PAD 分だけチャート端のテクセルを引き伸ばして書く", () => {
    const atlas = new Uint8Array(4 * 4);
    writeChartToAtlas(
      atlas,
      4,
      4,
      { x: 1, y: 1, w: 2, h: 2 },
      2,
      2,
      [1, 2, 3, 4],
    );
    expect(Array.from(atlas)).toEqual([
      1,
      1,
      2,
      2, //
      1,
      1,
      2,
      2, //
      3,
      3,
      4,
      4, //
      3,
      3,
      4,
      4,
    ]);
  });
});
