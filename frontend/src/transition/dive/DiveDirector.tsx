import {useFrame, useThree} from "@react-three/fiber";
import {useEffect} from "react";
import type {PerspectiveCamera} from "three";
import type {WebGPURenderer} from "three/webgpu";

import {FRAME_PRIORITY} from "../../core/frameOrder";
import {consumeLookDelta} from "../../core/input";
import {useShaderWarmupDone} from "../../core/ShaderWarmup";
import {MAX_DELTA} from "../../core/time";
import {gameFlow} from "../../flow/store";
import {getPortalMaterial} from "../../objects/pc/pcScreenRegistry";
import {
  attachDiveCamera,
  isDiving,
  registerDiveStyle,
  tickDive,
} from "./diveStyle";
import {bindPrefetchRenderer, prefetchProxyAtlas} from "./proxyPrefetch";
import {proxyView} from "./proxyView";

export function DiveDirector() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => registerDiveStyle(), []);

  useEffect(() => {
    attachDiveCamera(camera as PerspectiveCamera);
    return () => attachDiveCamera(null);
  }, [camera]);

  useEffect(() => {
    proxyView
      .precompile(gl as unknown as WebGPURenderer)
      .catch((e) => console.error(e));
  }, [gl]);

  useEffect(() => {
    bindPrefetchRenderer(gl as unknown as WebGPURenderer);
    const check = () => {
      const {status} = gameFlow.getState();
      if (status === "issuing" || status === "queued") {
        prefetchProxyAtlas("sandbox");
      }
    };
    check();
    const unsubscribe = gameFlow.subscribe(check);
    return () => {
      unsubscribe();
      bindPrefetchRenderer(null);
    };
  }, [gl]);

  useFrame((_, dt) => {
    if (isDiving()) {
      consumeLookDelta();
    }
    tickDive(Math.min(dt, MAX_DELTA));
  }, FRAME_PRIORITY.camera);

  return null;
}

export function WarmupProbe() {
  const warmedUp = useShaderWarmupDone();
  if (warmedUp) {
    return null;
  }
  return (
    <mesh material={getPortalMaterial()} position={[0, -1000, 0]}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
