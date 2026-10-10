import {lazy, Suspense, useMemo, useState} from "react";

import {BakedAO} from "./bake/BakedAO";
import {FirstPersonCamera, FlyCamera} from "./camera";
import {PostProcess, PostProcessPanel} from "./camera/postprocess";
import {useBootCover} from "./core/cover/useBootCover";
import {GameCanvas} from "./core/GameCanvas";
import {ShaderWarmup, useShaderWarmupDone} from "./core/ShaderWarmup";
import {Hud} from "./game/Hud";
import {Interaction, Reticle} from "./objects";
import {OverviewCursor} from "./objects/directory/OverviewCursor";
import {LocalPlayerSkeleton, PlayerController} from "./player";
import {scenes} from "./scenes";
import {readinessOf} from "./scenes/readiness";
import {ReportSceneReady} from "./scenes/ReportSceneReady";
import {SceneDebugPanel} from "./scenes/SceneDebugPanel";
import {useSceneState} from "./scenes/useScene";

const DevTools = import.meta.env.DEV
  ? lazy(() => import("./dev/DevTools"))
  : null;

export function App() {
  const {current: sceneName} = useSceneState();
  const Scene = scenes[sceneName];
  const warmedUp = useShaderWarmupDone();
  const [initialScene] = useState(sceneName);
  useBootCover(initialScene, warmedUp);
  const readiness = useMemo(() => readinessOf(sceneName), [sceneName]);
  return (
    <>
      <GameCanvas>
        {Scene && <Scene key={sceneName} />}
        {readiness === "mount" && (
          <ReportSceneReady key={`ready:${sceneName}`} scene={sceneName} />
        )}
        <BakedAO scene={sceneName} />
        <PlayerController />
        <Interaction />
        <LocalPlayerSkeleton />
        <FirstPersonCamera />
        <FlyCamera />
        <PostProcess />
        <ShaderWarmup />
      </GameCanvas>
      <Reticle />
      <OverviewCursor />
      <Hud />
      <PostProcessPanel />
      <SceneDebugPanel />
      {DevTools && (
        <Suspense fallback={null}>
          <DevTools />
        </Suspense>
      )}
    </>
  );
}
