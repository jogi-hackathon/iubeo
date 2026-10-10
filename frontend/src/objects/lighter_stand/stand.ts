import type {Vector3Tuple} from "three";

import {LIGHTER_FOOTPRINT} from "../../items";
import {DESK_HEIGHT} from "../workspace/desk";

/*
 * ライターの置き場(角形の低い台座)の寸法(m)と部品の配置。座標はレイアウトの位置(台座の底面の中心)を原点とした相対。
 * 机の天板の上(LIGHTER_STAND_ON_DESK)に置く。ライター(items/lighter)は台座の上面の中央に立てる
 */

/**
 * 置き場を置く、机ローカルの位置(原点は机の足元の中心、+Z が手前)。天板の右手前で、左手前の紙の束と対になる。
 * 中央の作業スペース・右奥のペン立て・PC(タワーとマウス)のどれとも重ならない。各シーンは、これを机の位置・向きで置く
 */
export const LIGHTER_STAND_ON_DESK: Vector3Tuple = [0.6, DESK_HEIGHT, 0.2];

/** 台座の下段。ライター(幅 3.8cm・厚さ 1.3cm)より一回り大きく、机の上で狙える大きさにする */
const BASE_SIZE: Vector3Tuple = [0.08, 0.008, 0.05];
/** 台座の上段。下段より縁を引っ込めて、段差を付ける */
const TOP_INSET = 0.006;
const TOP_HEIGHT = 0.004;
/** 敷物。上段の中央に敷く暗い薄板で、ライターの底より一回り大きい。白いライターを白い台座から浮かせず、座りを見せる */
const PAD_MARGIN = 0.003;
const PAD_HEIGHT = 0.0015;

/** 台座の足跡(x, z)。机の上の小物と重ならないかのテストが使う */
export const STAND_FOOTPRINT = [BASE_SIZE[0], BASE_SIZE[2]] as const;
/** 敷物の上面の高さ。ライターの底面をここに置く */
export const STAND_TOP = BASE_SIZE[1] + TOP_HEIGHT + PAD_HEIGHT;

/** 色の種類。下段は机の骨組みと同じ灰、上段は天板と同じ温かい白、敷物はライターの継ぎ目と同じ暗色 */
export type StandPartLook = "base" | "top" | "pad";

export type StandPart = {
  look: StandPartLook;
  /** 部品の中心 */
  position: Vector3Tuple;
  /** 一辺 1 の箱に掛ける大きさ */
  scale: Vector3Tuple;
};

/** 台座の部品すべて(描画の順) */
export const STAND_PARTS: readonly StandPart[] = [
  {look: "base", position: [0, BASE_SIZE[1] / 2, 0], scale: BASE_SIZE},
  {
    look: "top",
    position: [0, BASE_SIZE[1] + TOP_HEIGHT / 2, 0],
    scale: [
      BASE_SIZE[0] - 2 * TOP_INSET,
      TOP_HEIGHT,
      BASE_SIZE[2] - 2 * TOP_INSET,
    ],
  },
  {
    look: "pad",
    position: [0, BASE_SIZE[1] + TOP_HEIGHT + PAD_HEIGHT / 2, 0],
    scale: [
      LIGHTER_FOOTPRINT[0] + 2 * PAD_MARGIN,
      PAD_HEIGHT,
      LIGHTER_FOOTPRINT[1] + 2 * PAD_MARGIN,
    ],
  },
];
