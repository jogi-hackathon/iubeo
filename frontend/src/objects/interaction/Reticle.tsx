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
const VOICE_RING_SIZE = 20;

const dotStyle = (size: number): CSSProperties => ({
  position: "fixed",
  top: "50%",
  left: "50%",
  width: size,
  height: size,
  transform: "translate(-50%, -50%)",
  boxSizing: "border-box",
  border: "1px solid #1a1a1a",
  borderRadius: "50%",
  background: "#ffffff",
  pointerEvents: "none",
  zIndex: 10000,
});

/** 通話の状態を、照準の周りの細い輪だけで示す（HUD は足さない） */
const voiceRingStyle = (
  status: "idle" | "connecting" | "ready" | "unavailable",
  transmitting: boolean,
  muted: boolean,
): CSSProperties => {
  const color = transmitting ? "#3fb950" : muted ? "#e63946" : "#8a8a8a";
  const opacity =
    status !== "ready" ? 0 : transmitting ? 0.9 : muted ? 0.7 : 0.25;
  return {
    position: "fixed",
    top: "50%",
    left: "50%",
    width: VOICE_RING_SIZE,
    height: VOICE_RING_SIZE,
    transform: "translate(-50%, -50%)",
    boxSizing: "border-box",
    border: `1.5px solid ${color}`,
    borderRadius: "50%",
    opacity,
    transition: "opacity 120ms linear",
    pointerEvents: "none",
    zIndex: 9999,
  };
};

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

/** 画面中央の照準。pointer lock 中だけ表示し、狙っている物があれば少し大きくする。DOM オーバーレイ */
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
  return (
    <>
      <div
        style={voiceRingStyle(voice.status, voice.transmitting, voice.muted)}
      />
      <div style={dotStyle(aimed === null ? SIZE : SIZE_AIMED)} />
      {hint && <div style={HINT_STYLE}>V で通話 / M でミュート</div>}
    </>
  );
}
