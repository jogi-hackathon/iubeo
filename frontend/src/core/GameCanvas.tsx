import { Canvas } from "@react-three/fiber";
import { type ReactNode, useMemo } from "react";
import { useAppContext } from "../boot/context";
import { DebugOverlay } from "./debug/DebugOverlay";
import { FrameLimiter } from "./FrameLimiter";
import { getDpr } from "./graphics";
import { PointerLockInput } from "./input";
import { createRenderer } from "./renderer";

const CAMERA = { fov: 75, near: 0.05, far: 500 };

export function GameCanvas({ children }: { children?: ReactNode }) {
  const ctx = useAppContext();
  const gl = useMemo(() => createRenderer(ctx), [ctx]);
  return (
    <Canvas
      gl={gl}
      dpr={getDpr(ctx.settings)}
      frameloop={ctx.settings.fpsLimit === null ? "always" : "never"}
      camera={CAMERA}
    >
      {children}
      <FrameLimiter />
      <PointerLockInput />
      <DebugOverlay />
    </Canvas>
  );
}
