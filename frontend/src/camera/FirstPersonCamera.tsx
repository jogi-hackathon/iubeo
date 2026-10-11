import {useFrame} from "@react-three/fiber";
import {Euler} from "three";

import {useDebugFlags} from "../core/debug/flags";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {isPlayerControlLocked} from "../core/playerControl";
import {useSpectatePhase} from "../core/spectate";
import {getEyePosition, localPlayer} from "../player";

const euler = new Euler(0, 0, 0, "YXZ");

export function FirstPersonCamera() {
  const {freeCamera} = useDebugFlags();
  const spectate = useSpectatePhase();

  useFrame(({camera}) => {
    if (freeCamera || spectate !== "alive" || isPlayerControlLocked()) {
      return;
    }
    getEyePosition(localPlayer, camera.position);
    camera.quaternion.setFromEuler(
      euler.set(localPlayer.pitch, localPlayer.yaw, 0),
    );
  }, FRAME_PRIORITY.camera);

  return null;
}
