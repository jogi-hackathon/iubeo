import {lazy, Suspense, useMemo, useState} from "react";

import {BakedAO} from "./bake/BakedAO";
import {FirstPersonCamera, FlyCamera} from "./camera";
import {PostProcess, PostProcessPanel} from "./camera/postprocess";
import {useBootCover} from "./core/cover/useBootCover";
import {GameCanvas} from "./core/GameCanvas";
import {ShaderWarmup, useShaderWarmupDone} from "./core/ShaderWarmup";
import {Interaction, Reticle} from "./objects";
import {OverviewCursor} from "./objects/directory/OverviewCursor";
import {LocalPlayerSkeleton, PlayerController} from "./player";
import {scenes} from "./scenes";
import {readinessOf} from "./scenes/readiness";
import {ReportSceneReady} from "./scenes/ReportSceneReady";
import {SceneDebugPanel} from "./scenes/SceneDebugPanel";
import {useSceneState} from "./scenes/useScene";

// 開発時のみ読み込む。開発用の操作ごと、本番のバンドルには入らない
const DevTools = import.meta.env.DEV
  ? lazy(() => import("./dev/DevTools"))
  : null;

export function App() {
  // 遷移の演出中は SceneManager が commit する前なので、前のシーンを描画し続ける
  const {current: sceneName} = useSceneState();
  const Scene = scenes[sceneName];
  const warmedUp = useShaderWarmupDone();
  // 起動時の白い覆いは、ウォームアップと最初のシーンの準備が終わるまで被せる
  const [initialScene] = useState(sceneName);
  useBootCover(initialScene, warmedUp);
  // 準備を誰が知らせるかは、シーンが変わったときに 1 回だけ決める(sandbox は、そのときのセッションの有無で決まる。
  // シーンの途中でセッションが閉じても、見直さない)
  const readiness = useMemo(() => readinessOf(sceneName), [sceneName]);
  return (
    <>
      <GameCanvas>
        {Scene && <Scene key={sceneName} />}
        {/*
          シーンの準備ができたことを知らせる(mount のシーンだけ。authority のシーンは、置いた LocalAuthority / ServerAuthority が知らせる)。
          シーンの後ろに置くので、シーンの中の effect の後に知らせる。シーンが変わるたびに作り直すため key を付けるが、
          兄弟のシーンと同じ key にしない(重なると古いシーンが外れなくなる)
        */}
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
