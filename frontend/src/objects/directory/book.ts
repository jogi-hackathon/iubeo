import type {Vec3} from "../../props/types";

/** 表紙の板の厚み(m)。薄い本では、厚みに対する割合(COVER_RATIO_MAX)で頭打ちにする */
export const COVER_THICKNESS = 0.016;
export const COVER_RATIO_MAX = 0.15;
/** 天・地の面で、背の側の端に見える、背表紙の板の厚み(m) */
export const SPINE_BOARD = 0.022;
/** ページの小口の明るさ(表紙の白に対する係数)。表紙より一段引っ込んだ陰として、少しだけ落とす */
export const PAGE_SHADE = 0.95;
/** 表紙のすぐ下の、表紙が落とす影の明るさと、影が消えるまでの距離(m) */
export const PAGE_SHADOW = 0.84;
export const PAGE_SHADOW_DEPTH = 0.022;
/** 背の帯(背バンド)の位置(幅に対する、中心からの割合)・太さ(m)・暗さ */
export const BAND_POSITION = 0.3;
export const BAND_WIDTH = 0.012;
export const BAND_STRENGTH = 0.09;
/** 表紙の上面の、縁から内側の枠線。縁からの距離(m)・太さ(m)・暗さ */
export const FRAME_INSET = 0.05;
export const FRAME_WIDTH = 0.007;
export const FRAME_STRENGTH = 0.06;

export const coverThickness = (height: number): number =>
  Math.min(COVER_THICKNESS, height * COVER_RATIO_MAX);

const hash = (x: number): number => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** 背がどちらの長辺に付くか(ローカル Z の符号)。板ごとの seed から決める。束は -Z が山の外側を向く */
export const spineSign = (seed: number): 1 | -1 =>
  hash(seed + 5.1) < 0.5 ? -1 : 1;

export type BookPart = "cover" | "spine" | "pages";

/**
 * 箱の表面の点が、本のどの部分か。normal は面の法線、p は箱のローカル位置(-0.5〜0.5)、size は (幅, 厚み, 奥行き)。
 * - 上面・下面は表紙
 * - 背の側の長辺の面は、背表紙
 * - 残りの 3 面(前小口・天・地)は、上下の端が表紙の板の断面で、その間がページ。
 *   天・地の面では、背の側の端にも背表紙の板の断面が見える
 */
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

/** ページの小口の地の明るさ。上の表紙からの距離(m)が近いほど、表紙の影で暗い */
export const pageShade = (belowCover: number): number => {
  const t = Math.min(1, Math.max(0, belowCover / PAGE_SHADOW_DEPTH));
  const s = t * t * (3 - 2 * t);
  return PAGE_SHADOW + (PAGE_SHADE - PAGE_SHADOW) * s;
};
