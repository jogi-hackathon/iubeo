import type {CSSProperties} from "react";

import {sceneNames} from ".";
import {useDebugFlags} from "../core/debug/flags";
import {sceneManager} from "./sceneStore";
import {useSceneState} from "./useScene";

// パネルは Canvas の外の DOM なので、操作するには Esc で pointer lock を解除してから使う。
// PostProcessPanel(右上)と重ならないよう左上に置く
const panelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
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

/** F10 で開くシーン管理パネル(VITE_ENABLE_DEBUG=true のときのみ)。sceneManager を直接操作する */
export function SceneDebugPanel() {
  const {scene} = useDebugFlags();
  const state = useSceneState();
  if (!scene) {
    return null;
  }

  const transitioning = state.status === "transitioning";
  return (
    <div style={panelStyle}>
      <div>
        {state.status === "idle"
          ? `idle: ${state.current}`
          : `transitioning: ${state.from} -> ${state.to}`}
      </div>
      <div style={rowStyle}>
        {sceneNames.map((name) => (
          <button
            key={name}
            type="button"
            disabled={
              transitioning ||
              (state.status === "idle" && state.current === name)
            }
            onClick={() => void sceneManager.goTo(name)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
