import { floor, max, screenSize, uv } from "three/tsl";
import type { Node } from "three/webgpu";

/**
 * 画面を pixelSize(ドローイングバッファの px)四方のブロックに量子化した UV を返す。
 * ブロック中心を指すので、最近傍サンプラーのテクスチャと組み合わせるとブロックごとに単色になる
 */
export const pixelateUV = (pixelSize: Node<"float">): Node<"vec2"> => {
  const blocks = screenSize.div(max(pixelSize, 1));
  return floor(uv().mul(blocks)).add(0.5).div(blocks) as Node<"vec2">;
};
