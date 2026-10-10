import {JUMP_SPEED} from "../constants";
import type {PlayerState} from "../types";
import {CLIPS} from "./clips";
import {J} from "./joints";
import {at, createPose, frameOf, lerpPose, type Pose, sampleClip} from "./pose";

/** これ未満の水平速度は静止とみなす(m/s) */
export const WALK_MIN_SPEED = 0.3;
/** 歩行 1 周期(2 歩)で進む距離(m)。足が滑らないよう速度に合わせて再生する */
export const STRIDE_LENGTH = 2.4;
/** 表示ポーズが目標ポーズへ追従する速さ(1/秒)。状態の切り替わりで形が飛ばない程度に滑らかにする */
export const POSE_SMOOTHING = 20;

/** 1 体ぶんのアニメーション状態。pose が描画に使う現在のポーズ */
export interface Animator {
  /** 歩行の位相(0..1) */
  phase: number;
  pose: Pose;
  target: Pose;
  started: boolean;
}

export const createAnimator = (): Animator => ({
  phase: 0,
  pose: createPose(),
  target: createPose(),
  started: false,
});

type AnimatedState = Pick<PlayerState, "velocity" | "onGround" | "yaw">;

const hold = frameOf(CLIPS.hold, 0);

const applyHoldArms = (target: Pose): void => {
  for (const side of ["l", "r"] as const) {
    const shoulder = J[`${side}Shoulder`] * 3;
    for (const joint of [J[`${side}Elbow`], J[`${side}Wrist`]]) {
      for (let k = 0; k < 3; k++) {
        const i = joint * 3 + k;
        target[i] =
          at(hold, i) - at(hold, shoulder + k) + at(target, shoulder + k);
      }
    }
  }
};

/**
 * 状態からポーズを決めて a.pose を更新する。
 * - 空中: 上下方向の速度でジャンプの上昇→頂点→落下を引く(時間ではなく物理に同期)
 * - 接地して動いている: 速度に比例して歩行の位相を進める。後ろ向きに動くときは逆再生
 * - それ以外: 待機
 * - holding: 腕だけ上書き
 */
export const updateAnimator = (
  a: Animator,
  state: AnimatedState,
  holding: boolean,
  dt: number,
): void => {
  const {velocity, onGround, yaw} = state;
  const speed = Math.hypot(velocity.x, velocity.z);

  if (!onGround) {
    const u = 0.5 - velocity.y / (2 * JUMP_SPEED);
    sampleClip(a.target, CLIPS.jump, u);
  } else if (speed >= WALK_MIN_SPEED) {
    const forward = -Math.sin(yaw) * velocity.x - Math.cos(yaw) * velocity.z;
    const dir = forward < 0 ? -1 : 1;
    a.phase = (((a.phase + (dir * speed * dt) / STRIDE_LENGTH) % 1) + 1) % 1;
    sampleClip(a.target, CLIPS.walk, a.phase);
  } else {
    sampleClip(a.target, CLIPS.idle, 0);
  }
  if (holding) {
    applyHoldArms(a.target);
  }

  const w = a.started ? 1 - Math.exp(-POSE_SMOOTHING * dt) : 1;
  a.started = true;
  lerpPose(a.pose, a.pose, a.target, w);
};
