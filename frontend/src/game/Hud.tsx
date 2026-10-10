import {type CSSProperties, useEffect, useMemo, useState} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {useSpectatePhase} from "../core/spectate";
import {useGameFlow} from "../flow";
import {useObjectsState} from "../objects";
import {useGameState} from "./gameStore";
import {
  type HudLine,
  matchingLine,
  noticeLabels,
  phaseLine,
  resultLine,
  taskLine,
} from "./hudText";
import {stockColorsOf} from "./stockColors";

/** 通知(解散・破棄・決着など)を出しておく時間(ms) */
export const NOTICE_MS = 5000;

// Canvas の外の DOM オーバーレイ。本番(DEV パネル無し)でも出す。
// 開発用パネルは四隅にあるので、重ならないよう上中央に置く
const panelStyle: CSSProperties = {
  position: "fixed",
  top: 10,
  left: "50%",
  transform: "translateX(-50%)",
  boxSizing: "border-box",
  minWidth: 220,
  maxWidth: 420,
  padding: "8px 12px",
  font: "12px/1.7 ui-monospace, Menlo, monospace",
  color: "#fff",
  background: "rgba(0,0,0,0.62)",
  borderRadius: 4,
  pointerEvents: "none",
  zIndex: 9999,
};

/** ms ごとに今の時刻を返す(残り時間と待ち時間の表示用) */
const useNow = (ms: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

/** value が変わったら ms の間だけ覚えておく(通知を数秒出して消す用) */
const useTransient = (value: string | null, ms: number): string | null => {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (value === null) {
      return;
    }
    setShown(value);
    const id = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return shown;
};

/**
 * ゲームの HUD(DOM のオーバーレイ。Canvas の外)。
 * マッチングと待機の状態、フェーズ番号と残り時間、自分のタスク一覧(達成でチェック)、intermission、
 * 決着の結果、切れた理由(数秒だけ 1 行)を出す。読み込みと編集のタスクには、対象ファイルの色を付ける
 * (山の紙の色と見比べて選べるように)。値はサーバーから来た物を見せるだけで、判定はしない(ADR-0003)
 */
export function Hud() {
  const flow = useGameFlow();
  const game = useGameState();
  const myPlayerId = useMyPlayerId();
  const spectate = useSpectatePhase();
  const now = useNow(1000);
  const {objects} = useObjectsState();

  // 読み込みと編集の対象を、山の紙の色で見分けられるようにする(在庫にある間だけ分かる)
  const stockColors = useMemo(() => stockColorsOf(objects), [objects]);

  const notice =
    flow.status === "idle" && flow.notice ? noticeLabels[flow.notice] : null;
  const shownNotice = useTransient(
    notice ?? resultLine(game.result),
    NOTICE_MS,
  );

  const lines: HudLine[] = [];
  const matching = matchingLine(flow, game, now);
  if (matching !== null) {
    lines.push({text: matching});
  }
  const phase = phaseLine(game, now);
  if (phase !== null) {
    lines.push({text: phase});
  }
  if (game.phase) {
    const mine = game.phase.tasks.filter(
      (task) => task.assigneePlayerId === myPlayerId,
    );
    if (mine.length > 0) {
      lines.push({text: "自分のタスク:"});
      for (const task of mine) {
        lines.push(
          taskLine(
            task,
            task.targetFileId === null
              ? undefined
              : stockColors.get(task.targetFileId),
          ),
        );
      }
    }
  }
  if (spectate === "spectating") {
    lines.push({text: "観戦中(物には触れられません)"});
  }
  if (shownNotice !== null) {
    lines.push({text: shownNotice});
  }

  if (lines.length === 0) {
    return <EliminationFlash />;
  }
  return (
    <>
      <div style={panelStyle}>
        {lines.map((line, i) => (
          <div key={i} style={lineStyle}>
            {line.color !== undefined && (
              <span style={{...swatchStyle, background: line.color}} />
            )}
            <span>{line.text}</span>
          </div>
        ))}
      </div>
      <EliminationFlash />
    </>
  );
}

const lineStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

/** 読み込みと編集の対象ファイルの色(山の紙の色と見比べる) */
const swatchStyle: CSSProperties = {
  width: 10,
  height: 10,
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.7)",
  borderRadius: 2,
  flex: "none",
};

/** 脱落した瞬間に出す簡単な演出(演出が終わると観戦へ移る。core/spectate) */
function EliminationFlash() {
  const spectate = useSpectatePhase();
  if (spectate !== "eliminating") {
    return null;
  }
  return <div className="elimination-flash">脱落</div>;
}
