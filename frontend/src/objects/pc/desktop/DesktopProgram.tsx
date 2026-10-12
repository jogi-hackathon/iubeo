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

// 部屋を出入りしても開いた窓などを残すため、デスクトップは 1 つだけ作る
export const desktopScreen = (): DesktopScreen => {
  screen ??= new DesktopScreen(
    createDesktopApps({
      flow: gameFlow,
      mouse: mouseSettingsStore,
      graphics: graphicsStore,
      audio: audioSettingsStore,
      devices: audioManager.devices,
      micMeter: audioManager.micMeter,
    }),
  );
  return screen;
};

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
  alwaysOn: true,
  screen: desktopScreen,
  prewarm: searchProgram.prewarm,
  Runner: DesktopProgram,
};
