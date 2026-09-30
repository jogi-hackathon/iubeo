import {BufferAttribute, BufferGeometry} from "three";
import {describe, expect, it} from "vitest";

import {
  buildChartIndex,
  buildChartTriangles,
  type ChartTri,
  chartPhysicalSize,
  insetPosition,
  queryChart,
  texelsFor,
} from "./charts";
import {MAX_TEXELS, MIN_TEXELS, TEXEL} from "./params";

// XY 平面上の (0,0)-(sx,sy) の四角形(法線 +Z、uv は [0,1]²)を 2 三角形で作る
const plane = (sx: number, sy: number): ChartTri[] => {
  const n = [0, 0, 1];
  return [
    {
      p: [0, 0, 0, sx, 0, 0, sx, sy, 0],
      n: [...n, ...n, ...n] as ChartTri["n"],
      uv: [0, 0, 1, 0, 1, 1],
    },
    {
      p: [0, 0, 0, sx, sy, 0, 0, sy, 0],
      n: [...n, ...n, ...n] as ChartTri["n"],
      uv: [0, 0, 1, 1, 0, 1],
    },
  ];
};

describe("queryChart", () => {
  const idx = buildChartIndex(plane(1, 1));

  it("中心・角で正しい位置と法線を返す", () => {
    const center = queryChart(idx, 0.5, 0.5);
    expect(center).not.toBeNull();
    expect(center?.px).toBeCloseTo(0.5);
    expect(center?.py).toBeCloseTo(0.5);
    expect(center?.pz).toBeCloseTo(0);
    expect([center?.nx, center?.ny, center?.nz]).toEqual([0, 0, 1]);

    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      const hit = queryChart(idx, u, v);
      expect(hit).not.toBeNull();
      expect(hit?.px).toBeCloseTo(u);
      expect(hit?.py).toBeCloseTo(v);
      expect(hit?.nz).toBeCloseTo(1);
    }
  });

  it("チャートの外は null", () => {
    expect(queryChart(idx, 1.5, 0.5)).toBeNull();
    expect(queryChart(idx, -0.1, 0.5)).toBeNull();
    expect(queryChart(idx, 0.5, 1.2)).toBeNull();
  });

  it("insetPosition は三角形の重心方向へ寄せる(縁の点でも面内に残る)", () => {
    const hit = queryChart(idx, 0, 0);
    if (!hit) {
      throw new Error("hit が null");
    }
    const [x, y, z] = insetPosition(hit);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(z).toBe(0);
    expect(Math.hypot(x, y)).toBeLessThan(0.001);
  });
});

describe("chartPhysicalSize", () => {
  it("2m x 1m の平面で {2,1}", () => {
    const size = chartPhysicalSize(plane(2, 1));
    expect(size.width).toBeCloseTo(2);
    expect(size.height).toBeCloseTo(1);
  });

  it("三角形が無ければ最小サイズ", () => {
    const size = chartPhysicalSize([]);
    expect(size.width).toBeCloseTo(TEXEL * MIN_TEXELS);
    expect(size.height).toBeCloseTo(TEXEL * MIN_TEXELS);
  });
});

describe("texelsFor", () => {
  it("サイズに応じたテクセル数(ceil(size / TEXEL) + 1)", () => {
    expect(texelsFor(1)).toBe(Math.ceil(1 / TEXEL) + 1);
  });

  it("MIN_TEXELS / MAX_TEXELS に clamp する", () => {
    expect(texelsFor(0)).toBe(MIN_TEXELS);
    expect(texelsFor(0.001)).toBe(MIN_TEXELS);
    expect(texelsFor(1000)).toBe(MAX_TEXELS);
  });
});

describe("buildChartTriangles", () => {
  it("chart 属性ごとに三角形をグループ化する", () => {
    // 2 つの四角形(チャート 0 / 1)。1 つめは z=0、2 つめは z=1
    const geometry = new BufferGeometry();
    const position = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
    const positions = [
      ...position,
      ...position.map((v, i) => (i % 3 === 2 ? 1 : v)),
    ];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    const normals = Array.from({length: 8}, () => [0, 0, 1]).flat();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3),
    );
    geometry.setAttribute(
      "normal",
      new BufferAttribute(new Float32Array(normals), 3),
    );
    geometry.setAttribute(
      "uv",
      new BufferAttribute(new Float32Array([...uvs, ...uvs]), 2),
    );
    geometry.setAttribute(
      "chart",
      new BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    geometry.userData.chartCount = 2;

    const tris = buildChartTriangles(geometry);
    expect(tris).toHaveLength(2);
    expect(tris[0]).toHaveLength(2);
    expect(tris[1]).toHaveLength(2);
    expect(tris[1]?.[0]?.p[2]).toBe(1);
    expect(tris[0]?.[0]?.uv).toEqual([0, 0, 1, 0, 1, 1]);
  });
});
