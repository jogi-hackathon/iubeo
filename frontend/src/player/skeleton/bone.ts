import {Matrix4, Quaternion, Vector3} from "three";

const UP = new Vector3(0, 1, 0);
const direction = new Vector3();
const middle = new Vector3();
const rotation = new Quaternion();
const size = new Vector3();

/**
 * 高さ 1・半径 1 で Y 軸に沿った円柱(中心が原点)を、from から to へ渡す太さ radius の棒に変える行列を out に書く。
 * 太線(Line2)は近クリップ面をまたぐと頂点が引き伸ばされるので、骨は実ジオメトリの円柱で描く
 */
export const composeBone = (
  out: Matrix4,
  from: Vector3,
  to: Vector3,
  radius: number,
): Matrix4 => {
  direction.subVectors(to, from);
  const length = direction.length();
  if (length < 1e-6) {
    // 長さ 0 の骨は向きが決まらないので、潰して見えなくする
    return out.compose(from, rotation.identity(), size.setScalar(0));
  }
  rotation.setFromUnitVectors(UP, direction.divideScalar(length));
  middle.addVectors(from, to).multiplyScalar(0.5);
  return out.compose(middle, rotation, size.set(radius, length, radius));
};
