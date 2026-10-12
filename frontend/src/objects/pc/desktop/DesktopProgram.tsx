import {useEffect} from "react";

import {audioManager} from "../../../core/audio/audioManager";
import {audioSettingsStore} from "../../../core/audioSettings";
import {graphicsStore} from "../../../core/graphics";
import {mouseSettingsStore} from "../../../core/input/mouseSettings";
import {gameFlow} from "../../../flow";
import type {PcProgram, PcProgramProps} from "../program";
import {searchProgram} from "../search/SearchProgram";
import {createDesktopApps} from "./apps";
import {DesktopScreen} from "./DesktopScreen";

let screen: DesktopScreen | null = null;

/** デスクトップは 1 つだけ作り、部屋を出入りしても開いた窓などはそのまま残す */
export const desktopScreen = (): DesktopScreen => {
  screen ??= new DesktopScreen(
    createDesktopApps({
      flow: gameFlow,
      mouse: mouseSettingsStore,
      graphics: graphicsStore,
      audio: audioSettingsStore,
      devices: audioManager.devices,
    }),
  );
  return screen;
};

/**
 * 部屋の PC で動く 2000 風のデスクトップ(接続と設定のアプリを開く)。
 * pointer lock のまま仮想カーソルで操作し、画面が視界のほとんどを占めるまで寄る
 */
function DesktopProgram({using}: PcProgramProps) {
  const {shell} = desktopScreen();

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
  // 部屋の PC は電源を落とさない。離れても、開いた窓や時計が映ったまま
  alwaysOn: true,
  screen: desktopScreen,
  // 部屋で待っている間に、試合の PC で使う検索のエンジンを先に取っておく(PC に近づいたとき)
  prewarm: searchProgram.prewarm,
  Runner: DesktopProgram,
};
