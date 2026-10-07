import type {Vector3Tuple} from "three";

/*
 * イーゼルに立てかけたキャンバスの寸法(m)と部品の配置。座標は object.position(足元)を原点とした相対で、
 * 絵の面は +Z(プレイヤーが立つ側)を向く。描画(CanvasObject)は、ここの部品を単位の箱の scale で伸ばして描く。
 * 形は、前脚 2 本と後脚 1 本の三脚が、後ろへ EASEL_LEAN だけ倒れてキャンバスを支える、床に立てる標準的なイーゼル
 */

/** 前脚・キャンバスの面が、鉛直から後ろへ倒れる角度(rad。約 11 度) */
export const EASEL_LEAN = 0.2;
/** キャンバス(木枠込み)の大きさ。幅 x 高さ。ワークスペースの机の幅(1.6m)の半分強 */
export const CANVAS_SIZE = [0.9, 1.0] as const;
/** キャンバスの中心の高さ。EYE_HEIGHT(1.6m)より少し下で、立ったまま見下ろさず正面から見られる */
export const CANVAS_CENTER_HEIGHT = 1.25;

/** 前脚の中心線の間隔(左右) */
const FRONT_LEG_SPAN = 0.76;
const LEG_SIZE = 0.045;
/** 前脚の足元の z。後脚はこの後ろ、頂部は脚が倒れた分だけ後ろにずれる */
const FRONT_FOOT_Z = 0.3;
const FRONT_TOP_HEIGHT = 1.85;
const REAR_FOOT_Z = -0.6;
/**
 * 木枠(キャンバスを張る枠)の厚みと、その前に載せる紙の厚み・縁の幅。
 * 縁は、AO のベイクのテクセル(2cm)の 2.5 個分あり、紙の段差の接触影が灰色の帯に滲まず、枠と段差として読める
 */
const FRAME_DEPTH = 0.03;
const PAPER_DEPTH = 0.02;
const PAPER_MARGIN = 0.05;

/**
 * 受け台(キャンバスの下端を載せる板)。木枠より一回り広くして、木枠の一部でなく別部品のトレーに見せる。
 * 前縁に、木枠の下端を止めるリップを立てる(受け台の前面から LIP_SETBACK 引っ込める。面が同一平面にならないように)
 */
const LEDGE_SIZE: Vector3Tuple = [0.98, 0.03, 0.1];
const LIP_SIZE: Vector3Tuple = [0.98, 0.02, 0.012];
const LIP_SETBACK = 0.002;

/**
 * 押さえ(木枠の上端に載せる横木)。木枠の天面に載るよう、奥行きは木枠の厚みと紙の厚みをまたぎ、紙の面より 1cm 前に出す。
 * 中央に、紙の上縁に被さるツメを付けて「留めている」ように見せる(押さえの底面まで届かせてつなぐ)
 */
const CLAMP_SIZE: Vector3Tuple = [0.6, 0.04, FRAME_DEPTH + PAPER_DEPTH + 0.01];
const TAB_WIDTH = 0.16;
/** ツメが紙の上縁に被さる量 */
const TAB_OVERLAP = 0.02;

/**
 * 前脚をつなぐ上の横木の、キャンバスの中心から面に沿って上への距離。押さえの上面から 1.75cm 空けて、
 * 木枠の上に出す(正面から、キャンバスの上に横木と脚先が見えるように)。後脚の上端は、この横木に差す
 */
const TOP_BAR_GAP = 0.0175;
const TOP_BAR_U =
  CANVAS_SIZE[1] / 2 + CLAMP_SIZE[1] + TOP_BAR_GAP + LEG_SIZE / 2;
/** 横木は脚の前後に 6mm ずつ出す(脚と同一平面にならないように)。長さは前脚の中心線の間で、端は脚に埋まる */
const TOP_BAR_PROTRUDE = 0.006;

/** 前脚の中ほどに渡す貫(足元から) */
const STRETCHER_HEIGHT = 0.45;
const STRETCHER_SIZE = 0.035;

/** 部品の種類(木の骨組み・金物)。色は今どれも真っ白で、CanvasObject が種類ごとに持つ */
export type EaselLook = "wood" | "accent";

export type EaselPart = {
  look: EaselLook;
  /** 部品の中心 */
  position: Vector3Tuple;
  /** 単位の箱(一辺 1)に掛ける大きさ */
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
};

/** 紙(絵の面)の配置。見た目が変わる部品なので、イーゼルの部品(EaselPart)とは分けて CanvasPaper が描く */
export type PaperPlacement = Omit<EaselPart, "look">;

// 前脚の中心線上の点を、キャンバスの面の座標で表す。u は面に沿って上、n は面から手前(+Z 側)
const sin = Math.sin(EASEL_LEAN);
const cos = Math.cos(EASEL_LEAN);
const frontZAt = (y: number) => FRONT_FOOT_Z - y * Math.tan(EASEL_LEAN);
const ORIGIN: Vector3Tuple = [
  0,
  CANVAS_CENTER_HEIGHT,
  frontZAt(CANVAS_CENTER_HEIGHT),
];
/** 面に沿った上(u)と、面から手前(n)の距離から、イーゼルの座標へ */
const onPlane = (u: number, n: number): Vector3Tuple => [
  ORIGIN[0],
  ORIGIN[1] + u * cos + n * sin,
  ORIGIN[2] - u * sin + n * cos,
];
/** 面と同じ向きに倒す(+Z 側が下がるので、X 軸まわりは負) */
const LEAN_ROTATION: Vector3Tuple = [-EASEL_LEAN, 0, 0];

/**
 * 2 点を結ぶ脚。x 一定の面の中で、箱の長手(y 軸)を 2 点に合わせる。
 * grounded なら from は足元で、傾いた脚の底面の一番高い角が床(y=0)に着くよう、from を下げる(低い側の角は床に沈む)
 */
const strut = (
  look: EaselLook,
  fromPoint: Vector3Tuple,
  to: Vector3Tuple,
  size: number,
  grounded = false,
): EaselPart => {
  const tilt = Math.atan2(Math.abs(to[2] - fromPoint[2]), to[1] - fromPoint[1]);
  const from: Vector3Tuple = grounded
    ? [fromPoint[0], fromPoint[1] - (size / 2) * Math.sin(tilt), fromPoint[2]]
    : fromPoint;
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return {
    look,
    position: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    scale: [size, Math.hypot(dy, dz), size],
    // y 軸が (0, dy, dz) を向く回転。z が増える(手前に出る)向きが X 軸まわりの正
    rotation: [Math.atan2(dz, dy), 0, 0],
  };
};

const frontX = FRONT_LEG_SPAN / 2;
const legPoint = (x: number, y: number): Vector3Tuple => [x, y, frontZAt(y)];
const stretcherY = STRETCHER_HEIGHT;

/** 前脚をつなぐ上の横木。木枠の上に出ていて、正面から見える */
export const TOP_BAR_PART: EaselPart = {
  look: "wood",
  position: onPlane(TOP_BAR_U, 0),
  scale: [FRONT_LEG_SPAN, LEG_SIZE, LEG_SIZE + 2 * TOP_BAR_PROTRUDE],
  rotation: LEAN_ROTATION,
};

/** 後脚。足元は前脚のずっと後ろで、上端は横木の中心に差す(浮かせない) */
export const REAR_LEG_PART: EaselPart = strut(
  "wood",
  [0, 0, REAR_FOOT_Z],
  TOP_BAR_PART.position,
  LEG_SIZE,
  true,
);

/** 三脚: 前脚 2 本(後ろへ倒す)、後脚 1 本、前脚をつなぐ上の横木と貫 */
const LEGS: readonly EaselPart[] = [
  ...[-1, 1].map((s) =>
    strut(
      "wood",
      [s * frontX, 0, FRONT_FOOT_Z],
      legPoint(s * frontX, FRONT_TOP_HEIGHT),
      LEG_SIZE,
      true,
    ),
  ),
  REAR_LEG_PART,
  TOP_BAR_PART,
  {
    look: "wood",
    position: [0, stretcherY, frontZAt(stretcherY)],
    scale: [FRONT_LEG_SPAN, STRETCHER_SIZE, STRETCHER_SIZE],
    rotation: LEAN_ROTATION,
  },
];

/** 前脚の前面(面の n=LEG_SIZE/2)に、木枠の裏を当てる。紙は、その前面に載せる */
const frameN = LEG_SIZE / 2 + FRAME_DEPTH / 2;
const paperN = LEG_SIZE / 2 + FRAME_DEPTH + PAPER_DEPTH / 2 - 0.002;

/** 押さえ。底面が木枠の天面(面に沿って CANVAS_SIZE[1]/2)に載る */
export const CLAMP_PART: EaselPart = {
  look: "accent",
  position: onPlane(
    CANVAS_SIZE[1] / 2 + CLAMP_SIZE[1] / 2,
    LEG_SIZE / 2 + CLAMP_SIZE[2] / 2,
  ),
  scale: CLAMP_SIZE,
  rotation: LEAN_ROTATION,
};

/** 紙の前面の、面からの距離(紙の mesh の中心 + 厚みの半分) */
const paperFrontN = paperN + PAPER_DEPTH / 2;
const clampFrontN = LEG_SIZE / 2 + CLAMP_SIZE[2];
/** ツメ: 木枠の前面から押さえの前面の手前まで(紙の面より前に出す)。上端は押さえに食い込ませ、下端は紙の上縁に被せる */
const TAB_BOTTOM_U = CANVAS_SIZE[1] / 2 - PAPER_MARGIN - TAB_OVERLAP;
const TAB_TOP_U = CANVAS_SIZE[1] / 2 + 0.02;
const TAB_BACK_N = LEG_SIZE / 2 + FRAME_DEPTH;
const TAB_FRONT_N = Math.min(paperFrontN + 0.01, clampFrontN - 0.002);

/** キャンバスの木枠と、それを支える受け台(と前縁のリップ)・押さえ(とツメ) */
const CANVAS_PARTS: readonly EaselPart[] = [
  {
    look: "wood",
    position: onPlane(0, frameN),
    scale: [CANVAS_SIZE[0], CANVAS_SIZE[1], FRAME_DEPTH],
    rotation: LEAN_ROTATION,
  },
  {
    look: "wood",
    position: onPlane(
      -CANVAS_SIZE[1] / 2 - LEDGE_SIZE[1] / 2,
      LEG_SIZE / 2 + LEDGE_SIZE[2] / 2,
    ),
    scale: LEDGE_SIZE,
    rotation: LEAN_ROTATION,
  },
  {
    look: "wood",
    position: onPlane(
      -CANVAS_SIZE[1] / 2 + LIP_SIZE[1] / 2,
      LEG_SIZE / 2 + LEDGE_SIZE[2] - LIP_SETBACK - LIP_SIZE[2] / 2,
    ),
    scale: LIP_SIZE,
    rotation: LEAN_ROTATION,
  },
  CLAMP_PART,
  {
    look: "accent",
    position: onPlane(
      (TAB_BOTTOM_U + TAB_TOP_U) / 2,
      (TAB_BACK_N + TAB_FRONT_N) / 2,
    ),
    scale: [TAB_WIDTH, TAB_TOP_U - TAB_BOTTOM_U, TAB_FRONT_N - TAB_BACK_N],
    rotation: LEAN_ROTATION,
  },
];

/** 部品すべて(描画の順) */
export const EASEL_PARTS: readonly EaselPart[] = [...LEGS, ...CANVAS_PARTS];

/**
 * 紙(絵を描く面)の大きさ。幅 x 高さ。木枠(CANVAS_SIZE)より縁(PAPER_MARGIN)ぶん小さい。
 * 絵のテクスチャは、この縦横比で作る
 */
export const PAPER_SIZE = [
  CANVAS_SIZE[0] - 2 * PAPER_MARGIN,
  CANVAS_SIZE[1] - 2 * PAPER_MARGIN,
] as const;

/** 紙の配置。木枠の前面に、PAPER_DEPTH の薄い箱を少し(2mm)埋めて載せる。uv は +Z 面が [0,1]²(u は +x、v は上) */
export const PAPER_PLACEMENT: PaperPlacement = {
  position: onPlane(0, paperN),
  scale: [PAPER_SIZE[0], PAPER_SIZE[1], PAPER_DEPTH],
  rotation: LEAN_ROTATION,
};
