import {sceneNames} from ".";
import {createSceneManager} from "./sceneManager";

// import.meta.env を触るのはここと index.ts だけ。sceneManager.ts は純粋に保つ(テスト容易性のため)
export const sceneManager = createSceneManager({
  initial: import.meta.env.DEV ? "test" : "room",
  available: sceneNames,
});
