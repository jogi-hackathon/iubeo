import {type CSSProperties, useEffect, useMemo, useState} from "react";

import {useMyPlayerId} from "../authority/useMyPlayerId";
import {useSpectatePhase} from "../core/spectate";
import {useGameFlow} from "../flow";
import {useObjectsState} from "../objects";
import {useGameState} from "./gameStore";
import {
  type HudLine,
  noticeLabels,
  phaseLine,
  resultLine,
  taskLine,
} from "./hudText";
import {stockColorsOf} from "./stockColors";

export const NOTICE_MS = 5000;

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

const useNow = (ms: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

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

export function Hud() {
  const flow = useGameFlow();
  const game = useGameState();
  const myPlayerId = useMyPlayerId();
  const spectate = useSpectatePhase();
  const now = useNow(1000);
  const {objects} = useObjectsState();

  const stockColors = useMemo(() => stockColorsOf(objects), [objects]);

  const notice =
    flow.status === "idle" && flow.notice ? noticeLabels[flow.notice] : null;
  const shownNotice = useTransient(
    notice ?? resultLine(game.result),
    NOTICE_MS,
  );

  const lines: HudLine[] = [];
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
    return null;
  }
  return (
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
