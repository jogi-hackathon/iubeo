import {Matrix4, Quaternion, Vector3} from "three";

import {SLIP_LENGTH} from "./strip";
import {STAGE_MS, stageStart} from "./terminal";

/** 千切った伝票へ寄る(離れる)のにかける時間(ms)。見る段の頭とお尻に取る */
export const SLIP_ZOOM_MS = 350;
/** 寄ったときに伝票が画面の高さに占める割合 */
export const SLIP_ZOOM_FILL = 0.8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/** 再生の経過時間から、千切った伝票へどれだけ寄っているか(0..1)。見る段の間だけ寄り、飛ぶ前に戻る */
export const slipZoomBlend = (elapsedMs: number): number => {
  const start = stageStart("look");
  const end = start + STAGE_MS.look;
  const zoomIn = clamp01((elapsedMs - start) / SLIP_ZOOM_MS);
  const zoomOut = clamp01((end - elapsedMs) / SLIP_ZOOM_MS);
  return easeInOut(Math.min(zoomIn, zoomOut));
};

/** 縦の画角 fov(度)で、高さ height(m)の物が画面の高さの fill を占める距離 */
export const fitDistance = (height: number, fov: number, fill: number) =>
  height / 2 / fill / Math.tan((fov * Math.PI) / 360);

/**
 * 手元の伝票の世界座標。HandheldTerminal が毎フレーム書き、OrderSlipDirector が寄る先に使う
 * (カメラはプレイヤーの骨格より先に動くので、1 フレーム前の値を読む)
 */
export const heldSlipWorld = new Matrix4();

const scale = new Vector3();
const center = new Vector3();
const forward = new Vector3();

/**
 * 伝票(帯の根元が原点、+Y へ伸び、表が +Z を向く)を正面から見るカメラの姿勢。
 * 伝票の真ん中から表の向きへ fitDistance だけ離れ、伝票と同じ向きで見る
 */
export const slipZoomPose = (
  slipWorld: Matrix4,
  fov: number,
  position: Vector3,
  quaternion: Quaternion,
): void => {
  slipWorld.decompose(position, quaternion, scale);
  const height = SLIP_LENGTH * scale.y;
  center.set(0, SLIP_LENGTH / 2, 0).applyMatrix4(slipWorld);
  forward.set(0, 0, 1).applyQuaternion(quaternion);
  position
    .copy(center)
    .addScaledVector(forward, fitDistance(height, fov, SLIP_ZOOM_FILL));
};
