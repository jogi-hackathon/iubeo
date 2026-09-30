import type {Vector3} from "three";

/** プレイヤーの識別子。識別の方式(Cookie の ID か)はまだ決まっていない */
export type PlayerId = string;

/** 視線の向き。yaw=0 で -Z 前、pitch は上向きが正 */
export interface Look {
  yaw: number;
  pitch: number;
}

export interface PlayerState {
  /** 足元の位置 */
  position: Vector3;
  velocity: Vector3;
  onGround: boolean;
  /** 身体の向き。カメラはこれを写すだけ */
  yaw: number;
  pitch: number;
}

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}
