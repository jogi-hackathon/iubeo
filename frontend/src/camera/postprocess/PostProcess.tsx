import {useFrame, useThree} from "@react-three/fiber";
import {useEffect, useRef} from "react";
import {type PerspectiveCamera, Vector3} from "three";
import type {Renderer, WebGPURenderer} from "three/webgpu";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {getRenderScale, graphicsStore} from "../../core/graphics";
import {updateDrawingBufferSize} from "../../core/screenPixel";
import {proxyView} from "../../transition/dive/proxyView";
import {updateGlitch} from "./glitchState";
import {createPostProcessPipeline, type PostProcessPipeline} from "./pipeline";
import {updatePowerOutline} from "./powerOutlineSelection";
import {getPostProcessSettings, subscribePostProcessSettings} from "./settings";

const cameraPosition = new Vector3();

export function PostProcess() {
  const gl = useThree((s) => s.gl) as unknown as Renderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const pipeline = useRef<PostProcessPipeline | null>(null);

  useEffect(() => {
    const p = createPostProcessPipeline(gl, scene, camera);
    p.setRenderScale(getRenderScale(graphicsStore.get()));
    p.apply(getPostProcessSettings());
    const unsubscribe = subscribePostProcessSettings(() =>
      p.apply(getPostProcessSettings()),
    );
    const unsubscribeGraphics = graphicsStore.subscribe(() =>
      p.setRenderScale(getRenderScale(graphicsStore.get())),
    );
    pipeline.current = p;
    return () => {
      unsubscribe();
      unsubscribeGraphics();
      pipeline.current = null;
      p.dispose();
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    // scene pass の中でも画面のピクセルで模様を刻めるよう、描画バッファの大きさを渡す(core/screenPixel)
    updateDrawingBufferSize(gl);
    if (proxyView.active) {
      proxyView.render(
        gl as unknown as WebGPURenderer,
        camera as PerspectiveCamera,
      );
    }
    if (pipeline.current && getPostProcessSettings().enabled) {
      updatePowerOutline(camera.getWorldPosition(cameraPosition));
      updateGlitch();
      pipeline.current.render();
    } else {
      gl.render(scene, camera);
    }
  }, FRAME_PRIORITY.render);

  return null;
}
