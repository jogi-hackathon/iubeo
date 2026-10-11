import {sceneNames} from ".";
import {useCoverState} from "../core/cover/coverStore";
import {rowStyle} from "../core/debug/ui";
import {
  type ToggleStore,
  useActiveToggles,
  useToggleStoreState,
} from "../core/toggles";
import {ROOM_FEATURE_KEYS, ROOM_PROP_KEYS} from "./RoomScene/props";
import {sceneTransitionManager} from "./sceneStore";
import {useSceneState, useTransitionState} from "./useScene";

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

/** dev パネルの Scene タブ。sceneTransitionManager を直接操作する */
export function SceneDebugPanel() {
  const {current} = useSceneState();
  const transition = useTransitionState();
  const toggles = useActiveToggles();
  const {booting} = useCoverState();
  const transitioning = transition.status === "transitioning";
  return (
    <>
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
            disabled={booting || transitioning || current === name}
            onClick={() => void sceneTransitionManager.goTo(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {toggles && <ToggleRows store={toggles} />}
    </>
  );
}
