import {Vector2} from "three";
import {screenUV, uniform} from "three/tsl";
import type {Node} from "three/webgpu";

/**
 * 描画バッファ(画面)の大きさ(ピクセル)。毎フレーム updateDrawingBufferSize で入れる。
 * ポストプロセスは scene pass を内部解像度(core/graphics の getRenderScale)で描くので、
 * その中で TSL の screenCoordinate / screenSize を読むと内部解像度の値になり、
 * ピクセル単位の模様(空のブロックノイズ・海の文字・侵食のブロック)が内部解像度に合わせて伸びてしまう
 */
export const drawingBufferSize = uniform(new Vector2(1, 1));

/** 画面のピクセル座標。描画先の解像度によらず、画面の左上を 0 として画面のピクセルで数える */
export const screenPixel: Node<"vec2"> = screenUV.mul(drawingBufferSize);

type SizeSource = {getDrawingBufferSize(target: Vector2): Vector2};

export const updateDrawingBufferSize = (renderer: SizeSource): void => {
  renderer.getDrawingBufferSize(drawingBufferSize.value);
};
