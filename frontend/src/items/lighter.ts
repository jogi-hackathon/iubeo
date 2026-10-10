import type {Vector3Tuple} from "three";

/** アイテムの kind。ライターは data を持たない(null) */
export const LIGHTER_KIND = "lighter";

/*
 * ライター(Zippo 型のオイルライター)の寸法(m)と部品の配置。実物の大きさ(幅 3.8cm・高さ 5.7cm・厚さ 1.3cm)。
 * 座標は底面の中心が原点で、幅が x、厚さが z(広い面が ±Z を向く)。
 * 置き場(objects/lighter_stand)と手元(HeldItem)の両方が、ここの部品を単位の箱・円柱の scale で伸ばして描く。
 * 置き場では蓋を閉じたまま、手元では蓋を蝶番で開き(LIGHTER_LID_OPEN_ANGLE)、中身(チムニーとヤスリ車)の上に炎を灯す
 */

const WIDTH = 0.038;
const DEPTH = 0.013;
/** 下の胴(ケース)と、上の蓋の高さ。継ぎ目は胴の上端 */
const CASE_HEIGHT = 0.037;
const LID_HEIGHT = 0.02;
/** 全体の高さ(蓋を閉じたとき) */
export const LIGHTER_HEIGHT = CASE_HEIGHT + LID_HEIGHT;
/** 底面の足跡(幅 x・厚さ z)。置き場の敷物の大きさの基準 */
export const LIGHTER_FOOTPRINT = [WIDTH, DEPTH] as const;

/** 継ぎ目の帯。胴より少しだけ張り出して、暗い線に見せる(蓋を開くと、胴の口の縁になる) */
const SEAM_HEIGHT = 0.0015;
const SEAM_PROTRUDE = 0.0005;
/** 蝶番。右(+x)の側面に、継ぎ目をまたいで縦に付ける */
const HINGE_RADIUS = 0.0022;
const HINGE_LENGTH = 0.012;

/** 中身のチムニー(風よけの筒)。胴の口から上に出て、閉じた蓋の内側に収まる。蝶番と反対の左寄り */
const CHIMNEY_SIZE: Vector3Tuple = [0.02, 0.016, 0.011];
const CHIMNEY_X = -0.005;
/** ヤスリ車。チムニーの右(蝶番の側)で、軸は z(厚さの向き) */
const WHEEL_RADIUS = 0.0045;
const WHEEL_WIDTH = 0.006;
const WHEEL_X = 0.0105;
const WHEEL_Y = CASE_HEIGHT + 0.009;
/** 芯。チムニーの上面の中央から少し顔を出す暗い綿芯。炎の根元がここに繋がる */
const WICK_RADIUS = 0.0013;
const WICK_PROTRUDE = 0.003;

export type LighterPartShape = "box" | "cylinder";
/** 色の種類。本体は白、継ぎ目と蝶番・ヤスリ車は暗色(机の金物と同じ) */
export type LighterPartLook = "body" | "accent";

export type LighterPart = {
  shape: LighterPartShape;
  look: LighterPartLook;
  /** 部品の中心 */
  position: Vector3Tuple;
  /** 単位の形(箱は一辺 1、円柱は半径 1・高さ 1)に掛ける大きさ */
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
};

/** 胴の部品(胴・継ぎ目・蝶番)。蓋の開け閉めで動かない */
export const LIGHTER_CASE_PARTS: readonly LighterPart[] = [
  {
    shape: "box",
    look: "body",
    position: [0, CASE_HEIGHT / 2, 0],
    scale: [WIDTH, CASE_HEIGHT, DEPTH],
  },
  {
    shape: "box",
    look: "accent",
    position: [0, CASE_HEIGHT, 0],
    scale: [WIDTH + 2 * SEAM_PROTRUDE, SEAM_HEIGHT, DEPTH + 2 * SEAM_PROTRUDE],
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [WIDTH / 2, CASE_HEIGHT, 0],
    scale: [HINGE_RADIUS, HINGE_LENGTH, HINGE_RADIUS],
  },
];

/** 蓋の回転軸(蝶番の中心)。蓋は、ここを原点にした group を z 軸まわりに回して開く */
export const LIGHTER_LID_PIVOT: Vector3Tuple = [WIDTH / 2, CASE_HEIGHT, 0];
/** 蓋(LIGHTER_LID_PIVOT からの相対) */
export const LIGHTER_LID_PART: LighterPart = {
  shape: "box",
  look: "body",
  position: [-WIDTH / 2, LID_HEIGHT / 2, 0],
  scale: [WIDTH, LID_HEIGHT, DEPTH],
};
/**
 * 蓋を開いた角度(z 軸まわり、ラジアン)。負の向き(手前から見て時計回り)に回すと、蓋が蝶番の側(右)へ倒れる。
 * 実物と同じく、真横より少し下まで開く
 */
export const LIGHTER_LID_OPEN_ANGLE = -0.9 * Math.PI;

/** 中身(チムニー・ヤスリ車)。閉じた蓋の内側に収まるので、手元(蓋を開く)でだけ描く */
export const LIGHTER_INSERT_PARTS: readonly LighterPart[] = [
  {
    shape: "box",
    look: "body",
    position: [CHIMNEY_X, CASE_HEIGHT + CHIMNEY_SIZE[1] / 2, 0],
    scale: CHIMNEY_SIZE,
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [WHEEL_X, WHEEL_Y, 0],
    scale: [WHEEL_RADIUS, WHEEL_WIDTH, WHEEL_RADIUS],
    rotation: [Math.PI / 2, 0, 0],
  },
  {
    shape: "cylinder",
    look: "accent",
    position: [CHIMNEY_X, CASE_HEIGHT + CHIMNEY_SIZE[1], 0],
    scale: [WICK_RADIUS, 2 * WICK_PROTRUDE, WICK_RADIUS],
  },
];

/** 炎の根元(芯の付け根。チムニーの上面の中央)。炎はここから上へ伸び、根元が芯を包む */
export const LIGHTER_FLAME_BASE: Vector3Tuple = [
  CHIMNEY_X,
  CASE_HEIGHT + CHIMNEY_SIZE[1],
  0,
];
/** 炎の大きさ(幅・高さ・厚さ)。揺らぐ前の形 */
export const LIGHTER_FLAME_SIZE: Vector3Tuple = [0.013, 0.034, 0.013];
/**
 * 炎の輪郭(回転体の断面)。高さ 0〜1 での半径(幅の半分に対する比)。
 * 根元は芯の太さだけ細く、widestAt で一番太くなり、先は尖る(tipPower が大きいほど先細り)
 */
export const LIGHTER_FLAME_PROFILE = {
  baseRadius: 0.3,
  widestAt: 0.3,
  tipPower: 1.6,
} as const;
/** 炎の中ほどの、一段明るい赤の舌。炎に対する幅と高さの比(根元から height まで、正面から見て幅 width の内側) */
export const LIGHTER_FLAME_CORE = {width: 0.42, height: 0.58} as const;

/**
 * 手元のライターの拡大率。実寸(幅 3.8cm)だと両手首の間(0.14)で小さすぎて見えないので、骨格の誇張に合わせて大きく描く。
 * 一人称の視野に収まるよう、中心から下と手前(縁取りまで)は、ファイルの箱の一辺の半分(0.05)に収める(held.test)
 */
export const LIGHTER_HELD_SCALE = 1.5;
/** 手元のライターの縁取りの太さ(実寸。拡大前)。白い部品を、各辺にこれだけ大きくした裏面で囲む */
export const LIGHTER_HELD_OUTLINE = 0.0012;
/** 手元のライターの、中心(両手首の中点に合わせる点)の、底面からの高さ。閉じたときの高さの真ん中 */
export const LIGHTER_HELD_CENTER_Y = LIGHTER_HEIGHT / 2;
/** 手元のライターの、中心から底面・手前の面までの距離(実寸。拡大前) */
export const LIGHTER_HELD_REACH = {
  below: LIGHTER_HELD_CENTER_Y,
  front: DEPTH / 2,
} as const;

/** 手に持ってから、蓋が開ききって止まるまで(ミリ秒) */
export const LIGHTER_OPEN_MS = 260;
/** 蓋が止め(開ききった角度)に当たる時刻の、LIGHTER_OPEN_MS に対する割合。当たった後、残りの時間で跳ね返りが収まる */
const LID_HIT_AT = 0.6;
/** 止めに当たったときの跳ね返りの大きさ(開く角度に対する比)。Zippo の蓋が「カチッ」と開いて小さく震える分 */
const LID_REBOUND = 0.06;
/** 手に持ってから、火がつき始めるまで(ミリ秒)。蓋が開ききってから、ヤスリ車を擦る間を置く */
export const LIGHTER_IGNITE_DELAY_MS = 340;
/** 火がつき始めてから、炎が落ち着くまで(ミリ秒) */
export const LIGHTER_IGNITE_MS = 220;
/** 火がついた瞬間に膨らむ大きさ(落ち着いた大きさに対する比)。気化したオイルに一気に火が回って、縮んで落ち着く */
const IGNITE_PUFF = 1.35;
/** 火がつき始めてから、膨らみきるまでの時刻(LIGHTER_IGNITE_MS に対する割合) */
const IGNITE_PUFF_AT = 0.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutQuad = (t: number) => 1 - (1 - t) ** 2;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** 蓋の開き具合(0〜1、一時的に 1 を超えない)。勢いよく開いて止めに当たり(LID_HIT_AT)、少し跳ね返って収まる */
const lidOpening = (t: number): number => {
  if (t < LID_HIT_AT) {
    return easeOutCubic(t / LID_HIT_AT);
  }
  const settle = (t - LID_HIT_AT) / (1 - LID_HIT_AT);
  return 1 - LID_REBOUND * Math.sin(Math.PI * settle) * (1 - settle);
};

/** 炎の大きさ(0〜1。途中で IGNITE_PUFF まで膨らむ)。一気に膨らんでから、縮んで落ち着く */
const flameSize = (t: number): number => {
  if (t < IGNITE_PUFF_AT) {
    return IGNITE_PUFF * easeOutQuad(t / IGNITE_PUFF_AT);
  }
  const settle = (t - IGNITE_PUFF_AT) / (1 - IGNITE_PUFF_AT);
  return IGNITE_PUFF + (1 - IGNITE_PUFF) * easeInOut(settle);
};

/**
 * 手に持ってからの経過時間(ミリ秒)での、蓋の角度と炎の大きさ(落ち着いた大きさを 1 とする)。
 * 蓋は勢いよく開いて止めに当たり、小さく跳ね返って止まる。炎は、蓋が開いた後に一気に膨らんでから落ち着く
 */
export const heldLighterPose = (
  elapsedMs: number,
): {lidAngle: number; flame: number} => {
  const ignite = (elapsedMs - LIGHTER_IGNITE_DELAY_MS) / LIGHTER_IGNITE_MS;
  return {
    lidAngle:
      LIGHTER_LID_OPEN_ANGLE * lidOpening(clamp01(elapsedMs / LIGHTER_OPEN_MS)),
    flame: ignite <= 0 ? 0 : flameSize(clamp01(ignite)),
  };
};
