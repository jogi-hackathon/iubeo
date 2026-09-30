import { BoxGeometry, Mesh, SphereGeometry } from "three";
import { describe, expect, it } from "vitest";
import {
  atlasUV,
  type BakedAOLayout,
  findLayoutMismatch,
  parseLayout,
  serializeLayout,
} from "./format";
import { assignCharts, meshSignature } from "./meshes";

const layout: BakedAOLayout = {
  atlasW: 64,
  atlasH: 32,
  meshes: [
    { vertexCount: 24, chartCount: 6, center: [1, 2, 3] },
    { vertexCount: 4, chartCount: 1, center: [-1.5, 0, 0.25] },
  ],
  rects: Array.from({ length: 7 }, (_, i) => ({
    x: i * 8 + 1,
    y: 1,
    w: 6,
    h: 4,
  })),
};

describe("bake format", () => {
  it("serialize → parse で元に戻る", () => {
    const bytes = serializeLayout(layout);
    const copy = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    expect(parseLayout(copy)).toEqual(layout);
  });

  it("形式・サイズが違えば例外", () => {
    const bytes = serializeLayout(layout);
    expect(() =>
      parseLayout(bytes.buffer.slice(0, bytes.length - 1)),
    ).toThrow();
    bytes[0] = 0;
    expect(() => parseLayout(bytes.buffer)).toThrow();
  });

  it("mesh の数・形・位置が違えば理由を返し、一致なら null", () => {
    expect(findLayoutMismatch(layout, layout.meshes)).toBeNull();
    expect(findLayoutMismatch(layout, layout.meshes.slice(1))).toMatch(
      /mesh 数/,
    );
    expect(
      findLayoutMismatch(layout, [
        {
          ...(layout.meshes[0] as BakedAOLayout["meshes"][number]),
          vertexCount: 25,
        },
        layout.meshes[1] as BakedAOLayout["meshes"][number],
      ]),
    ).toMatch(/形/);
    expect(
      findLayoutMismatch(layout, [
        layout.meshes[0] as BakedAOLayout["meshes"][number],
        { vertexCount: 4, chartCount: 1, center: [-1.5, 0.1, 0.25] },
      ]),
    ).toMatch(/位置/);
  });

  it("atlasUV はチャートの端のテクセル中心に写す", () => {
    // チャート 6(= 2つ目の mesh のチャート 0)は x=49, y=1, 6x4
    const uv = atlasUV([0, 0, 1, 1], [0, 0], 6, layout);
    expect(uv[0]).toBeCloseTo((49 + 0.5) / 64);
    expect(uv[1]).toBeCloseTo((1 + 0.5) / 32);
    expect(uv[2]).toBeCloseTo((49 + 0.5 + 5) / 64);
    expect(uv[3]).toBeCloseTo((1 + 0.5 + 3) / 32);
  });
});

describe("bake meshes", () => {
  it("BoxGeometry は面ごとに6チャート、各頂点は所属面のチャート", () => {
    const box = new BoxGeometry(1, 1, 1);
    const { chart, chartCount } = assignCharts(box);
    expect(chartCount).toBe(6);
    for (const [id, g] of box.groups.entries()) {
      for (let k = g.start; k < g.start + g.count; k++) {
        expect(chart[box.index?.getX(k) ?? -1]).toBe(id);
      }
    }
  });

  it("SphereGeometry は全体で1チャート", () => {
    const { chart, chartCount } = assignCharts(new SphereGeometry(1, 8, 6));
    expect(chartCount).toBe(1);
    expect(chart.every((c) => c === 0)).toBe(true);
  });

  it("meshSignature はワールド座標の中心を返す", () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    mesh.position.set(3, 1, -4);
    const sig = meshSignature(mesh);
    expect(sig.vertexCount).toBe(24);
    expect(sig.chartCount).toBe(6);
    expect(sig.center).toEqual([3, 1, -4]);
  });
});
