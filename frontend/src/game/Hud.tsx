import {type CSSProperties, useEffect, useState} from "react";

import {useSpectatePhase} from "../core/spectate";
import {useGameFlow} from "../flow";
import {useGameState} from "./gameStore";
import {noticeLabels, phaseLine, resultLine} from "./hudText";

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
  const spectate = useSpectatePhase();
  const now = useNow(1000);

  const notice =
    flow.status === "idle" && flow.notice ? noticeLabels[flow.notice] : null;
  const shownNotice = useTransient(
    notice ?? resultLine(game.result),
    NOTICE_MS,
  );

  // 自分のタスクは出さない(依頼の伝票と机のメモ置きで知らせる)
  const lines: string[] = [];
  const phase = phaseLine(game, now);
  if (phase !== null) {
    lines.push(phase);
  }
  if (spectate === "spectating") {
    lines.push("観戦中(物には触れられません)");
  }
  if (shownNotice !== null) {
    lines.push(shownNotice);
  }

  if (lines.length === 0) {
    return null;
  }
  return (
    <div style={panelStyle}>
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
