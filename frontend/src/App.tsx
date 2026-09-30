import {BakedAO} from "./bake/BakedAO";
import {FirstPersonCamera, FlyCamera} from "./camera";
import {PostProcess, PostProcessPanel} from "./camera/postprocess";
import {GameCanvas} from "./core/GameCanvas";
import {LocalPlayerSkeleton, PlayerController} from "./player";
import {scenes} from "./scenes";
import {SceneDebugPanel} from "./scenes/SceneDebugPanel";
import {useSceneState} from "./scenes/useScene";

export function App() {
  const sceneState = useSceneState();
  // 遷移中は from のシーンを描画し続け、idle になった時点で to に切り替える
  const sceneName =
    sceneState.status === "idle" ? sceneState.current : sceneState.from;
  const Scene = scenes[sceneName];
  return (
    <>
      <GameCanvas>
        {Scene && <Scene key={sceneName} />}
        <BakedAO scene={sceneName} />
        <PlayerController />
        <LocalPlayerSkeleton />
        <FirstPersonCamera />
        <FlyCamera />
        <PostProcess />
      </GameCanvas>
      <PostProcessPanel />
      <SceneDebugPanel />
    </>
  );
}
