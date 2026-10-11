import {hash, uint} from "three/tsl";
import type {Node} from "three/webgpu";

/**
 * シェーダーの乱数(0〜1)。cell ごと・step(時間)ごと・n(用途)ごとに系列を分ける。
 * 空(skybox)・ディレクトリの侵食(corruption)・キャンバスの拡散の演出(diffusionMaterial)が使う。
 * 種は uint で組む(f32 だと 2^24 を超えたところで隣のセルの種が同じ値に潰れ、横に揃った模様になる。uint は桁あふれで回るだけ)
 */
export const cellHash = (
  cell: Node<"vec2">,
  step: Node<"float">,
  n: number,
): Node<"float"> =>
  hash(
    cell.x
      .toUint()
      .add(cell.y.toUint().mul(uint(4099)))
      .add(step.toUint().mul(uint(65537)))
      .add(uint(n * 7919)),
  );
