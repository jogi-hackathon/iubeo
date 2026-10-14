import {useEffect, useMemo, useState} from "react";

import {BakedAO} from "./bake/BakedAO";
import {FirstPersonCamera, FlyCamera} from "./camera";
import {PostProcess, PostProcessPanel} from "./camera/postprocess";
import {useBootCover} from "./core/cover/useBootCover";
import {registerDevTab} from "./core/debug/devPanel";
import {DevPanelManager} from "./core/debug/DevPanelManager";
import {GameCanvas} from "./core/GameCanvas";
import {ShaderWarmup, useShaderWarmupDone} from "./core/ShaderWarmup";
import {OrderSlipDirector} from "./game/slip/OrderSlipDirector";
import {Interaction, Reticle} from "./objects";
import {OverviewCursor} from "./objects/directory/OverviewCursor";
import {LocalPlayerSkeleton, PlayerController} from "./player";
import {PresentOverlay} from "./present/PresentOverlay";
import {PresentPanel} from "./present/PresentPanel";
import {RiseDirector} from "./present/RiseDirector";
import {scenes} from "./scenes";
import {readinessOf} from "./scenes/readiness";
import {ReportSceneReady} from "./scenes/ReportSceneReady";
import {SceneDebugPanel} from "./scenes/SceneDebugPanel";
import {useSceneState} from "./scenes/useScene";
import {DiveDirector, WarmupProbe} from "./transition/dive/DiveDirector";
import {startTutorialPresenceHeartbeat} from "./tutorial";

registerDevTab({
  id: "scene",
  label: "Scene",
  order: 10,
  Component: SceneDebugPanel,
});
registerDevTab({
  id: "postfx",
  label: "PostFX",
  order: 20,
  Component: PostProcessPanel,
});
registerDevTab({
  id: "present",
  label: "Present",
  order: 25,
  Component: PresentPanel,
});
if (import.meta.env.DEV) {
  void import("./dev/DevTools");
}

export function App() {
  const {current: sceneName} = useSceneState();
  const Scene = scenes[sceneName];
  const warmedUp = useShaderWarmupDone();
  const [initialScene] = useState(sceneName);
  useBootCover(initialScene, warmedUp);
  const readiness = useMemo(() => readinessOf(sceneName), [sceneName]);

  useEffect(() => startTutorialPresenceHeartbeat(), []);

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
        <OrderSlipDirector />
        <FirstPersonCamera />
        <RiseDirector />
        <FlyCamera />
        <DiveDirector />
        <WarmupProbe />
        <PostProcess />
        <ShaderWarmup />
      </GameCanvas>
      <Reticle />
      <OverviewCursor />
      <DevPanelManager />
      <PresentOverlay />
    </>
  );
}
