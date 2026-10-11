import {floor, max, screenSize, uv} from "three/tsl";
import type {Node} from "three/webgpu";

export const pixelateUV = (pixelSize: Node<"float">): Node<"vec2"> => {
  const blocks = screenSize.div(max(pixelSize, 1));
  return floor(uv().mul(blocks)).add(0.5).div(blocks) as Node<"vec2">;
};
