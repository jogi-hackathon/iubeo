import type {Vector3Tuple} from "three";

import {DESK_HEIGHT} from "../workspace/desk";

/**
 * 置き場を置く、机ローカルの位置(原点は机の足元の中心、+Z が手前)。天板の右手前で、左手前の紙の束と対になる。
 * 中央の作業スペース・右奥のペン立て・PC(タワーとマウス)のどれとも重ならない。各シーンは、これを机の位置・向きで置く
 */
export const LIGHTER_STAND_ON_DESK: Vector3Tuple = [0.6, DESK_HEIGHT, 0.2];

/**
 * 寝かせたライターの置き方(天板の上で、ライターの中心の x, z と、Y 軸まわりの向き)。
 * 中央から少しずらし、机の辺に対して斜めに回して、無造作に置いた感じにする
 */
export const LIGHTER_REST = {x: 0.003, z: 0.001, yaw: 0.45} as const;

/**
 * 見えない当たり判定の大きさ。寝かせたライター(3.8cm x 5.7cm、厚さ 1.3cm)は薄くて狙いにくいので、一回り大きい箱で狙わせる。
 * LIGHTER_REST の向きでのライターの足跡(約 6.0cm x 6.8cm)が収まる。ライターを持ち出した後も、ここを狙えば戻せる
 */
export const HIT_SIZE: Vector3Tuple = [0.09, 0.03, 0.09];

/** 置き場の足跡(x, z)。机の上の小物と重ならないかのテストが使う */
export const STAND_FOOTPRINT = [HIT_SIZE[0], HIT_SIZE[2]] as const;

/** 跡の厚さ。天板の上面に貼った薄板(天板とちらつかないよう、わずかに厚みを持たせる) */
export const MARK_HEIGHT = 0.001;
/** 跡の色。天板(#f4f2ec)より一段暗い、同じ温かみの白 */
export const MARK_COLOR = "#dcd8cd";
