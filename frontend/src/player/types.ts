import type { Vector3 } from "three";

export interface PlayerState {
  /** 足元の位置 */
  position: Vector3;
  velocity: Vector3;
  onGround: boolean;
}

export interface MoveInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}
