import type {Vector3Tuple} from "three";

import {
  J,
  JOINT_COUNT,
  JOINTS,
  type JointName,
  mirrorName,
  NECK,
} from "./joints";

/** 関節ごとの xyz を並べた配列(JOINT_COUNT * 3)。関節の並びは JOINTS 参照 */
export type Pose = Float32Array;

export type PoseSpec = Record<JointName, Vector3Tuple>;

/** アニメーションの1本。frames は等間隔のキーフレーム。loop なら最後から最初へ繋がる */
export interface Clip {
  loop: boolean;
  frames: readonly Pose[];
}

/** noUncheckedIndexedAccess を満たすための添字読み。添字は範囲内の前提なので、届かなければ 0 */
export const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;

/** clip の i 番目のフレーム。無ければ設計ミスなので投げる */
export const frameOf = (clip: Clip, i: number): Pose => {
  const frame = clip.frames[i];
  if (!frame) {
    throw new Error(`clip has no frame ${i}`);
  }
  return frame;
};

export const createPose = (): Pose => new Float32Array(JOINT_COUNT * 3);

export const poseOf = (spec: PoseSpec): Pose => {
  const pose = createPose();
  for (const [i, name] of JOINTS.entries()) {
    pose.set(spec[name], i * 3);
  }
  return pose;
};

/** 左右反転(x を反転して左右の関節を入れ替える)。歩行の後半を前半から作るのに使う */
export const mirrorPose = (pose: Pose): Pose => {
  const out = createPose();
  for (const [i, name] of JOINTS.entries()) {
    const j = J[mirrorName(name)] * 3;
    out[j] = -at(pose, i * 3);
    out[j + 1] = at(pose, i * 3 + 1);
    out[j + 2] = at(pose, i * 3 + 2);
  }
  return out;
};

/** out = a と b を w(0..1)で混ぜたもの。out は a や b と同じ配列でもよい */
export const lerpPose = (out: Pose, a: Pose, b: Pose, w: number): Pose => {
  for (let i = 0; i < out.length; i++) {
    const from = at(a, i);
    out[i] = from + (at(b, i) - from) * w;
  }
  return out;
};

/** clip を t(0..1)の位置で out に書く。loop の t は 1 で 0 に戻り、そうでなければ範囲外は端に張り付く */
export const sampleClip = (out: Pose, clip: Clip, t: number): Pose => {
  const {loop} = clip;
  const n = clip.frames.length;
  if (n === 1) {
    out.set(frameOf(clip, 0));
    return out;
  }
  const f = loop
    ? (((t % 1) + 1) % 1) * n
    : Math.min(1, Math.max(0, t)) * (n - 1);
  const i = Math.min(Math.floor(f), loop ? n - 1 : n - 2);
  const next = loop ? (i + 1) % n : i + 1;
  return lerpPose(out, frameOf(clip, i), frameOf(clip, next), f - i);
};

/** 描画用の点(関節 + 導出の首)の座標を out[index*3..] に書く。out は (JOINT_COUNT + 1) * 3 以上 */
export const writePoints = (out: Float32Array, pose: Pose): void => {
  out.set(pose);
  const ls = J.lShoulder * 3;
  const rs = J.rShoulder * 3;
  for (let k = 0; k < 3; k++) {
    out[NECK * 3 + k] = (at(pose, ls + k) + at(pose, rs + k)) / 2;
  }
};
