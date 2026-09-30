import type {CSSProperties} from "react";

import {useDebugFlags} from "../../core/debug/flags";
import {usePointerLocked} from "../../core/input";
import {usePlayerControlLocked} from "../../core/playerControl";
import {useAimedObjectId} from "./aimStore";

const SIZE = 4;
const SIZE_AIMED = 8;

// 白い世界でも暗い背景でも見えるよう、白い点に暗い縁を付ける。クリックを邪魔しない
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

/** 画面中央の照準。pointer lock 中だけ表示し、狙っている物があれば少し大きくする。DOM オーバーレイ */
export function Reticle() {
  const locked = usePointerLocked();
  const {freeCamera} = useDebugFlags();
  const aimed = useAimedObjectId();
  // 別の演出がプレイヤーを預かっている間(俯瞰ビューなど)は、その演出が独自の照準を出すので隠す
  const taken = usePlayerControlLocked();
  if (!locked || freeCamera || taken) {
    return null;
  }
  return <div style={dotStyle(aimed === null ? SIZE : SIZE_AIMED)} />;
}
