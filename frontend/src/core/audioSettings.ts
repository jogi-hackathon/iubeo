import {storageManager} from "./storage";

export interface AudioSettings {
  gameVolume: number;
  voiceVolume: number;
  micVolume: number;
  outputDeviceId: string | null;
  inputDeviceId: string | null;
  soundNoticeAccepted: boolean;
}

export const MAX_GAME_VOLUME = 1;
export const MAX_VOICE_VOLUME = 2;
export const MAX_MIC_VOLUME = 2;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  gameVolume: 1,
  voiceVolume: 1,
  micVolume: 1,
  outputDeviceId: null,
  inputDeviceId: null,
  soundNoticeAccepted: false,
};

const volume = (raw: unknown, max: number, fallback: number): number =>
  typeof raw === "number" && Number.isFinite(raw)
    ? Math.min(max, Math.max(0, raw))
    : fallback;

const deviceId = (raw: unknown): string | null =>
  typeof raw === "string" && raw !== "" ? raw : null;

export const parseAudioSettings = (raw: unknown): AudioSettings => {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_AUDIO_SETTINGS;
  }
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_AUDIO_SETTINGS;
  return {
    gameVolume: volume(r.gameVolume, MAX_GAME_VOLUME, d.gameVolume),
    voiceVolume: volume(r.voiceVolume, MAX_VOICE_VOLUME, d.voiceVolume),
    micVolume: volume(r.micVolume, MAX_MIC_VOLUME, d.micVolume),
    outputDeviceId: deviceId(r.outputDeviceId),
    inputDeviceId: deviceId(r.inputDeviceId),
    soundNoticeAccepted: r.soundNoticeAccepted === true,
  };
};

export const audioSettingsStore = storageManager.defineStore<AudioSettings>({
  key: "audio",
  defaults: DEFAULT_AUDIO_SETTINGS,
  parse: parseAudioSettings,
});
