import {useFrame} from "@react-three/fiber";
import {Euler} from "three";

import {useDebugFlags} from "../core/debug/flags";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {getEyePosition, localPlayer} from "../player";

const euler = new Euler(0, 0, 0, "YXZ");

/** ローカルプレイヤーの目の位置と向きをカメラに写す。freeCamera 中は FlyCamera に任せる */
export function FirstPersonCamera() {
  const {freeCamera} = useDebugFlags();

  useFrame(({camera}) => {
    if (freeCamera) {
      return;
    }
    getEyePosition(localPlayer, camera.position);
    camera.quaternion.setFromEuler(
      euler.set(localPlayer.pitch, localPlayer.yaw, 0),
    );
  }, FRAME_PRIORITY.camera);

  return null;
}
