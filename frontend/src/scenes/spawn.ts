import type {PlayerState} from "../player/types";
import type {Vec3} from "../props/types";

/** シーンのスポーン地点。position は足元、yaw は向き(0 で -Z 向き) */
export type Spawn = {position: Vec3; yaw: number};

/** player をスポーン地点へ戻す(位置・速度・向き。pitch は水平に戻す) */
export const applySpawn = (player: PlayerState, spawn: Spawn): void => {
  player.position.set(...spawn.position);
  player.velocity.set(0, 0, 0);
  player.onGround = false;
  player.yaw = spawn.yaw;
  player.pitch = 0;
};
