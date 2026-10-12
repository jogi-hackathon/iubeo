import {useEffect} from "react";

import type {PcProgram, PcProgramProps} from "../program";
import {searchProgram} from "../search/SearchProgram";
import {pcSession} from "../session";
import {DESKTOP_APPS} from "./apps";
import {DesktopScreen} from "./DesktopScreen";

let screen: DesktopScreen | null = null;

/** デスクトップは 1 つだけ作り、部屋を出入りしても開いた窓などはそのまま残す */
export const desktopScreen = (): DesktopScreen => {
  screen ??= new DesktopScreen(DESKTOP_APPS);
  return screen;
};

/**
 * 部屋の PC で動く 2000 風のデスクトップ(マッチングと設定のアプリを開く)。
 * pointer lock のまま仮想カーソルで操作し、画面が視界のほとんどを占めるまで寄る
 */
function DesktopProgram({using}: PcProgramProps) {
  const {shell} = desktopScreen();

  useEffect(() => shell.onLeave(() => pcSession.leave()), [shell]);

  useEffect(() => {
    if (!using) {
      shell.settle();
    }
  }, [using, shell]);

  return null;
}

export const desktopProgram: PcProgram = {
  pointer: "virtual",
  view: {fill: 0.9},
  screen: desktopScreen,
  // 部屋で待っている間に、試合の PC で使う検索のエンジンを先に取っておく(PC に近づいたとき)
  prewarm: searchProgram.prewarm,
  Runner: DesktopProgram,
};
