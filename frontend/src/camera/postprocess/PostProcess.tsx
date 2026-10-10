import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useRef} from "react";
import {Vector3} from "three";
import type {Renderer} from "three/webgpu";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {createPostProcessPipeline, type PostProcessPipeline} from "./pipeline";
import {updatePowerOutline} from "./powerOutlineSelection";
import {getPostProcessSettings, subscribePostProcessSettings} from "./settings";

const cameraPosition = new Vector3();

/** frameloop="never" + FrameLimiter の advance でも、正の priority の useFrame が描画を引き受ける。レンダラーは WebGPURenderer 固定(core/renderer.ts) */
export function PostProcess() {
  const gl = useThree((s) => s.gl) as unknown as Renderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const pipeline = useRef<PostProcessPipeline | null>(null);

  useEffect(() => {
    const p = createPostProcessPipeline(gl, scene, camera);
    p.apply(getPostProcessSettings());
    const unsubscribe = subscribePostProcessSettings(() =>
      p.apply(getPostProcessSettings()),
    );
    pipeline.current = p;
    return () => {
      unsubscribe();
      pipeline.current = null;
      p.dispose();
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    if (pipeline.current && getPostProcessSettings().enabled) {
      updatePowerOutline(camera.getWorldPosition(cameraPosition));
      pipeline.current.render();
    } else {
      gl.render(scene, camera);
    }
  }, FRAME_PRIORITY.render);

  return null;
}
