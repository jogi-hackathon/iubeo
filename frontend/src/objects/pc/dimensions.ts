/**
 * PC の寸法（m）。シーンの単位はメートルで、実物の比率に合わせる（18 インチ CRT）。
 * 原点は机の天板の中心。正面は +Z（イスとスポーン地点の方）。
 *
 * モニタの数値はモニタ群のローカル座標。モニタ群は (0, 0, MONITOR_Z) に置かれ、MONITOR_TILT だけ後ろへ傾く。
 */

export const MONITOR_Z = -0.12;
export const MONITOR_TILT = -0.045;

export const MONITOR_BODY_WIDTH = 0.455;
export const MONITOR_BODY_HEIGHT = 0.36;
export const MONITOR_BODY_DEPTH = 0.4;
/** 天板から筐体の中心までの高さ */
export const MONITOR_BODY_Y = 0.23;
/** 筐体の前面（+Z 側の面）の位置 */
export const MONITOR_FRONT_Z = MONITOR_BODY_DEPTH / 2;

/** ベゼルの開口部。ガラスが覗く穴 */
export const SCREEN_OPENING_WIDTH = 0.345;
export const SCREEN_OPENING_HEIGHT = 0.26;
/** ガラス（ブラウザの画面を載せる面）。前面のすぐ手前 */
export const SCREEN_WIDTH = 0.335;
export const SCREEN_HEIGHT = 0.251;
export const SCREEN_Z = MONITOR_FRONT_Z + 0.03;
export const BEZEL_Z = MONITOR_FRONT_Z + 0.035;
/** ガラスの四隅が中央からどれだけ後退するか */
export const SCREEN_CURVATURE = 0.008;
export const SCREEN_SEGMENTS_X = 72;
export const SCREEN_SEGMENTS_Y = 54;

/** 本体（タワー）。モニタの右の机の上 */
export const TOWER = {
  x: 0.36,
  z: -0.05,
  width: 0.19,
  height: 0.42,
  depth: 0.42,
} as const;

/** キーボードとマウス。モニタの手前 */
export const KEYBOARD = {
  z: 0.3,
  width: 0.44,
  depth: 0.16,
  height: 0.025,
} as const;
export const MOUSE = {
  x: 0.3,
  z: 0.36,
  width: 0.065,
  depth: 0.1,
  height: 0.03,
} as const;

/** お題のメモ。モニタの左の机の上に、手前へ傾けて立てる */
export const MEMO = {
  x: -0.4,
  z: 0.02,
  width: 0.2,
  height: 0.14,
  tilt: -0.5,
} as const;
