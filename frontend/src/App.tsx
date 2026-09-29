import { GameCanvas } from "./core/GameCanvas";
import { FlyCamera, PlayerController } from "./player";
import { type SceneName, scenes } from "./scenes";

const CURRENT_SCENE: SceneName = "test";

export function App() {
  const Scene = scenes[CURRENT_SCENE];
  return (
    <GameCanvas>
      <Scene />
      <PlayerController />
      <FlyCamera />
    </GameCanvas>
  );
}
