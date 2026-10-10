import {GameDebugPanel} from "./GameDebugPanel";
import {GameFlowPanel} from "./GameFlowPanel";

/**
 * 開発時のみ読み込む(App から import.meta.env.DEV のときだけ動的 import する)。
 * 読み込まれると、デバッグパネルとゲームの流れのパネルが出る(開発用の操作は ./localDevOps 経由で、ローカルのオーソリティを借りる)
 */
export default function DevTools() {
  return (
    <>
      <GameDebugPanel />
      <GameFlowPanel />
    </>
  );
}
