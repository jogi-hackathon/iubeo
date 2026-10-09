import type {CSSProperties} from "react";

import {sceneNames} from ".";
import {useCoverState} from "../core/cover/coverStore";
import {useDebugFlags} from "../core/debug/flags";
import {
  type ToggleStore,
  useActiveToggles,
  useToggleStoreState,
} from "../core/toggles";
import {ROOM_FEATURE_KEYS, ROOM_PROP_KEYS} from "./RoomScene/props";
import {sceneTransitionManager} from "./sceneStore";
import {useSceneState, useTransitionState} from "./useScene";

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

/** 今マウントされているシーンのトグル(core/toggles)の、表示・機能の切り替え。今トグルを持つのは room だけ */
function ToggleRows({store}: {store: ToggleStore}) {
  const {hidden, disabled} = useToggleStoreState(store);
  return (
    <div style={{marginTop: 6}}>
      <div>room: 表示 / 機能</div>
      {ROOM_PROP_KEYS.map((key) => (
        <div key={key}>
          <input
            type="checkbox"
            aria-label={`${key} 表示`}
            checked={!hidden.has(key)}
            onChange={(e) => store.setVisible(key, e.target.checked)}
          />
          <input
            type="checkbox"
            aria-label={`${key} 機能`}
            checked={!disabled.has(key)}
            disabled={hidden.has(key)}
            onChange={(e) => store.setEnabled(key, e.target.checked)}
          />{" "}
          {key}
        </div>
      ))}
      <div style={{marginTop: 4}}>room: 機能のみ</div>
      {ROOM_FEATURE_KEYS.map((key) => (
        <div key={key}>
          <input
            type="checkbox"
            aria-label={`${key} 機能`}
            checked={!disabled.has(key)}
            onChange={(e) => store.setEnabled(key, e.target.checked)}
          />{" "}
          {key}
        </div>
      ))}
    </div>
  );
}

/** F10 で開くシーン管理パネル(VITE_ENABLE_DEBUG=true のときのみ)。sceneTransitionManager を直接操作する */
export function SceneDebugPanel() {
  const {scene} = useDebugFlags();
  const {current} = useSceneState();
  const transition = useTransitionState();
  const toggles = useActiveToggles();
  const {booting} = useCoverState();
  if (!scene) {
    return null;
  }

  const transitioning = transition.status === "transitioning";
  return (
    <div style={panelStyle}>
      <div>
        {transition.status === "idle"
          ? `idle: ${current}`
          : `transitioning: ${transition.from} -> ${transition.to}`}
      </div>
      <div style={rowStyle}>
        {sceneNames.map((name) => (
          <button
            key={name}
            type="button"
            // 起動の覆いの間と遷移中は、切り替えを始めない
            disabled={booting || transitioning || current === name}
            onClick={() => void sceneTransitionManager.goTo(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {toggles && <ToggleRows store={toggles} />}
    </div>
  );
}
