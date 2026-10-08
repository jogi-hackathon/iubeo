import {lazy, Suspense} from "react";

import {BakedAO} from "./bake/BakedAO";
import {FirstPersonCamera, FlyCamera} from "./camera";
import {PostProcess, PostProcessPanel} from "./camera/postprocess";
import {GameCanvas} from "./core/GameCanvas";
import {ShaderWarmup, useShaderWarmupDone} from "./core/ShaderWarmup";
import {Interaction, Reticle} from "./objects";
import {OverviewCursor} from "./objects/directory/OverviewCursor";
import {LocalPlayerSkeleton, PlayerController} from "./player";
import {scenes} from "./scenes";
import {SceneDebugPanel} from "./scenes/SceneDebugPanel";
import {useSceneState} from "./scenes/useScene";

// 開発時のみ読み込む。ダミーのサーバー役ごと、本番のバンドルには入らない
const DevTools = import.meta.env.DEV
  ? lazy(() => import("./dev/DevTools"))
  : null;

export function App() {
  // 遷移の演出中は SceneManager が commit する前なので、前のシーンを描画し続ける
  const {current: sceneName} = useSceneState();
  const Scene = scenes[sceneName];
  const warmedUp = useShaderWarmupDone();
  return (
    <>
      <GameCanvas>
        {Scene && <Scene key={sceneName} />}
        <BakedAO scene={sceneName} />
        <PlayerController />
        <Interaction />
        <LocalPlayerSkeleton />
        <FirstPersonCamera />
        <FlyCamera />
        <PostProcess />
        <ShaderWarmup />
      </GameCanvas>
      {!warmedUp && (
        <div className="boot-screen boot-overlay">
          <p>Loading...</p>
          <p>shaders</p>
        </div>
      )}
      <Reticle />
      <OverviewCursor />
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
