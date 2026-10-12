import {useFrame, useThree} from "@react-three/fiber";
import {useEffect} from "react";
import {Vector3} from "three";

import {audioManager} from "./audioManager";

const forward = new Vector3();

export function AudioListenerSync() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const unlock = () => audioManager.unlock();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useFrame(() => {
    camera.getWorldDirection(forward);
    const e = camera.matrixWorld.elements;
    audioManager.setListener(
      {x: camera.position.x, y: camera.position.y, z: camera.position.z},
      {x: forward.x, y: forward.y, z: forward.z},
      {x: e[4]!, y: e[5]!, z: e[6]!},
    );
  });

  return null;
}
