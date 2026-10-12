import type {DesktopApp} from "../kernel/app";
import {createMatchmakingApp, type MatchmakingPort} from "./matchmaking";
import {createSettingsApp, type SettingsPorts} from "./settings";

export const createDesktopApps = ({
  flow,
  ...settings
}: {
  flow: MatchmakingPort;
} & SettingsPorts): readonly DesktopApp[] => [
  createMatchmakingApp({flow}),
  createSettingsApp(settings),
];
