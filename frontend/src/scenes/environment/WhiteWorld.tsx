import {useFrame, useThree} from "@react-three/fiber";
import {useEffect} from "react";
import type {WebGPURenderer} from "three/webgpu";

import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "../../camera/postprocess/settings";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {playerManager} from "../../player/playerStore";
import {getSkybox, SKY_HORIZON} from "./skybox";

export function WhiteWorld() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const skybox = getSkybox();
    skybox.apply(getPostProcessSettings());
    const unsubscribe = subscribePostProcessSettings(() =>
      skybox.apply(getPostProcessSettings()),
    );
    scene.backgroundNode = skybox.node;
    const offLife = playerManager.on("lifeChanged", ({life}) => {
      if (life === "eliminated") {
        skybox.flashAnomaly();
      }
    });
    return () => {
      unsubscribe();
      offLife();
      scene.backgroundNode = null;
    };
  }, [scene]);

  useFrame(({gl, camera}) => {
    getSkybox().update(gl as unknown as WebGPURenderer, camera);
  }, FRAME_PRIORITY.sea);

  return (
    <>
      <fog attach="fog" args={[SKY_HORIZON, 15, 90]} />
      <hemisphereLight args={["#ffffff", "#efefef", 2.2]} />
      <directionalLight position={[8, 20, 6]} intensity={0.7} />
    </>
  );
}
