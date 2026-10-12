import {Canvas} from "@react-three/fiber";
import type {ReactNode} from "react";
import {PCFShadowMap} from "three/webgpu";

import {useAppContext} from "../boot/context";
import {CAMERA_FOV} from "../camera/constants";
import {DebugOverlay} from "./debug/DebugOverlay";
import {FrameLimiter} from "./FrameLimiter";
import {getDpr} from "./graphics";
import {PointerLockInput} from "./input";
import {createRenderer} from "./renderer";

const CAMERA = {fov: CAMERA_FOV, near: 0.05, far: 500};

/**
 * 影は使わない。それでも明示するのは、R3F の既定(shadows=false)が three r186 では
 * 「PCFSoftShadowMap を入れる」経路になり、「PCFSoftShadowMap has been removed」の警告が出るため。
 * 明示すれば `enabled: false` と `type: PCFShadowMap` がそのまま入り、警告が出ない(見た目は変わらない。
 * 影を落とすライトが 1 つも無いので、どちらでも描画は同じ)。
 * 参照を安定させるため定数にしておく(shadows はオブジェクトだと参照で比較される)
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
