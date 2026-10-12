import {STAGE_MS} from "./terminal";

/** 伝票が手を離れてメモ置きに着くまでの時間(飛ぶ段と同じ) */
export const SLIP_FLY_MS = STAGE_MS.fly;
/** 飛ぶ途中で持ち上がる高さ(m) */
export const FLY_ARC = 0.35;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/**
 * 飛ぶ進み(0..1)から、始点と終点の間の位置の割合と、山なりの持ち上がり(0..1、途中で最大)を返す。
 * 姿勢も position の割合で始点から終点へ回す
 */
export const slipFlight = (t: number): {position: number; lift: number} => {
  const u = clamp01(t);
  return {position: easeInOut(u), lift: Math.sin(Math.PI * u)};
};
