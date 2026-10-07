import type {CSSProperties} from "react";

import {sceneNames} from ".";
import {useDebugFlags} from "../core/debug/flags";
import {toggles, useToggleState} from "../core/toggles";
import {ROOM_PROP_KEYS} from "./RoomScene/props";
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
  const {hidden, disabled} = useToggleState();
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
      {state.status === "idle" && state.current === "room" && (
        <div style={{marginTop: 6}}>
          <div>room: 表示 / 機能</div>
          {ROOM_PROP_KEYS.map((key) => (
            <div key={key}>
              <input
                type="checkbox"
                aria-label={`${key} 表示`}
                checked={!hidden.has(key)}
                onChange={(e) => toggles.setVisible(key, e.target.checked)}
              />
              <input
                type="checkbox"
                aria-label={`${key} 機能`}
                checked={!disabled.has(key)}
                disabled={hidden.has(key)}
                onChange={(e) => toggles.setEnabled(key, e.target.checked)}
              />{" "}
              {key}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
