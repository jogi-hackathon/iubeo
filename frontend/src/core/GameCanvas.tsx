import { Canvas } from "@react-three/fiber";
import type { ReactNode } from "react";
import { DebugOverlay } from "./debug/DebugOverlay";
import { FrameLimiter } from "./FrameLimiter";
import { getDpr, graphicsSettings } from "./graphics";
import { createRenderer } from "./renderer";

const CAMERA = { fov: 75, near: 0.05, far: 500 };

export function GameCanvas({ children }: { children?: ReactNode }) {
  return (
    <Canvas
      gl={createRenderer}
      dpr={getDpr()}
      frameloop={graphicsSettings.fpsLimit === null ? "always" : "never"}
      shadows="percentage"
      camera={CAMERA}
    >
      {children}
      <FrameLimiter />
      <DebugOverlay />
    </Canvas>
  );
}
