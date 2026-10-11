import {registerDevTab} from "../core/debug/devPanel";
import {GameDebugPanel} from "./GameDebugPanel";
import {GameFlowPanel} from "./GameFlowPanel";
import {TutorialPanel} from "./TutorialPanel";

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
registerDevTab({
  id: "tutorial",
  label: "Tutorial",
  order: 50,
  Component: TutorialPanel,
});
