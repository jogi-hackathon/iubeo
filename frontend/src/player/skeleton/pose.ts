import type {Vector3Tuple} from "three";

import {
  J,
  JOINT_COUNT,
  JOINTS,
  type JointName,
  mirrorName,
  NECK,
} from "./joints";

export type Pose = Float32Array;

export type PoseSpec = Record<JointName, Vector3Tuple>;

export interface Clip {
  loop: boolean;
  frames: readonly Pose[];
}

export const at = (a: ArrayLike<number>, i: number): number => {
  const value = a[i];
  if (value === undefined) {
    throw new Error(`index ${i} out of range`);
  }
  return value;
};

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

export const lerpPose = (out: Pose, a: Pose, b: Pose, w: number): Pose => {
  for (let i = 0; i < out.length; i++) {
    const from = at(a, i);
    out[i] = from + (at(b, i) - from) * w;
  }
  return out;
};

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

export const writePoints = (out: Float32Array, pose: Pose): void => {
  out.set(pose);
  const ls = J.lShoulder * 3;
  const rs = J.rShoulder * 3;
  for (let k = 0; k < 3; k++) {
    out[NECK * 3 + k] = (at(pose, ls + k) + at(pose, rs + k)) / 2;
  }
};
