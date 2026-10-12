import type {PlayerState} from "../player/types";
import type {Vec3} from "../props/types";

export type Spawn = {position: Vec3; yaw: number};

export const applySpawn = (player: PlayerState, spawn: Spawn): void => {
  player.position.set(...spawn.position);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  player.yaw = spawn.yaw;
  player.pitch = 0;
};
