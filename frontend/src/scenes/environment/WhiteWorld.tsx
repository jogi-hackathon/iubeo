import {useFrame, useThree} from "@react-three/fiber";
import {useEffect} from "react";
import type {WebGPURenderer} from "three/webgpu";

import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "../../camera/postprocess/settings";
import {FRAME_PRIORITY} from "../../core/frameOrder";
import {gameStore, remainingMs} from "../../game/gameStore";
import {playerManager} from "../../player/playerStore";
import {getSkybox, SKY_HORIZON} from "./skybox";
import {WORLD_LIGHT} from "./worldLight";

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
    const skybox = getSkybox();
    skybox.setCountdown(remainingMs(gameStore.getState(), Date.now()));
    skybox.update(gl as unknown as WebGPURenderer, camera);
  }, FRAME_PRIORITY.sea);

  return (
    <>
      <fog attach="fog" args={[SKY_HORIZON, 15, 90]} />
      <hemisphereLight
        args={[
          WORLD_LIGHT.hemisphere.sky,
          WORLD_LIGHT.hemisphere.ground,
          WORLD_LIGHT.hemisphere.intensity,
        ]}
      />
      <directionalLight
        color={WORLD_LIGHT.sun.color}
        position={WORLD_LIGHT.sun.position}
        intensity={WORLD_LIGHT.sun.intensity}
      />
    </>
  );
}
