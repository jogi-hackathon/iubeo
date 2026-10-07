import {Euler, type Quaternion} from "three";

import type {Vec3} from "../../props/types";
import {
  type MountainSizeName,
  mountainHeightMax,
  mountainReach,
  mountainViewHeight,
} from "./mountain";

/** ゲームのカメラの縦の画角(度)。core/GameCanvas の CAMERA.fov と合わせる */
export const CAMERA_FOV = 75;
/** 山の裾(束の端まで)が、画面の縦(狭い方)の半分のうち、ここまでに収まる高さにカメラを置く */
const FIT_RATIO = 0.9;
/** 山頂より、カメラを上に置く余裕(m) */
const SUMMIT_MARGIN = 1.5;

/**
 * カメラの、地面(ディレクトリの足元)からの高さ(m)。山の大きさ(size)ごとに、次の 3 つを全て満たす:
 * - 山全体(裾の半径まで)が、16:9 でも 4:3 でも画面に収まる(縦の画角が効く)
 * - 山頂(最大の高さ)より十分上
 * - 真上からでも、下の方の段の上面が上の段に隠れすぎずに見える(mountain.ts の mountainViewHeight)
 */
export const overviewHeight = (size: MountainSizeName): number =>
  Math.max(
    mountainReach(size) /
      (FIT_RATIO * Math.tan((CAMERA_FOV / 2) * (Math.PI / 180))),
    mountainHeightMax(size) + SUMMIT_MARGIN,
    mountainViewHeight(size),
  );

/** large の俯瞰の高さ(後方互換) */
export const OVERVIEW_HEIGHT = overviewHeight("large");

/** 俯瞰の基準姿勢。カメラは山の中心の真上から真下を見て、画面の上方向は yaw の向き(俯瞰に入る直前のプレイヤーの向き) */
export type OverviewPose = {position: Vec3; yaw: number};

/**
 * 俯瞰の基準姿勢。山の中心の真上から、真下を見る。
 * 画面の上方向をプレイヤーの向き(playerYaw)にするので、一人称から補間で移るときに向きが跳ばない
 */
export const computeOverviewPose = (
  center: Vec3,
  playerYaw: number,
  size: MountainSizeName = "large",
): OverviewPose => ({
  position: [center[0], center[1] + overviewHeight(size), center[2]],
  yaw: playerYaw,
});

const euler = new Euler(0, 0, 0, "YXZ");

/** 基準姿勢の向き(真下)を out に書く。カメラは固定で、狙いは画面上の仮想カーソルで行う(視点は振らない) */
export const overviewQuaternion = (
  pose: OverviewPose,
  out: Quaternion,
): Quaternion => out.setFromEuler(euler.set(-Math.PI / 2, pose.yaw, 0));
