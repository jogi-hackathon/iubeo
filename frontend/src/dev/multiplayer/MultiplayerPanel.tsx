import {
  type CSSProperties,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {playerManager, usePlayersState} from "../../player";
import {devMultiplayerStatus} from "./session";

// SceneDebugPanel(左上)の下に置く。開発用ローカルマルチの間だけ出す
const panelStyle: CSSProperties = {
  position: "fixed",
  top: 80,
  left: 0,
  boxSizing: "border-box",
  width: 220,
  padding: "6px 8px",
  font: "11px/1.5 ui-monospace, Menlo, monospace",
  color: "#fff",
  background: "rgba(0,0,0,0.75)",
  zIndex: 10001,
};

const short = (id: string) => id.slice(0, 8);

/** 待機を始めてからの秒数。1 秒ごとに数え直す */
function Elapsed({since}: {since: string}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return <>{sec}秒</>;
}

/** 他のプレイヤーの位置を補間するか(比べる用) */
function InterpolationToggle() {
  const [enabled, setEnabled] = useState(playerManager.getInterpolation);
  return (
    <label style={{display: "block"}}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          playerManager.setInterpolation(e.target.checked);
          setEnabled(e.target.checked);
        }}
      />{" "}
      補間
    </label>
  );
}

/** 開発用ローカルマルチ(MultiplayerTestScene)の接続状況。マッチング待ち・接続状態・参加者を出す */
export function MultiplayerPanel() {
  const status = useSyncExternalStore(
    devMultiplayerStatus.subscribe,
    devMultiplayerStatus.get,
  );
  const {localPlayerId, players} = usePlayersState();
  if (status.phase === "idle") {
    return null;
  }
  return (
    <div style={panelStyle}>
      <div>multiplayer: {status.phase}</div>
      {status.phase === "error" && <div>{status.message}</div>}
      {status.phase === "queued" && (
        <>
          <div>you: {short(status.playerId)}</div>
          <div>
            待機中 · <Elapsed since={status.queuedAt} />
          </div>
          <div style={{opacity: 0.7}}>
            IUBEO_MATCH_SIZE 人そろうと始まる(2
            人目以降は別のブラウザかシークレットウィンドウで開く)
          </div>
        </>
      )}
      {status.phase === "connected" && (
        <>
          <div>
            {status.sessionId} ({status.socket})
          </div>
          <InterpolationToggle />
          {players.map((p) => (
            <div key={p.playerId}>
              seat {p.seat}: {short(p.playerId)}
              {p.playerId === localPlayerId ? " (you)" : ""} {p.connection}/
              {p.life}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
