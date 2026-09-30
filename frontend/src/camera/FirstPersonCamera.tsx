import {useFrame} from "@react-three/fiber";
import {Euler} from "three";

import {useDebugFlags} from "../core/debug/flags";
import {FRAME_PRIORITY} from "../core/frameOrder";
import {isPlayerControlLocked} from "../core/playerControl";
import {getEyePosition, localPlayer} from "../player";

const euler = new Euler(0, 0, 0, "YXZ");

/**
 * ローカルプレイヤーの目の位置と向きをカメラに写す。freeCamera 中は FlyCamera に、
 * 別の演出がプレイヤーを預かっている間(俯瞰ビューなど)はその演出に任せる
 */
export function FirstPersonCamera() {
  const {freeCamera} = useDebugFlags();

  useFrame(({camera}) => {
    if (freeCamera || isPlayerControlLocked()) {
      return;
    }
    getEyePosition(localPlayer, camera.position);
    camera.quaternion.setFromEuler(
      euler.set(localPlayer.pitch, localPlayer.yaw, 0),
    );
  }, FRAME_PRIORITY.camera);

  return null;
}
