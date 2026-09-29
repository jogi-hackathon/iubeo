import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Renderer } from "three/webgpu";
import { FRAME_PRIORITY } from "../../core/frameOrder";
import {
  createPostProcessPipeline,
  type PostProcessPipeline,
} from "./pipeline";
import {
  getPostProcessSettings,
  subscribePostProcessSettings,
} from "./settings";

const isWebGPURenderer = (gl: unknown): gl is Renderer =>
  (gl as { isWebGPURenderer?: boolean }).isWebGPURenderer === true;

/** frameloop="never" + FrameLimiter の advance でも、正の priority の useFrame が描画を引き受ける */
function WebGPUPostProcess({ gl }: { gl: Renderer }) {
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
      pipeline.current.render();
    } else {
      // 無効時・構築前は自動レンダーの代わりに素で描く
      gl.render(scene, camera);
    }
  }, FRAME_PRIORITY.render);

  return null;
}

/** WebGPURenderer(WebGL2 フォールバック含む)のときだけ RenderPipeline で描画する。WebGLRenderer では何もしない */
export function PostProcess() {
  const gl = useThree((s) => s.gl);
  return isWebGPURenderer(gl) ? <WebGPUPostProcess gl={gl} /> : null;
}
