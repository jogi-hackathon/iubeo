import type {DesktopApp} from "../kernel/app";
import {createMatchmakingApp, type MatchmakingPort} from "./matchmaking";
import {createSettingsApp, type MouseSettingsPort} from "./settings";

export const createDesktopApps = ({
  flow,
  mouse,
}: {
  flow: MatchmakingPort;
  mouse: MouseSettingsPort;
}): readonly DesktopApp[] => [
  createMatchmakingApp({flow}),
  createSettingsApp({mouse}),
];
