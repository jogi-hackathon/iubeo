import {useFrame} from "@react-three/fiber";
import {useEffect, useRef} from "react";
import {Euler} from "three";

import {useDebugFlags} from "../core/debug/flags";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {consumeLookDelta} from "../core/input";
import {useSpectatePhase} from "../core/spectate";
import {getEyePosition, localPlayer} from "../player";
import {RISE_DURATION_MS, riseAt, riseEyeHeight} from "./rise";
import {riseStore} from "./riseStore";

const euler = new Euler(0, 0, 0, "YXZ");
const MAX_FRAME_MS = 50;

export function RiseDirector() {
  const {freeCamera} = useDebugFlags();
  const spectate = useSpectatePhase();
  const clock = useRef<{key: number; elapsed: number} | null>(null);

  useEffect(() => riseStore.finish, []);

  useFrame(({camera}, delta) => {
    const state = riseStore.getState();
    if (state === null) {
      clock.current = null;
      return;
    }
    consumeLookDelta();
    if (clock.current?.key !== state.startedAt) {
      clock.current = {key: state.startedAt, elapsed: 0};
    } else {
      clock.current.elapsed += Math.min(delta * 1000, MAX_FRAME_MS);
    }
    const elapsed = clock.current.elapsed;
    if (!freeCamera && spectate === "alive") {
      const {height, roll, pitch} = riseAt(elapsed);
      getEyePosition(localPlayer, camera.position);
      camera.position.y = localPlayer.position.y + riseEyeHeight(height);
      camera.quaternion.setFromEuler(
        euler.set(localPlayer.pitch + pitch, localPlayer.yaw, roll),
      );
    }
    if (elapsed >= RISE_DURATION_MS) {
      riseStore.finish();
    }
  }, FRAME_PRIORITY.camera + 0.5);

  return null;
}
