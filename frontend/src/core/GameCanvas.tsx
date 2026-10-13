import {Canvas} from "@react-three/fiber";
import type {ReactNode} from "react";
import {PCFShadowMap} from "three/webgpu";

import {CAMERA_FOV} from "../camera/constants";
import {AudioListenerSync} from "./audio/AudioListenerSync";
import {DebugOverlay} from "./debug/DebugOverlay";
import {FrameLimiter} from "./FrameLimiter";
import {getDpr, graphicsStore} from "./graphics";
import {PointerLockInput} from "./input";
import {createRenderer} from "./renderer";
import {useStore} from "./storage";

const CAMERA = {fov: CAMERA_FOV, near: 0.05, far: 500};

/**
 * R3F は shadows=false でも PCFSoftShadowMap を設定し、WebGPURenderer がそれを「removed」と警告するので、型を明示して警告を出さない
 */
const NO_SHADOWS = {enabled: false, type: PCFShadowMap} satisfies Parameters<
  typeof Canvas
>[0]["shadows"];

export function GameCanvas({children}: {children?: ReactNode}) {
  const settings = useStore(graphicsStore);
  return (
    <Canvas
      gl={createRenderer}
      dpr={getDpr(settings)}
      frameloop="never"
      camera={CAMERA}
      shadows={NO_SHADOWS}
    >
      {children}
      <AudioListenerSync />
      <FrameLimiter />
      <PointerLockInput />
      <DebugOverlay />
    </Canvas>
  );
}
