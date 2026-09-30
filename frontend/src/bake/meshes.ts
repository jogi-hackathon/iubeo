import {
  type BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  type Mesh,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { listColliders } from "../core/bvh";

/**
 * AO をベイクする静的 mesh。BVHCollider 配下の mesh(= 動かないコライダー)をすべて対象にする。
 * 並びはコライダーの登録順(= シーンのマウント順)で、ベイクページとゲーム本体で同じシーンなら一致する。
 * 並びが食い違っていないかは、ベイク結果に残した頂点数とワールド中心で検証する(format.ts)
 */
export const listBakeMeshes = (): Mesh[] =>
  listColliders()
    .map((c) => c.mesh)
    .filter((m) => m.geometry.getAttribute("uv") !== undefined);

/**
 * geometry.groups(= マテリアルごとの面のまとまり。BoxGeometry なら6面)をそれぞれ1チャートとし、
 * 頂点ごとのチャート番号(0 始まり)を返す。groups が無いジオメトリ(球・平面)は全体を1チャートにする。
 * 1頂点が複数チャートにまたがるとアトラス上の位置が決まらないので例外にする
 */
export const assignCharts = (
  geometry: BufferGeometry,
): { chart: Uint32Array; chartCount: number } => {
  const index = geometry.index;
  if (!index) throw new Error("[bake] index の無いジオメトリは扱えません");
  const position = geometry.getAttribute("position");
  const count = position.count;
  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: index.count }];
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
  // どの三角形にも使われない頂点(SphereGeometry の極にできる重複頂点など)は、
  // 同じ位置の割当済み頂点から番号を引き継ぐ(描画には使われないので見た目には影響しない)
  for (let v = 0; v < count; v++) {
    if (chart[v] !== UNSET) continue;
    let found = UNSET;
    for (let u = 0; u < count; u++) {
      if (chart[u] === UNSET) continue;
      if (
        position.getX(u) === position.getX(v) &&
        position.getY(u) === position.getY(v) &&
        position.getZ(u) === position.getZ(v)
      ) {
        found = chart[u] as number;
        break;
      }
    }
    // 孤立した頂点は描画にも使われないので、どのチャートでもよい
    chart[v] = found === UNSET ? 0 : found;
  }
  return { chart, chartCount: groups.length };
};

/** ベイク結果と mesh の対応を検証するための要約 */
export interface MeshSignature {
  vertexCount: number;
  chartCount: number;
  /** ワールド座標のバウンディングボックス中心 */
  center: [number, number, number];
}

const _center = new Vector3();

export const meshSignature = (mesh: Mesh): MeshSignature => {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  // computeBoundingBox の直後なので null ではない
  const box = (geometry.boundingBox as NonNullable<typeof geometry.boundingBox>)
    .clone()
    .applyMatrix4(mesh.matrixWorld);
  box.getCenter(_center);
  return {
    vertexCount: geometry.getAttribute("position").count,
    chartCount: assignCharts(geometry).chartCount,
    center: [_center.x, _center.y, _center.z],
  };
};

/**
 * ベイク用に、対象 mesh をワールド座標で1つに結合したジオメトリを作る。
 * 属性は position / normal / uv と、通し番号のチャート番号 `chart` だけに揃える(mergeGeometries は属性の一致が必要)。
 * userData.chartCount に全チャート数を入れる(core/charts.ts の buildChartTriangles が読む)
 */
export const buildBakeGeometry = (meshes: readonly Mesh[]): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  let chartOffset = 0;
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const src = mesh.geometry;
    const { chart, chartCount } = assignCharts(src);
    const part = new BufferGeometry();
    part.setIndex(src.index);
    for (const name of ["position", "normal", "uv"] as const) {
      const attr = src.getAttribute(name) as BufferAttribute | undefined;
      if (!attr)
        throw new Error(`[bake] ${name} 属性の無いジオメトリは扱えません`);
      part.setAttribute(name, attr.clone());
    }
    const global = new Float32Array(chart.length);
    for (let i = 0; i < chart.length; i++)
      global[i] = chartOffset + (chart[i] as number);
    part.setAttribute("chart", new Float32BufferAttribute(global, 1));
    part.applyMatrix4(mesh.matrixWorld);
    parts.push(part);
    chartOffset += chartCount;
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error("[bake] ジオメトリの結合に失敗しました");
  merged.userData.chartCount = chartOffset;
  return merged;
};
