import {describe, expect, it} from "vitest";

import {assignCharts} from "../../../bake/meshes";
import {buildCoreGeometry, buildSheetsGeometry} from "../geometry";
import {buildMountain} from "../mountain";

const m = buildMountain("directory-1");

const expectUnitUV = (uv: {
  count: number;
  getX(i: number): number;
  getY(i: number): number;
}) => {
  for (let i = 0; i < uv.count; i++) {
    expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
    expect(uv.getX(i)).toBeLessThanOrEqual(1);
    expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
    expect(uv.getY(i)).toBeLessThanOrEqual(1);
  }
};

describe("buildCoreGeometry", () => {
  it("ベイクできる形: uv は [0,1]²、チャートは段ごとの側面と上面で、頂点はチャートをまたがない", () => {
    const g = buildCoreGeometry(m.core);
    expectUnitUV(g.getAttribute("uv"));
    expect(g.getAttribute("normal").count).toBe(
      g.getAttribute("position").count,
    );
    expect(assignCharts(g).chartCount).toBe(m.tierRadii.length * 2);
    expect(g.groups.reduce((sum, x) => sum + x.count, 0)).toBe(
      m.core.indices.length,
    );
  });
});

describe("buildSheetsGeometry", () => {
  const g = buildSheetsGeometry(m.sheets, m.looseSheets);
  const boxes = m.sheets.length + m.looseSheets.length;

  it("箱 1 つが 24 頂点・12 三角形・6 チャートで、ベイクできる形(uv は [0,1]²、頂点はチャートをまたがない)", () => {
    expect(g.getAttribute("position").count).toBe(boxes * 24);
    expect(g.getIndex()?.count).toBe(boxes * 36);
    expectUnitUV(g.getAttribute("uv"));
    expect(assignCharts(g).chartCount).toBe(boxes * 6);
  });

  it("板は、位置・向き・大きさどおりに置かれる(頂点の重心が板の中心、ローカル位置は -0.5〜0.5)", () => {
    const position = g.getAttribute("position");
    const local = g.getAttribute("bookLocal");
    const info = g.getAttribute("sheetInfo");
    [...m.sheets, ...m.looseSheets].forEach((s, b) => {
      const center = [0, 0, 0];
      for (let k = 0; k < 24; k++) {
        const i = b * 24 + k;
        center[0] = (center[0] as number) + position.getX(i) / 24;
        center[1] = (center[1] as number) + position.getY(i) / 24;
        center[2] = (center[2] as number) + position.getZ(i) / 24;
        expect(Math.abs(local.getX(i))).toBe(0.5);
        expect(Math.abs(local.getY(i))).toBe(0.5);
        expect(Math.abs(local.getZ(i))).toBe(0.5);
        expect(info.getX(i)).toBeCloseTo(s.size[0]);
        expect(info.getY(i)).toBeCloseTo(s.size[1]);
        expect(info.getZ(i)).toBeCloseTo(s.size[2]);
      }
      s.position.forEach((p, axis) => {
        expect(center[axis]).toBeCloseTo(p, 4);
      });
    });
  });

  it("束の本は yaw だけ回るので上面は水平。法線は単位長", () => {
    const normal = g.getAttribute("normal");
    const bookNormal = g.getAttribute("bookNormal");
    for (let i = 0; i < m.sheets.length * 24; i++) {
      expect(normal.getY(i)).toBeCloseTo(bookNormal.getY(i));
      expect(
        Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)),
      ).toBeCloseTo(1);
    }
  });

  it("はみ出す紙は、ローカル法線がすべて下向き(全面が無地)", () => {
    const bookNormal = g.getAttribute("bookNormal");
    for (let i = m.sheets.length * 24; i < boxes * 24; i++) {
      expect(bookNormal.getY(i)).toBe(-1);
    }
  });
});
