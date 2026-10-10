import {useFrame} from "@react-three/fiber";

import {listColliders} from "../core/bvh";
import {useDebugFlags} from "../core/debug/flags";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {consumeLookDelta, useKeys} from "../core/input";
import {isPlayerControlLocked} from "../core/playerControl";
import {MAX_DELTA} from "../core/time";
import {localPlayer} from "./local";
import {applyLook} from "./look";
import {stepPlayer} from "./physics";
import type {MoveInput} from "./types";

const input: MoveInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
};

/** ローカルプレイヤーの身体を更新する(視点入力・移動・物理)。カメラには触れない */
export function PlayerController() {
  const {freeCamera} = useDebugFlags();
  const keys = useKeys();

  useFrame((_, delta) => {
    if (freeCamera || isPlayerControlLocked()) {
      localPlayer.velocity.set(0, 0, 0);
      return;
    }
    const {dx, dy} = consumeLookDelta();
    applyLook(localPlayer, dx, dy);
    const k = keys.current;
    input.forward = k.has("KeyW");
    input.back = k.has("KeyS");
    input.left = k.has("KeyA");
    input.right = k.has("KeyD");
    input.jump = k.has("Space");
    stepPlayer(
      localPlayer,
      input,
      localPlayer.yaw,
      Math.min(delta, MAX_DELTA),
      listColliders(),
    );
  }, FRAME_PRIORITY.player);

  return null;
}
