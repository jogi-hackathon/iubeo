import {J, NECK} from "./joints";
import {at} from "./pose";

/** 視線の pitch のうち、上半身全体の傾きに回す割合。残りは頭(首)が受け持つ */
export const TORSO_PITCH_RATIO = 0.4;
/** 上半身の前傾(下を向いたとき)と後傾(上を向いたとき)の上限(rad) */
export const MAX_LEAN_FORWARD = 0.6;
export const MAX_LEAN_BACK = 0.3;
/** 首の曲げ(上半身の傾きに足す分)の上限(rad) */
export const MAX_NECK_BEND = 0.8;

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/** 点 i を、pivot(x,y,z)を通る X 軸まわりに前傾 angle(rad, 前=-Z へ倒れる向きが正)だけ回す */
const lean = (
  points: Float32Array,
  i: number,
  pivotY: number,
  pivotZ: number,
  angle: number,
): void => {
  const y = at(points, i * 3 + 1) - pivotY;
  const z = at(points, i * 3 + 2) - pivotZ;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  points[i * 3 + 1] = pivotY + y * cos + z * sin;
  points[i * 3 + 2] = pivotZ - y * sin + z * cos;
};

const UPPER_BODY = [
  J.lShoulder,
  J.rShoulder,
  J.lElbow,
  J.rElbow,
  J.lWrist,
  J.rWrist,
  NECK,
] as const;

/**
 * 視線の上下(pitch。上向きが正)に上半身を合わせる。writePoints の結果に後掛けする。
 * 下を向くと腰を支点に上半身が前へ倒れ、頭は首でさらに下を向く。腰から下は動かない。
 * 入力は PlayerState の pitch だけで、カメラには依存しない(他プレイヤーもサーバーの状態から同じ形になる)
 */
export const applyLean = (points: Float32Array, pitch: number): void => {
  const pivotY = (at(points, J.lHip * 3 + 1) + at(points, J.rHip * 3 + 1)) / 2;
  const pivotZ = (at(points, J.lHip * 3 + 2) + at(points, J.rHip * 3 + 2)) / 2;

  const torso = clamp(
    -pitch * TORSO_PITCH_RATIO,
    -MAX_LEAN_BACK,
    MAX_LEAN_FORWARD,
  );
  for (const i of [...UPPER_BODY, J.head]) {
    lean(points, i, pivotY, pivotZ, torso);
  }

  // 頭は、傾いた上半身の首(NECK)を支点に、視線との差の分だけさらに曲げる
  const neck = bend(-pitch - torso);
  lean(
    points,
    J.head,
    at(points, NECK * 3 + 1),
    at(points, NECK * 3 + 2),
    neck,
  );
};

const bend = (angle: number): number =>
  clamp(angle, -MAX_NECK_BEND, MAX_NECK_BEND);
