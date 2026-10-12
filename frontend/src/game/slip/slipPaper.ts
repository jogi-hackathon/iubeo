import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  SRGBColorSpace,
} from "three";

import {
  paintSlip,
  paintSlipBack,
  SLIP_CANVAS,
  type SlipContent,
} from "./content";
import {
  STRIP_VERTEX_COUNT,
  type StripShape,
  stripIndices,
  writeStrip,
} from "./strip";

export const canvasTexture = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return {canvas, texture};
};

export const createStripGeometry = (): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(STRIP_VERTEX_COUNT * 3), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(STRIP_VERTEX_COUNT * 3), 3),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array(STRIP_VERTEX_COUNT * 2), 2),
  );
  geometry.setIndex(new BufferAttribute(stripIndices(), 1));
  return geometry;
};

export const shapeStrip = (geometry: BufferGeometry, shape: StripShape) => {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const uv = geometry.getAttribute("uv") as BufferAttribute;
  writeStrip(
    position.array as Float32Array,
    normal.array as Float32Array,
    uv.array as Float32Array,
    shape,
  );
  position.needsUpdate = true;
  normal.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeBoundingSphere();
};

export const createSlipTexture = (content: SlipContent): CanvasTexture => {
  const {canvas, texture} = canvasTexture(
    SLIP_CANVAS.width,
    SLIP_CANVAS.height,
  );
  paintSlip(canvas, content);
  return texture;
};

let backTexture: CanvasTexture | null = null;
export const slipBackTexture = (): CanvasTexture => {
  if (!backTexture) {
    const {canvas, texture} = canvasTexture(
      SLIP_CANVAS.width,
      SLIP_CANVAS.height,
    );
    paintSlipBack(canvas);
    backTexture = texture;
  }
  return backTexture;
};
