import {registerDevTab} from "../core/debug/devPanel";
import {GameDebugPanel} from "./GameDebugPanel";
import {GameFlowPanel} from "./GameFlowPanel";

/**
 * 開発時のみ読み込む(App から import.meta.env.DEV のときだけ動的 import する)。
 * 読み込まれると dev パネルに Game・Flow のタブが増える(開発用の操作は ./localDevOps 経由で、ローカルのオーソリティを借りる)
 */
registerDevTab({
  id: "game",
  label: "Game",
  order: 30,
  Component: GameDebugPanel,
});
registerDevTab({
  id: "flow",
  label: "Flow",
  order: 40,
  Component: GameFlowPanel,
});
