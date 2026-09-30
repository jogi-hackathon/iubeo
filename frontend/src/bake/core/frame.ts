// 法線まわりの接線フレームと、隠れチャートの判定ロジック(レイキャスト結果は GPU 側が出す)。
import {Vector3} from "three";

import {
  EMBEDDED,
  HIDDEN_AO_EPS,
  HIDDEN_BURIED_RATIO,
  HIDDEN_VOID_MAX_NY,
  HIDDEN_VOID_RATIO,
} from "./params";

const _t = new Vector3();
const _b = new Vector3();
const _n = new Vector3();

// 法線 (nx,ny,nz) に直交する接線 t・従接線 b を求める。返す Vector3 は共有バッファで、次の呼び出しまで有効
export const tangentFrame = (
  nx: number,
  ny: number,
  nz: number,
): {t: Vector3; b: Vector3} => {
  _n.set(nx, ny, nz);
  _t.set(Math.abs(nx) < 0.9 ? 1 : 0, Math.abs(nx) < 0.9 ? 0 : 1, 0)
    .cross(_n)
    .normalize();
  _b.crossVectors(_n, _t);
  return {t: _t, b: _b};
};

// 回転角 rot を掛けた接線フレーム(GPU へ渡す用)。半球サンプル方向 (dx,dy,dz) は
// x = dx*c - dy*s, y = dx*s + dy*c を t*x + b*y + n*z に入れるので、dx*T + dy*B + dz*n に畳める。
// out に T.xyz, B.xyz の 6 要素を書く
export const rotatedFrame = (
  nx: number,
  ny: number,
  nz: number,
  rot: number,
  out: number[] | Float32Array | Float64Array,
): void => {
  const {t, b} = tangentFrame(nx, ny, nz);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  out[0] = c * t.x + s * b.x;
  out[1] = c * t.y + s * b.y;
  out[2] = c * t.z + s * b.z;
  out[3] = -s * t.x + c * b.x;
  out[4] = -s * t.y + c * b.y;
  out[5] = -s * t.z + c * b.z;
};

/** 隠れチャート判定のサンプル点ごとの結果(GPU の GpuHiddenProbe が出す) */
export interface ProbePoint {
  /** 本ベイクと同じ式の AO(0..255 / EMBEDDED) */
  ao: number;
  /** 距離無制限のレイのうち、裏面に当たった本数 */
  backHits: number;
  /** 距離無制限のレイのうち、何にも当たらなかった本数 */
  misses: number;
  /** 法線の y */
  ny: number;
}

/**
 * サンプル点が見えないか。次のいずれか:
 * - 暗い・埋まり: AO が EMBEDDED か HIDDEN_AO_EPS 未満(移植元と同じ)
 * - 埋まり(距離無制限): レイの HIDDEN_BURIED_RATIO 以上が裏面に当たる。MAX_DIST より厚い物体に密着した面
 * - 虚空: 下向きで、レイの HIDDEN_VOID_RATIO 以上が何にも当たらない。ワールドの下を向いた面
 *
 * 移植元の「向きを問わず、距離無制限のレイの大半が何にも当たらない面」(部屋の外側の面)は使わない。
 * IUBEO は屋外のオープンワールドで、床や壁の上面のように空が見える面が正当に存在するため。
 * 下向きの面に限れば、上から見下ろすプレイヤーには見えない
 */
export const isHiddenPoint = (p: ProbePoint, rays: number): boolean => {
  if (p.ao === EMBEDDED || p.ao / 255 < HIDDEN_AO_EPS) {
    return true;
  }
  if (p.backHits >= rays * HIDDEN_BURIED_RATIO) {
    return true;
  }
  return p.ny <= HIDDEN_VOID_MAX_NY && p.misses >= rays * HIDDEN_VOID_RATIO;
};

/** 全サンプル点が見えないチャートだけを隠れとみなす(1点でも見えれば通常の解像度でベイクする) */
export const decideHidden = (
  points: readonly ProbePoint[],
  rays: number,
): boolean => {
  if (points.length === 0) {
    return false;
  } // 判定できなければ安全側(通常解像度を維持)
  return points.every((p) => isHiddenPoint(p, rays));
};
