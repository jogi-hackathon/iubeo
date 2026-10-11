import type {Vec3} from "../../props/types";

export const COVER_THICKNESS = 0.016;
export const COVER_RATIO_MAX = 0.15;
export const SPINE_BOARD = 0.022;
export const PAGE_SHADE = 0.95;
export const PAGE_SHADOW = 0.84;
export const PAGE_SHADOW_DEPTH = 0.022;
export const BAND_POSITION = 0.3;
export const BAND_WIDTH = 0.012;
export const BAND_STRENGTH = 0.09;
export const FRAME_INSET = 0.05;
export const FRAME_WIDTH = 0.007;
export const FRAME_STRENGTH = 0.06;

export const coverThickness = (height: number): number =>
  Math.min(COVER_THICKNESS, height * COVER_RATIO_MAX);

const hash = (x: number): number => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export const spineSign = (seed: number): 1 | -1 =>
  hash(seed + 5.1) < 0.5 ? -1 : 1;

export type BookPart = "cover" | "spine" | "pages";

export const bookPart = (
  normal: Vec3,
  p: Vec3,
  size: Vec3,
  sign: 1 | -1,
): BookPart => {
  if (Math.abs(normal[1]) > 0.5) {
    return "cover";
  }
  if (Math.abs(normal[2]) > 0.5 && normal[2] * sign > 0.5) {
    return "spine";
  }
  const edgeY = (0.5 - Math.abs(p[1])) * size[1];
  if (edgeY < coverThickness(size[1])) {
    return "cover";
  }
  const fromSpine = (0.5 - p[2] * sign) * size[2];
  return fromSpine < SPINE_BOARD ? "cover" : "pages";
};

export const pageShade = (belowCover: number): number => {
  const t = Math.min(1, Math.max(0, belowCover / PAGE_SHADOW_DEPTH));
  const s = t * t * (3 - 2 * t);
  return PAGE_SHADOW + (PAGE_SHADE - PAGE_SHADOW) * s;
};
