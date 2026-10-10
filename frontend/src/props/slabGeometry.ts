import {BufferGeometry, Float32BufferAttribute, Vector3} from "three";

import type {Vec3} from "./types";

/** 多角形の板(柱)の仕様。polygon を offset だけ押し出した立体(buildSlabGeometry・Slab に渡す) */
export type SlabSpec = {polygon: readonly Vec3[]; offset: Vec3};

const fanNormal = (points: readonly Vector3[]): Vector3 => {
  const normal = new Vector3();
  const edgeA = new Vector3();
  const edgeB = new Vector3();
  const origin = points[0] as Vector3;
  for (let i = 1; i < points.length - 1; i++) {
    edgeA.subVectors(points[i] as Vector3, origin);
    edgeB.subVectors(points[i + 1] as Vector3, origin);
    normal.add(edgeA.cross(edgeB));
  }
  return normal;
};

const mean = (points: readonly Vector3[]): Vector3 =>
  points
    .reduce((sum, p) => sum.add(p), new Vector3())
    .divideScalar(points.length);

/**
 * 凸多角形を offset だけ押し出した板(柱)のジオメトリ。箱(BoxGeometry)以外の、床・斜めの壁・屋根などに使う。
 * 多角形は同一平面上の凸で、offset はその平面に平行でないこと(頂点の並びは時計回りでも反時計回りでもよい)。
 * ベイク AO(bake/meshes.ts の assignCharts)に載せられるよう、BoxGeometry と同じ作りにする:
 * - index あり。面(多角形の上下 2 面と、辺ごとの側面の四角形)ごとに頂点を分け、面ごとに 1 つの group(= 1 チャート)。
 *   group の並びは、多角形の面(polygon)、押し出した先の面、辺 i(polygon[i]〜polygon[i+1])の側面
 * - 法線は面ごとのフラットで、立体の中心(全頂点の平均)から外へ向く。三角形の巻きも法線と同じ向き(表面カリングで消えない)
 * - uv は面ごとに、面内の 2D 基底(最初の辺の向きと、法線との外積)へ投影して [0,1] へ正規化する(BoxGeometry の面と同じく、面いっぱいに引き伸ばす)
 */
export const buildSlabGeometry = (
  polygon: readonly Vec3[],
  offset: Vec3,
): BufferGeometry => {
  const count = polygon.length;
  if (count < 3) {
    throw new Error("[slab] 多角形は 3 頂点以上が必要です");
  }
  const base = polygon.map((p) => new Vector3(...p));
  const shift = new Vector3(...offset);
  const baseNormal = fanNormal(base).normalize();
  if (
    baseNormal.lengthSq() === 0 ||
    Math.abs(baseNormal.dot(shift)) < 1e-9 * Math.max(1, shift.length())
  ) {
    throw new Error(
      "[slab] 多角形が潰れているか、offset が多角形の面と平行です",
    );
  }
  const cap = base.map((p) => p.clone().add(shift));
  const center = mean([...base, ...cap]);

  const faces: Vector3[][] = [
    base,
    cap,
    ...base.map((p, i) => {
      const j = (i + 1) % count;
      return [p, base[j] as Vector3, cap[j] as Vector3, cap[i] as Vector3];
    }),
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const geometry = new BufferGeometry();

  for (const face of faces) {
    let points = face;
    let normal = fanNormal(points);
    if (normal.dot(mean(points).sub(center)) < 0) {
      points = [...points].reverse();
      normal = fanNormal(points);
    }
    if (normal.lengthSq() === 0) {
      throw new Error("[slab] 面積が 0 の面があります");
    }
    normal.normalize();

    const origin = points[0] as Vector3;
    const u = new Vector3()
      .subVectors(points[1] as Vector3, origin)
      .normalize();
    const v = new Vector3().crossVectors(normal, u);
    const local = points.map((p) => {
      const d = new Vector3().subVectors(p, origin);
      return [d.dot(u), d.dot(v)] as const;
    });
    const us = local.map(([x]) => x);
    const vs = local.map(([, y]) => y);
    const [uMin, uMax] = [Math.min(...us), Math.max(...us)];
    const [vMin, vMax] = [Math.min(...vs), Math.max(...vs)];
    const uSpan = Math.max(uMax - uMin, 1e-9);
    const vSpan = Math.max(vMax - vMin, 1e-9);

    const first = positions.length / 3;
    const indexStart = indices.length;
    points.forEach((p, i) => {
      const [x, y] = local[i] as readonly [number, number];
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push((x - uMin) / uSpan, (y - vMin) / vSpan);
    });
    for (let i = 1; i < points.length - 1; i++) {
      indices.push(first, first + i, first + i + 1);
    }
    geometry.addGroup(indexStart, indices.length - indexStart, 0);
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
};
