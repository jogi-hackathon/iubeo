import {type Clip, mirrorPose, poseOf, type PoseSpec} from "./pose";

const IDLE_SPEC: PoseSpec = {
  head: [0, 1.6, 0],
  lShoulder: [-0.2, 1.38, 0],
  rShoulder: [0.2, 1.38, 0],
  lElbow: [-0.24, 1.12, 0],
  rElbow: [0.24, 1.12, 0],
  lWrist: [-0.26, 0.88, 0.02],
  rWrist: [0.26, 0.88, 0.02],
  lHip: [-0.1, 0.9, 0],
  rHip: [0.1, 0.9, 0],
  lKnee: [-0.1, 0.5, 0],
  rKnee: [0.1, 0.5, 0],
  lAnkle: [-0.1, 0.1, 0],
  rAnkle: [0.1, 0.1, 0],
  lToe: [-0.1, 0.03, -0.14],
  rToe: [0.1, 0.03, -0.14],
};

const idle = poseOf(IDLE_SPEC);

const WALK_CONTACT = poseOf({
  ...IDLE_SPEC,
  head: [0, 1.58, 0],
  lShoulder: [-0.2, 1.36, 0],
  rShoulder: [0.2, 1.36, 0],
  lElbow: [-0.22, 1.12, 0.08],
  rElbow: [0.22, 1.12, -0.1],
  lWrist: [-0.22, 0.9, 0.16],
  rWrist: [0.22, 0.92, -0.24],
  lHip: [-0.1, 0.88, 0],
  rHip: [0.1, 0.88, 0],
  lKnee: [-0.1, 0.48, -0.16],
  rKnee: [0.1, 0.5, 0.12],
  lAnkle: [-0.1, 0.12, -0.28],
  rAnkle: [0.1, 0.16, 0.26],
  lToe: [-0.1, 0.17, -0.42],
  rToe: [0.1, 0.03, 0.16],
});

const WALK_PASSING = poseOf({
  ...IDLE_SPEC,
  head: [0, 1.62, 0],
  lShoulder: [-0.2, 1.4, 0],
  rShoulder: [0.2, 1.4, 0],
  lElbow: [-0.24, 1.14, 0],
  rElbow: [0.24, 1.14, -0.02],
  lWrist: [-0.25, 0.9, 0.02],
  rWrist: [0.25, 0.9, -0.05],
  lHip: [-0.1, 0.92, 0],
  rHip: [0.1, 0.92, 0],
  lKnee: [-0.1, 0.52, -0.03],
  rKnee: [0.1, 0.56, -0.2],
  lAnkle: [-0.1, 0.11, 0],
  rAnkle: [0.1, 0.24, -0.02],
  lToe: [-0.1, 0.03, -0.14],
  rToe: [0.1, 0.17, -0.15],
});

const walk: Clip = {
  loop: true,
  frames: [
    WALK_CONTACT,
    WALK_PASSING,
    mirrorPose(WALK_CONTACT),
    mirrorPose(WALK_PASSING),
  ],
};

const jump: Clip = {
  loop: false,
  frames: [
    poseOf({
      ...IDLE_SPEC,
      head: [0, 1.62, 0],
      lShoulder: [-0.2, 1.4, 0],
      rShoulder: [0.2, 1.4, 0],
      lElbow: [-0.28, 1.3, -0.22],
      rElbow: [0.28, 1.3, -0.22],
      lWrist: [-0.28, 1.48, -0.4],
      rWrist: [0.28, 1.48, -0.4],
      lHip: [-0.1, 0.92, 0],
      rHip: [0.1, 0.92, 0],
      lKnee: [-0.1, 0.52, 0.03],
      rKnee: [0.1, 0.52, 0.03],
      lAnkle: [-0.1, 0.14, 0.08],
      rAnkle: [0.1, 0.14, 0.08],
      lToe: [-0.1, 0.05, -0.04],
      rToe: [0.1, 0.05, -0.04],
    }),
    poseOf({
      ...IDLE_SPEC,
      head: [0, 1.62, 0],
      lShoulder: [-0.2, 1.4, 0],
      rShoulder: [0.2, 1.4, 0],
      lElbow: [-0.44, 1.32, -0.06],
      rElbow: [0.44, 1.32, -0.06],
      lWrist: [-0.66, 1.4, -0.1],
      rWrist: [0.66, 1.4, -0.1],
      lHip: [-0.1, 0.92, 0],
      rHip: [0.1, 0.92, 0],
      lKnee: [-0.1, 0.62, -0.24],
      rKnee: [0.1, 0.62, -0.24],
      lAnkle: [-0.1, 0.32, 0.02],
      rAnkle: [0.1, 0.32, 0.02],
      lToe: [-0.1, 0.24, -0.12],
      rToe: [0.1, 0.24, -0.12],
    }),
    poseOf({
      ...IDLE_SPEC,
      head: [0, 1.62, 0],
      lShoulder: [-0.2, 1.4, 0],
      rShoulder: [0.2, 1.4, 0],
      lElbow: [-0.42, 1.48, -0.08],
      rElbow: [0.42, 1.48, -0.08],
      lWrist: [-0.6, 1.62, -0.1],
      rWrist: [0.6, 1.62, -0.1],
      lHip: [-0.1, 0.92, 0],
      rHip: [0.1, 0.92, 0],
      lKnee: [-0.12, 0.5, -0.06],
      rKnee: [0.12, 0.5, -0.06],
      lAnkle: [-0.12, 0.14, -0.02],
      rAnkle: [0.12, 0.14, -0.02],
      lToe: [-0.12, 0.05, -0.14],
      rToe: [0.12, 0.05, -0.14],
    }),
  ],
};

const hold = poseOf({
  ...IDLE_SPEC,
  lElbow: [-0.16, 1.41, -0.26],
  rElbow: [0.16, 1.41, -0.26],
  lWrist: [-0.07, 1.48, -0.51],
  rWrist: [0.07, 1.48, -0.51],
});

export const CLIPS = {
  idle: {loop: true, frames: [idle]},
  walk,
  jump,
  hold: {loop: false, frames: [hold]},
} as const satisfies Record<string, Clip>;
