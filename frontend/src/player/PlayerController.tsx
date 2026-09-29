import { PointerLockControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Euler } from "three";
import { listColliders } from "../core/bvh";
import { useDebugFlags } from "../core/debug/flags";
import { EYE_HEIGHT, MAX_DELTA, START_POSITION } from "./constants";
import { stepPlayer } from "./physics";
import { createPlayerState } from "./state";
import type { MoveInput } from "./types";
import { useKeys } from "./useKeys";

const euler = new Euler(0, 0, 0, "YXZ");
const input: MoveInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false,
};

/** 一人称の移動。マウス視点(PointerLockControls)は FlyCamera 時も共用するので常時マウントする */
export function PlayerController() {
  const { freeCamera } = useDebugFlags();
  const keys = useKeys();
  const state = useRef(createPlayerState(...START_POSITION));

  useFrame(({ camera }, delta) => {
    if (freeCamera) return;
    const k = keys.current;
    input.forward = k.has("KeyW");
    input.back = k.has("KeyS");
    input.left = k.has("KeyA");
    input.right = k.has("KeyD");
    input.jump = k.has("Space");
    euler.setFromQuaternion(camera.quaternion);
    stepPlayer(
      state.current,
      input,
      euler.y,
      Math.min(delta, MAX_DELTA),
      listColliders(),
    );
    const p = state.current.position;
    camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
  });

  return <PointerLockControls selector="canvas" />;
}
