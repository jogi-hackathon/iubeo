import {sceneNames} from ".";
import {DEBUG_REQUESTED} from "../core/debug/flags";
import {createSceneManager} from "./sceneManager";

// import.meta.env を触るのはここと index.ts だけ。sceneManager.ts は純粋に保つ(テスト容易性のため)。
// 既定は room。開発時に ?debug を付けたとき(VITE_ENABLE_DEBUG=true が前提)だけ、確認用の test から始める
export const sceneManager = createSceneManager({
  initial: import.meta.env.DEV && DEBUG_REQUESTED ? "test" : "room",
  available: sceneNames,
});
