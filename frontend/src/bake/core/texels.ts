import {type ChartIndex, insetPosition, queryChart} from "./charts";
import {rotFor} from "./params";

export type TexelSample = {
  ox: number;
  oy: number;
  oz: number;
  nx: number;
  ny: number;
  nz: number;
  rot: number;
};

// チャート内のテクセル (tx, ty) のサンプル。どの三角形にもカバーされなければ null。
// seed はチャートとテクセルで一意で、テクセルごとにサンプル方向の回転角をずらすのに使う
export const sampleTexel = (
  idx: ChartIndex,
  chartId: number,
  w: number,
  h: number,
  tx: number,
  ty: number,
): TexelSample | null => {
  const v = h > 1 ? ty / (h - 1) : 0.5;
  const u = w > 1 ? tx / (w - 1) : 0.5;
  const hit = queryChart(idx, u, v);
  if (!hit) {
    return null;
  }
  const pos = insetPosition(hit);
  const seed = chartId * 2000000 + ty * w + tx;
  return {
    ox: pos[0],
    oy: pos[1],
    oz: pos[2],
    nx: hit.nx,
    ny: hit.ny,
    nz: hit.nz,
    rot: rotFor(seed),
  };
};
