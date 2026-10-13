import {Vector2} from "three";
import {screenUV, uniform} from "three/tsl";
import type {Node} from "three/webgpu";

export const drawingBufferSize = uniform(new Vector2(1, 1));

export const screenPixel: Node<"vec2"> = screenUV.mul(drawingBufferSize);

type SizeSource = {getDrawingBufferSize(target: Vector2): Vector2};

export const updateDrawingBufferSize = (renderer: SizeSource): void => {
  renderer.getDrawingBufferSize(drawingBufferSize.value);
};
