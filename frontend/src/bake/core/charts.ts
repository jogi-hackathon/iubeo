// チャート(UV アイランド)の三角形収集・物理サイズ・チャート内の点クエリ。
import type {BufferGeometry} from "three";

import {CHART_INSET, clamp, MAX_TEXELS, MIN_TEXELS, TEXEL} from "./params";

// ---------------------------------------------------------------- 型

export type Tuple9 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Tuple6 = [number, number, number, number, number, number];

/** チャート内の1三角形。p / n は 3 頂点分の位置・法線(xyz 連続)、uv は 3 頂点分の (u,v) */
export type ChartTri = {p: Tuple9; n: Tuple9; uv: Tuple6};

export type ChartSize = {width: number; height: number};

/** チャート内の点クエリの結果。p* = 位置、n* = 正規化済み法線、c* = ヒットした三角形の重心 */
export type ChartHit = {
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  cx: number;
  cy: number;
  cz: number;
};

/** uv 空間の n x n 格子に三角形をバケット分けした索引 */
export type ChartIndex = {n: number; cells: ChartTri[][]};

// ---------------------------------------------------------------- チャート三角形の収集

// 頂点の chart 属性でグループ化した三角形リストを返す。groups は index 範囲を分けているので
// 1三角形の3頂点は必ず同じチャートに属する(assignCharts が保証する)。
export const buildChartTriangles = (geometry: BufferGeometry): ChartTri[][] => {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const chartAttr = geometry.attributes.chart;
  const index = geometry.index;
  const chartCount = geometry.userData.chartCount;
  if (!pos || !nor || !uv || !chartAttr || !index) {
    throw new Error(
      "[bake] index / position / normal / uv / chart 属性が必要です",
    );
  }
  if (typeof chartCount !== "number") {
    throw new Error("[bake] geometry.userData.chartCount が必要です");
  }
  const tris: ChartTri[][] = Array.from({length: chartCount}, () => []);
  for (let f = 0; f < index.count; f += 3) {
    const ia = index.getX(f);
    const ib = index.getX(f + 1);
    const ic = index.getX(f + 2);
    const chart = chartAttr.getX(ia);
    const list = tris[chart];
    if (!list) {
      throw new Error(
        `[bake] chart 属性が範囲外です: ${chart} (chartCount=${chartCount})`,
      );
    }
    list.push({
      p: [
        pos.getX(ia),
        pos.getY(ia),
        pos.getZ(ia),
        pos.getX(ib),
        pos.getY(ib),
        pos.getZ(ib),
        pos.getX(ic),
        pos.getY(ic),
        pos.getZ(ic),
      ],
      n: [
        nor.getX(ia),
        nor.getY(ia),
        nor.getZ(ia),
        nor.getX(ib),
        nor.getY(ib),
        nor.getZ(ib),
        nor.getX(ic),
        nor.getY(ic),
        nor.getZ(ic),
      ],
      uv: [
        uv.getX(ia),
        uv.getY(ia),
        uv.getX(ib),
        uv.getY(ib),
        uv.getX(ic),
        uv.getY(ic),
      ],
    });
  }
  return tris;
};

// チャートの物理サイズ(m)。三角形ごとのヤコビアン |dP/du|, |dP/dv| を uv 面積で重み付き平均する
export const chartPhysicalSize = (tris: ChartTri[]): ChartSize => {
  let areaSum = 0;
  let duSum = 0;
  let dvSum = 0;
  for (const t of tris) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.p;
    const [u0, v0, u1, v1, u2, v2] = t.uv;
    const e1u = u1 - u0;
    const e1v = v1 - v0;
    const e2u = u2 - u0;
    const e2v = v2 - v0;
    const det = e1u * e2v - e2u * e1v;
    const area = Math.abs(det) * 0.5;
    if (area < 1e-12) {
      continue;
    }
    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;
    const invDet = 1 / det;
    const dux = (e1x * e2v - e2x * e1v) * invDet;
    const duy = (e1y * e2v - e2y * e1v) * invDet;
    const duz = (e1z * e2v - e2z * e1v) * invDet;
    const dvx = (e2x * e1u - e1x * e2u) * invDet;
    const dvy = (e2y * e1u - e1y * e2u) * invDet;
    const dvz = (e2z * e1u - e1z * e2u) * invDet;
    areaSum += area;
    duSum += Math.hypot(dux, duy, duz) * area;
    dvSum += Math.hypot(dvx, dvy, dvz) * area;
  }
  if (areaSum < 1e-12) {
    return {width: TEXEL * MIN_TEXELS, height: TEXEL * MIN_TEXELS};
  }
  return {width: duSum / areaSum, height: dvSum / areaSum};
};

export const texelsFor = (size: number): number =>
  clamp(Math.ceil(size / TEXEL) + 1, MIN_TEXELS, MAX_TEXELS);

// ---------------------------------------------------------------- チャート内の点 → 位置・法線

const BARY_EPS = 1e-4;

// 三角形の uv 空間で点 (u,v) の重心座標を返す。三角形の外なら null(境界は epsilon で含める)
const baryOfUV = (
  u: number,
  v: number,
  t: ChartTri,
): [number, number, number] | null => {
  const [u0, v0, u1, v1, u2, v2] = t.uv;
  const e1x = u1 - u0;
  const e1y = v1 - v0;
  const e2x = u2 - u0;
  const e2y = v2 - v0;
  const px = u - u0;
  const py = v - v0;
  const d00 = e1x * e1x + e1y * e1y;
  const d01 = e1x * e2x + e1y * e2y;
  const d11 = e2x * e2x + e2y * e2y;
  const d20 = px * e1x + py * e1y;
  const d21 = px * e2x + py * e2y;
  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-12) {
    return null;
  }
  const b1 = (d11 * d20 - d01 * d21) / denom;
  const b2 = (d00 * d21 - d01 * d20) / denom;
  const b0 = 1 - b1 - b2;
  if (b0 < -BARY_EPS || b1 < -BARY_EPS || b2 < -BARY_EPS) {
    return null;
  }
  return [b0, b1, b2];
};

const interpolateHit = (
  t: ChartTri,
  bc: [number, number, number],
): ChartHit => {
  const [b0, b1, b2] = bc;
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = t.p;
  const [n0x, n0y, n0z, n1x, n1y, n1z, n2x, n2y, n2z] = t.n;
  const px = b0 * ax + b1 * bx + b2 * cx;
  const py = b0 * ay + b1 * by + b2 * cy;
  const pz = b0 * az + b1 * bz + b2 * cz;
  let nx = b0 * n0x + b1 * n1x + b2 * n2x;
  let ny = b0 * n0y + b1 * n1y + b2 * n2y;
  let nz = b0 * n0z + b1 * n1z + b2 * n2z;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  return {
    px,
    py,
    pz,
    nx,
    ny,
    nz,
    cx: (ax + bx + cx) / 3,
    cy: (ay + by + cy) / 3,
    cz: (az + bz + cz) / 3,
  };
};

// チャートの三角形を uv 空間の格子(だいたい1三角形/セル)にバケット分けして、点クエリを高速化する
// (書類の束や壁のような、面ごとの三角形数が多いチャートで線形探索を避けるため)
export const buildChartIndex = (tris: ChartTri[]): ChartIndex => {
  const n = Math.max(1, Math.ceil(Math.sqrt(tris.length)));
  const cells: ChartTri[][] = Array.from({length: n * n}, () => []);
  for (const t of tris) {
    const [u0, v0, u1, v1, u2, v2] = t.uv;
    const minU = Math.min(u0, u1, u2);
    const maxU = Math.max(u0, u1, u2);
    const minV = Math.min(v0, v1, v2);
    const maxV = Math.max(v0, v1, v2);
    const cx0 = clamp(Math.floor(minU * n), 0, n - 1);
    const cx1 = clamp(Math.floor(maxU * n), 0, n - 1);
    const cy0 = clamp(Math.floor(minV * n), 0, n - 1);
    const cy1 = clamp(Math.floor(maxV * n), 0, n - 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        cells[cy * n + cx]?.push(t);
      }
    }
  }
  return {n, cells};
};

export const queryChart = (
  idx: ChartIndex,
  u: number,
  v: number,
): ChartHit | null => {
  const {n, cells} = idx;
  const cx = clamp(Math.floor(u * n), 0, n - 1);
  const cy = clamp(Math.floor(v * n), 0, n - 1);
  const bucket = cells[cy * n + cx] ?? [];
  for (const t of bucket) {
    const bc = baryOfUV(u, v, t);
    if (bc) {
      return interpolateHit(t, bc);
    }
  }
  return null;
};

// 面の縁ちょうどで自己交差・埋まりが起きないよう、チャート内側(三角形の重心方向)へわずかに寄せる
export const insetPosition = (hit: ChartHit): [number, number, number] => {
  const dx = hit.cx - hit.px;
  const dy = hit.cy - hit.py;
  const dz = hit.cz - hit.pz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) {
    return [hit.px, hit.py, hit.pz];
  }
  const s = Math.min(CHART_INSET, len) / len;
  return [hit.px + dx * s, hit.py + dy * s, hit.pz + dz * s];
};
