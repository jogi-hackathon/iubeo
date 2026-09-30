// 法線まわりの接線フレームと、隠れチャートの判定ロジック(レイキャスト結果は GPU 側が出す)。
import { Vector3 } from "three";
import { EMBEDDED, HIDDEN_AO_EPS } from "./params";

const _t = new Vector3();
const _b = new Vector3();
const _n = new Vector3();

// 法線 (nx,ny,nz) に直交する接線 t・従接線 b を求める。返す Vector3 は共有バッファで、次の呼び出しまで有効
export const tangentFrame = (
  nx: number,
  ny: number,
  nz: number,
): { t: Vector3; b: Vector3 } => {
  _n.set(nx, ny, nz);
  _t.set(Math.abs(nx) < 0.9 ? 1 : 0, Math.abs(nx) < 0.9 ? 0 : 1, 0)
    .cross(_n)
    .normalize();
  _b.crossVectors(_n, _t);
  return { t: _t, b: _b };
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
  const { t, b } = tangentFrame(nx, ny, nz);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  out[0] = c * t.x + s * b.x;
  out[1] = c * t.y + s * b.y;
  out[2] = c * t.z + s * b.z;
  out[3] = -s * t.x + c * b.x;
  out[4] = -s * t.y + c * b.y;
  out[5] = -s * t.z + c * b.z;
};

// 隠れチャートの判定。サンプル点ごとの AO(0..255 / EMBEDDED)を受け取り、
// 「全点が埋まっている、または暗い」ときだけ隠れとみなす。
//
// 移植元の 3D 部屋ベイクでは「距離無制限のレイの大半が何にも当たらない面」も隠れ扱い
// (部屋の外側の面)にしていたが、IUBEO は屋外のオープンワールドで、床や壁の上面のように
// 空が見える面が正当に存在する。miss 判定を入れるとそれらまで 2x2 テクセルに潰れるため廃止した
export const decideHidden = (aos: ArrayLike<number>): boolean => {
  if (aos.length === 0) return false; // 判定できなければ安全側(通常解像度を維持)
  for (let i = 0; i < aos.length; i++) {
    const ao = aos[i] ?? EMBEDDED;
    const dark = ao === EMBEDDED || ao / 255 < HIDDEN_AO_EPS;
    if (!dark) return false;
  }
  return true;
};
