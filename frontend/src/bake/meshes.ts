import {
  type BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  type Mesh,
  Vector3,
} from "three";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";

import {listColliders} from "../core/bvh";
import {aoModeOf} from "./aoMode";
import {listBakeTargets} from "./targets";

const _center = new Vector3();

const worldCenter = (mesh: Mesh): [number, number, number] => {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box = (geometry.boundingBox as NonNullable<typeof geometry.boundingBox>)
    .clone()
    .applyMatrix4(mesh.matrixWorld);
  box.getCenter(_center);
  return [_center.x, _center.y, _center.z];
};

const worldSize = (mesh: Mesh): [number, number, number] => {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box = (geometry.boundingBox as NonNullable<typeof geometry.boundingBox>)
    .clone()
    .applyMatrix4(mesh.matrixWorld);
  box.getSize(_center);
  return [_center.x, _center.y, _center.z];
};

export const sortKey = (mesh: Mesh): number[] => {
  const mm = (v: number) => Math.round(v * 1000);
  return [
    ...worldCenter(mesh).map(mm),
    mesh.geometry.getAttribute("position").count,
    ...worldSize(mesh).map(mm),
  ];
};

const compareKeys = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
};

export const selectBakeMeshes = (candidates: Iterable<Mesh>): Mesh[] =>
  [...new Set(candidates)]
    .filter(
      (m) =>
        aoModeOf(m) !== "realtime" &&
        m.geometry.getAttribute("uv") !== undefined,
    )
    .map((mesh) => ({mesh, key: sortKey(mesh)}))
    .sort((a, b) => compareKeys(a.key, b.key))
    .map(({mesh}) => mesh);

export const listBakeMeshes = (): Mesh[] =>
  selectBakeMeshes([
    ...listColliders().map((c) => c.mesh),
    ...listBakeTargets(),
  ]);

export const assignCharts = (
  geometry: BufferGeometry,
): {chart: Uint32Array; chartCount: number} => {
  const index = geometry.index;
  if (!index) {
    throw new Error("[bake] index の無いジオメトリは扱えません");
  }
  const position = geometry.getAttribute("position");
  const count = position.count;
  const groups = geometry.groups.length
    ? geometry.groups
    : [{start: 0, count: index.count}];
  const UNSET = 0xffffffff;
  const chart = new Uint32Array(count).fill(UNSET);
  groups.forEach((g, id) => {
    for (let k = g.start; k < g.start + g.count; k++) {
      const v = index.getX(k);
      if (chart[v] !== UNSET && chart[v] !== id) {
        throw new Error(
          `[bake] 頂点 ${v} が複数のチャート(${chart[v]} と ${id})にまたがっています`,
        );
      }
      chart[v] = id;
    }
  });
  for (let v = 0; v < count; v++) {
    if (chart[v] !== UNSET) {
      continue;
    }
    let found = UNSET;
    for (let u = 0; u < count; u++) {
      if (chart[u] === UNSET) {
        continue;
      }
      if (
        position.getX(u) === position.getX(v) &&
        position.getY(u) === position.getY(v) &&
        position.getZ(u) === position.getZ(v)
      ) {
        found = chart[u] as number;
        break;
      }
    }
    chart[v] = found === UNSET ? 0 : found;
  }
  return {chart, chartCount: groups.length};
};

export interface MeshSignature {
  vertexCount: number;
  chartCount: number;
  center: [number, number, number];
}

export const meshSignature = (mesh: Mesh): MeshSignature => ({
  vertexCount: mesh.geometry.getAttribute("position").count,
  chartCount: assignCharts(mesh.geometry).chartCount,
  center: worldCenter(mesh),
});

export const buildBakeGeometry = (meshes: readonly Mesh[]): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  let chartOffset = 0;
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const src = mesh.geometry;
    const {chart, chartCount} = assignCharts(src);
    const part = new BufferGeometry();
    part.setIndex(src.index);
    for (const name of ["position", "normal", "uv"] as const) {
      const attr = src.getAttribute(name) as BufferAttribute | undefined;
      if (!attr) {
        throw new Error(`[bake] ${name} 属性の無いジオメトリは扱えません`);
      }
      part.setAttribute(name, attr.clone());
    }
    const global = new Float32Array(chart.length);
    for (let i = 0; i < chart.length; i++) {
      global[i] = chartOffset + (chart[i] as number);
    }
    part.setAttribute("chart", new Float32BufferAttribute(global, 1));
    part.applyMatrix4(mesh.matrixWorld);
    parts.push(part);
    chartOffset += chartCount;
  }
  const merged = mergeGeometries(parts);
  if (!merged) {
    throw new Error("[bake] ジオメトリの結合に失敗しました");
  }
  merged.userData.chartCount = chartOffset;
  return merged;
};
