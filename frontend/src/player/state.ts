import {Vector3} from "three";

import {EYE_HEIGHT} from "./constants";
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

/** 目の位置(ワールド座標)を out に書く */
export const getEyePosition = (state: PlayerState, out: Vector3): Vector3 =>
  out.copy(state.position).setY(state.position.y + EYE_HEIGHT);
