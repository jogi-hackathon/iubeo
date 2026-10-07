import {GameDebugPanel} from "./GameDebugPanel";
import {MultiplayerPanel} from "./multiplayer/MultiplayerPanel";

/**
 * 開発時のみ読み込む(App から import.meta.env.DEV のときだけ動的 import する)。
 * 読み込まれると、./authority(ダミーのサーバー役)も一緒に読み込まれて登録される
 */
export default function DevTools() {
  return (
    <>
      <GameDebugPanel />
      <MultiplayerPanel />
    </>
  );
}
