import {useEffect, useState} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {mutedStyle, rowStyle} from "../core/debug/ui";
import {gameFlow, useGameFlow} from "../flow";
import {playerManager, usePlayersState} from "../player";
import {useSceneState} from "../scenes/useScene";

const short = (id: string) => id.slice(0, 8);

function Elapsed({since}: {since: string}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return <>{sec}秒</>;
}

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

export function GameFlowPanel() {
  const flow = useGameFlow();
  const {current: sceneName} = useSceneState();
  const idle = flow.status === "idle" || flow.status === "error";
  return (
    <>
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
          <div style={mutedStyle}>
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
        <div style={mutedStyle}>
          sandbox にセッション無しで居る。room などへ移ってから始める
        </div>
      )}
      {flow.status === "inSession" && <Players />}
    </>
  );
}
