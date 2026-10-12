import {Canvas} from "@react-three/fiber";
import type {ReactNode} from "react";
import {PCFShadowMap} from "three/webgpu";

import {useAppContext} from "../boot/context";
import {DebugOverlay} from "./debug/DebugOverlay";
import {FrameLimiter} from "./FrameLimiter";
import {getDpr} from "./graphics";
import {PointerLockInput} from "./input";
import {createRenderer} from "./renderer";

const CAMERA = {fov: 75, near: 0.05, far: 500};

/**
 * R3F は shadows=false でも PCFSoftShadowMap を設定し、WebGPURenderer がそれを「removed」と警告するので、型を明示して警告を出さない
 */
const NO_SHADOWS = {enabled: false, type: PCFShadowMap} satisfies Parameters<
  typeof Canvas
>[0]["shadows"];

export function GameCanvas({children}: {children?: ReactNode}) {
  const ctx = useAppContext();
  return (
    <Canvas
      gl={createRenderer}
      dpr={getDpr(ctx.settings)}
      frameloop={ctx.settings.fpsLimit === null ? "always" : "never"}
      camera={CAMERA}
      shadows={NO_SHADOWS}
    >
      {children}
      <FrameLimiter />
      <PointerLockInput />
      <DebugOverlay />
    </Canvas>
  );
}
