import { Vector3 } from "three";
import type { PlayerState } from "./types";

export const createPlayerState = (
  x: number,
  y: number,
  z: number,
): PlayerState => ({
  position: new Vector3(x, y, z),
  velocity: new Vector3(),
  onGround: false,
});
