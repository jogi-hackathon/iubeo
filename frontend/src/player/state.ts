import {Vector3} from "three";

import {EYE_FORWARD, EYE_HEIGHT} from "./constants";
import type {PlayerState} from "./types";

export const createPlayerState = (
  x: number,
  y: number,
  z: number,
): PlayerState => ({
  position: new Vector3(x, y, z),
  velocity: new Vector3(),
  onGround: false,
  yaw: 0,
  pitch: 0,
});

/** 目の位置(ワールド座標)を out に書く。足元から EYE_HEIGHT 上で、身体の向き(yaw)へ EYE_FORWARD だけ前 */
export const getEyePosition = (state: PlayerState, out: Vector3): Vector3 =>
  out.set(
    state.position.x - Math.sin(state.yaw) * EYE_FORWARD,
    state.position.y + EYE_HEIGHT,
    state.position.z - Math.cos(state.yaw) * EYE_FORWARD,
  );
