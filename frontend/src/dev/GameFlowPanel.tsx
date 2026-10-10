import {type CSSProperties, useEffect, useState} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {useDebugFlags} from "../core/debug/flags";
import {gameFlow, useGameFlow} from "../flow";
import {playerManager, usePlayersState} from "../player";
import {useSceneState} from "../scenes/useScene";

// SceneDebugPanel(左上)の下に置く。ゲームの流れ(マッチング → sandbox)の唯一の入口は、今はこのパネルのボタン
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
const rowStyle: CSSProperties = {display: "flex", gap: 6, marginTop: 4};

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

/** セッションの参加者(席・接続・生死)。ServerAuthority のシーンにいる間だけ出る */
function Players() {
  const myPlayerId = useMyPlayerId();
  const {players} = usePlayersState();
  return (
    <>
      <InterpolationToggle />
      {players.length === 0 && <div>(参加者なし)</div>}
      {players.map((p) => (
        <div key={p.playerId}>
          seat {p.seat}: {short(p.playerId)}
          {p.playerId === myPlayerId ? " (you)" : ""} {p.connection}/{p.life}
        </div>
      ))}
    </>
  );
}

/**
 * ゲームの流れ(flow/)の状態と、マッチングの開始・取り消しのボタン。デバッグ(game)が有効なとき出す。
 * 開始はゲームの流れの startMatchmaking を 1 回呼ぶだけ(将来、チュートリアルの終わりから同じ関数を呼ぶ)。
 * 2 人目以降は、別のブラウザプロファイルかシークレットウィンドウで開く(Cookie を分ける)
 */
export function GameFlowPanel() {
  const {game} = useDebugFlags();
  const flow = useGameFlow();
  const {current: sceneName} = useSceneState();
  if (!game) {
    return null;
  }
  const idle = flow.status === "idle" || flow.status === "error";
  return (
    <div style={panelStyle}>
      <div>flow: {flow.status}</div>
      {flow.status === "idle" && flow.notice === "replaced" && (
        <div>別のタブで入り直したので、こちらは切れた(replaced)</div>
      )}
      {flow.status === "error" && <div>{flow.message}</div>}
      {flow.status === "queued" && (
        <>
          <div>you: {short(flow.playerId)}</div>
          <div>
            待機中
            {flow.queuedAt !== undefined && (
              <>
                {" "}
                · <Elapsed since={flow.queuedAt} />
              </>
            )}
          </div>
          <div style={{opacity: 0.7}}>
            IUBEO_MATCH_SIZE 人そろうと始まる(2
            人目以降は別のブラウザかシークレットウィンドウで開く)
          </div>
        </>
      )}
      {(flow.status === "entering" || flow.status === "inSession") && (
        <div>{flow.sessionId}</div>
      )}
      <div style={rowStyle}>
        <button
          type="button"
          // sandbox にいる間は、シーンの途中でオーソリティを切り替えられないので、room などから始める
          disabled={!idle || sceneName === "sandbox"}
          onClick={() => void gameFlow.startMatchmaking()}
        >
          start matchmaking
        </button>
        <button
          type="button"
          disabled={flow.status !== "queued" && flow.status !== "issuing"}
          onClick={() => void gameFlow.cancelMatchmaking()}
        >
          cancel
        </button>
      </div>
      {sceneName === "sandbox" && idle && (
        <div style={{opacity: 0.7}}>
          sandbox にセッション無しで居る。room などへ移ってから始める
        </div>
      )}
      {flow.status === "inSession" && <Players />}
    </div>
  );
}
