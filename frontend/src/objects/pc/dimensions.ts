export const MONITOR_Z = -0.1;
export const MONITOR_TILT = -0.045;

export const MONITOR_BODY_WIDTH = 0.455;
export const MONITOR_BODY_HEIGHT = 0.4;
export const MONITOR_BODY_DEPTH = 0.36;
/** 天板から筐体の中心までの高さ */
export const MONITOR_BODY_Y = 0.23;
/** 筐体の前面（+Z 側の面）の位置 */
export const MONITOR_FRONT_Z = MONITOR_BODY_DEPTH / 2;

/** ベゼルの開口部。ガラスが覗く穴 */
export const SCREEN_OPENING_WIDTH = 0.345;
export const SCREEN_OPENING_HEIGHT = 0.26;
/** ガラス（ブラウザの画面を載せる面）。前枠の奥に、少しだけ引っ込める */
export const SCREEN_WIDTH = 0.335;
export const SCREEN_HEIGHT = 0.251;
/**
 * ガラスの位置。前枠（BEZEL_Z の前後面で 0.20〜0.23）の内側に 1cm 奥まって収まる。
 * 前へ出すと、ガラスが箱に貼った紙に見える
 */
export const SCREEN_Z = MONITOR_FRONT_Z + 0.02;
/** 前枠の中心。奥面が本体の前面（MONITOR_FRONT_Z）に接する。浮かせると前枠だけ板に見える */
export const BEZEL_Z = MONITOR_FRONT_Z + 0.015;
/** ガラスの四隅が中央からどれだけ後退するか */
export const SCREEN_CURVATURE = 0.012;
export const SCREEN_SEGMENTS_X = 72;
export const SCREEN_SEGMENTS_Y = 54;

/** 本体（タワー）。モニタの右の机の上。前面がモニタの前面より前に出ないよう、少し奥へ引く */
export const TOWER = {
  x: 0.36,
  z: -0.15,
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
