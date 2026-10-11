import type {CSSProperties} from "react";

import {useDebugFlags} from "../core/debug/flags";
import {completeTutorial, resetTutorial, useTutorial} from "../tutorial";

const panelStyle: CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  boxSizing: "border-box",
  width: 220,
  padding: "6px 8px",
  font: "11px/1.5 ui-monospace, Menlo, monospace",
  color: "#fff",
  background: "rgba(0,0,0,0.75)",
  zIndex: 10001,
};
const rowStyle: CSSProperties = {display: "flex", gap: 6, marginTop: 4};

export function TutorialPanel() {
  const {game} = useDebugFlags();
  const {completed} = useTutorial();
  if (!game) {
    return null;
  }
  return (
    <div style={panelStyle}>
      <div>tutorial: {completed ? "完了" : "未完了"}</div>
      <div style={rowStyle}>
        <button type="button" onClick={() => completeTutorial()}>
          complete
        </button>
        <button type="button" onClick={() => resetTutorial()}>
          reset
        </button>
      </div>
    </div>
  );
}
