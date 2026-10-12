import type {CSSProperties} from "react";
import {useEffect, useState} from "react";

import {useDebugFlags} from "../../core/debug/flags";
import {usePointerLocked} from "../../core/input";
import {usePlayerControlLocked} from "../../core/playerControl";
import {useSpectatePhase} from "../../core/spectate";
import {useVoiceState} from "../../voice";
import {useAimedObjectId} from "./aimStore";

const SIZE = 4;
const SIZE_AIMED = 8;
// 輪は点より少し大きくしないと中の抜けが見えない
const SIZE_HOLLOW = 7;

/**
 * 照準の点。声が出ているときは塗りつぶし、ミュート中(声が届いていないとき)は
 * 中を抜いた輪にして、色を使わずに状態が分かるようにする
 */
const dotStyle = (size: number, hollow: boolean): CSSProperties => ({
  position: "fixed",
  top: "50%",
  left: "50%",
  width: size,
  height: size,
  transform: "translate(-50%, -50%)",
  boxSizing: "border-box",
  border: hollow ? "1.5px solid #ffffff" : "1px solid #1a1a1a",
  borderRadius: "50%",
  background: hollow ? "transparent" : "#ffffff",
  boxShadow: hollow ? "0 0 0 1px #1a1a1a, inset 0 0 0 1px #1a1a1a" : "none",
  pointerEvents: "none",
  zIndex: 10000,
});

const HINT_STYLE: CSSProperties = {
  position: "fixed",
  top: "calc(50% + 26px)",
  left: "50%",
  transform: "translateX(-50%)",
  color: "#ffffff",
  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  font: "12px/1.4 monospace",
  pointerEvents: "none",
  zIndex: 10000,
  opacity: 0.85,
};

export function Reticle() {
  const locked = usePointerLocked();
  const {freeCamera} = useDebugFlags();
  const spectate = useSpectatePhase();
  const aimed = useAimedObjectId();
  const taken = usePlayerControlLocked();
  const voice = useVoiceState();
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (voice.status !== "ready") {
      return;
    }
    setHint(true);
    const id = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(id);
  }, [voice.status]);

  if (!locked || freeCamera || spectate !== "alive" || taken) {
    return null;
  }
  // VC につながっているのに声が届いていない(ミュート中・マイクが取れていない)ときだけ輪にする
  const hollow = voice.status === "ready" && !voice.transmitting;
  const size = hollow ? SIZE_HOLLOW : SIZE;
  return (
    <>
      <div style={dotStyle(aimed === null ? size : SIZE_AIMED, hollow)} />
      {hint && <div style={HINT_STYLE}>M でミュート</div>}
    </>
  );
}
