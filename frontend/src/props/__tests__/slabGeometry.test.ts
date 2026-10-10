import {BoxGeometry, type BufferGeometry, Group, Mesh, Vector3} from "three";
import {describe, expect, it} from "vitest";

import {assignCharts, buildBakeGeometry} from "../../bake/meshes";
import {buildSlabGeometry} from "../slabGeometry";
import type {Vec3} from "../types";

const SQUARE: Vec3[] = [
  [0, 0, 0],
  [2, 0, 0],
  [2, 0, 1],
  [0, 0, 1],
];
const TRIANGLE: Vec3[] = [
  [0, 0, 0],
  [4, 0, 0],
  [1, 0, 3],
];
const HEXAGON: Vec3[] = [
  [2, 1, 0],
  [1, 1, 1.7],
  [-1, 1, 1.7],
  [-2, 1, 0],
  [-1, 1, -1.7],
  [1, 1, -1.7],
];

const reversed = (polygon: Vec3[]): Vec3[] => [...polygon].reverse();

type Case = {name: string; polygon: Vec3[]; offset: Vec3};
const CASES: Case[] = [
  {name: "四角形・上へ", polygon: SQUARE, offset: [0, 0.5, 0]},
  {name: "四角形・下へ", polygon: SQUARE, offset: [0, -0.5, 0]},
  {name: "四角形(逆回り)", polygon: reversed(SQUARE), offset: [0, 0.5, 0]},
  {name: "三角形", polygon: TRIANGLE, offset: [0, 0.25, 0]},
  {
    name: "三角形(逆回り)・下へ",
    polygon: reversed(TRIANGLE),
    offset: [0, -1, 0],
  },
  {name: "六角形", polygon: HEXAGON, offset: [0, 0.3, 0]},
  {name: "斜めに押し出す", polygon: TRIANGLE, offset: [0.4, 0.5, -0.3]},
  {
    name: "鉛直な面(斜めの向き)",
    polygon: [
      [0, 0, 0],
      [3, 0, 3],
      [3, 2, 3],
      [0, 2, 0],
    ],
    offset: [0.125, 0, -0.125],
  },
];

const faceVertices = (geometry: BufferGeometry, group: number): Set<number> => {
  const {start, count} = geometry.groups[group] as {
    start: number;
    count: number;
  };
  const index = geometry.index as NonNullable<typeof geometry.index>;
  const set = new Set<number>();
  for (let k = start; k < start + count; k++) {
    set.add(index.getX(k));
  }
  return set;
};

const vertex = (geometry: BufferGeometry, name: string, i: number) => {
  const a = geometry.getAttribute(name);
  return new Vector3(a.getX(i), a.getY(i), a.getZ(i));
};

describe.each(CASES)("buildSlabGeometry($name)", ({polygon, offset}) => {
  const geometry = buildSlabGeometry(polygon, offset);
  const n = polygon.length;

  it("index があり、面(上・下・辺ごとの側面)ごとに 1 つの group を持つ", () => {
    expect(geometry.index).not.toBeNull();
    expect(geometry.groups).toHaveLength(n + 2);
    let next = 0;
    const seen = new Set<number>();
    geometry.groups.forEach((g, i) => {
      expect(g.start).toBe(next);
      expect(g.count % 3).toBe(0);
      next += g.count;
      for (const v of faceVertices(geometry, i)) {
        expect(seen.has(v)).toBe(false);
        seen.add(v);
      }
    });
    expect(next).toBe((geometry.index as {count: number}).count);
    expect(seen.size).toBe(geometry.getAttribute("position").count);
    expect(seen.size).toBe(2 * n + 4 * n);
    expect(geometry.groups.map((g) => g.count / 3)).toEqual([
      n - 2,
      n - 2,
      ...Array.from({length: n}, () => 2),
    ]);
  });

  it("法線は面ごとのフラットで、立体の中心から外へ向く", () => {
    const center = new Vector3();
    for (const p of [
      ...polygon,
      ...polygon.map((q) => [
        q[0] + offset[0],
        q[1] + offset[1],
        q[2] + offset[2],
      ]),
    ]) {
      center.add(new Vector3(...(p as Vec3)));
    }
    center.divideScalar(2 * n);
    geometry.groups.forEach((_, g) => {
      const verts = [...faceVertices(geometry, g)];
      const normal = vertex(geometry, "normal", verts[0] as number);
      expect(normal.length()).toBeCloseTo(1);
      const faceCenter = new Vector3();
      for (const v of verts) {
        expect(vertex(geometry, "normal", v).distanceTo(normal)).toBeLessThan(
          1e-6,
        );
        faceCenter.add(vertex(geometry, "position", v));
      }
      faceCenter.divideScalar(verts.length);
      expect(normal.dot(faceCenter.sub(center))).toBeGreaterThan(0);
    });
  });

  it("三角形の巻き(反時計回りに見える側)が法線と一致する", () => {
    const index = geometry.index as NonNullable<typeof geometry.index>;
    for (let k = 0; k < index.count; k += 3) {
      const [a, b, c] = [0, 1, 2].map((i) => index.getX(k + i)) as [
        number,
        number,
        number,
      ];
      const pa = vertex(geometry, "position", a);
      const geometric = new Vector3()
        .subVectors(vertex(geometry, "position", b), pa)
        .cross(new Vector3().subVectors(vertex(geometry, "position", c), pa));
      expect(geometric.lengthSq()).toBeGreaterThan(0);
      expect(
        geometric.normalize().dot(vertex(geometry, "normal", a)),
      ).toBeCloseTo(1);
    }
  });

  it("符号付きの体積が正(全面が外向きの巻き)で、底面積 x 厚み(法線方向)に等しい", () => {
    const index = geometry.index as NonNullable<typeof geometry.index>;
    let volume = 0;
    for (let k = 0; k < index.count; k += 3) {
      const [a, b, c] = [0, 1, 2].map((i) =>
        vertex(geometry, "position", index.getX(k + i)),
      ) as [Vector3, Vector3, Vector3];
      volume += a.dot(b.clone().cross(c)) / 6;
    }
    const base = polygon.map((p) => new Vector3(...p));
    const areaNormal = new Vector3();
    for (let i = 1; i < n - 1; i++) {
      areaNormal.add(
        new Vector3()
          .subVectors(base[i] as Vector3, base[0] as Vector3)
          .cross(
            new Vector3().subVectors(
              base[i + 1] as Vector3,
              base[0] as Vector3,
            ),
          ),
      );
    }
    const area = areaNormal.length() / 2;
    const height = Math.abs(areaNormal.normalize().dot(new Vector3(...offset)));
    expect(volume).toBeCloseTo(area * height, 5);
  });

  it("uv は面ごとに [0,1] へ正規化される(各軸で 0 と 1 を使い切る)", () => {
    const uv = geometry.getAttribute("uv");
    geometry.groups.forEach((_, g) => {
      const us: number[] = [];
      const vs: number[] = [];
      for (const v of faceVertices(geometry, g)) {
        us.push(uv.getX(v));
        vs.push(uv.getY(v));
      }
      for (const value of [...us, ...vs]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(Math.min(...us)).toBeCloseTo(0);
      expect(Math.max(...us)).toBeCloseTo(1);
      expect(Math.min(...vs)).toBeCloseTo(0);
      expect(Math.max(...vs)).toBeCloseTo(1);
    });
  });

  it("ベイクのチャート割り当て(assignCharts)が、面ごとに 1 チャートで例外なく通る", () => {
    const {chart, chartCount} = assignCharts(geometry);
    expect(chartCount).toBe(n + 2);
    expect(chart).toHaveLength(geometry.getAttribute("position").count);
    geometry.groups.forEach((_, g) => {
      for (const v of faceVertices(geometry, g)) {
        expect(chart[v]).toBe(g);
      }
    });
  });
});

describe("buildSlabGeometry の入力", () => {
  it("頂点が 3 つ未満の多角形は拒否する", () => {
    expect(() =>
      buildSlabGeometry(
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [0, 1, 0],
      ),
    ).toThrow();
  });

  it("offset が多角形の面と平行なら拒否する", () => {
    expect(() => buildSlabGeometry(SQUARE, [1, 0, 0])).toThrow();
    expect(() => buildSlabGeometry(SQUARE, [0, 0, 0])).toThrow();
  });

  it("一直線に並ぶ(面積 0 の)多角形は拒否する", () => {
    expect(() =>
      buildSlabGeometry(
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
        [0, 1, 0],
      ),
    ).toThrow();
  });

  it("位置は、多角形の頂点と、押し出した先の頂点だけ", () => {
    const geometry = buildSlabGeometry(SQUARE, [0, 0.5, 0]);
    const position = geometry.getAttribute("position");
    const allowed = new Set(
      SQUARE.flatMap(([x, y, z]) => [`${x},${y},${z}`, `${x},${y + 0.5},${z}`]),
    );
    for (let i = 0; i < position.count; i++) {
      expect(
        allowed.has(
          `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`,
        ),
      ).toBe(true);
    }
  });

  it("ベイク用の結合(buildBakeGeometry)に、箱と一緒に回した group の中でも載せられる", () => {
    const group = new Group();
    group.rotation.y = (2 * Math.PI) / 3;
    const slab = new Mesh(buildSlabGeometry(TRIANGLE, [0, 0.25, 0]));
    const box = new Mesh(new BoxGeometry(1, 1, 1));
    box.position.set(3, 0.5, 3);
    group.add(slab, box);
    group.updateMatrixWorld(true);

    const merged = buildBakeGeometry([slab, box]);

    expect(merged.userData.chartCount).toBe(5 + 6);
    expect(merged.getAttribute("chart")).toBeDefined();
  });
});
