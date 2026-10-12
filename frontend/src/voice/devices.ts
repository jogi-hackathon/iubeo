export type AudioDevice = {id: string; label: string};

export type AudioDeviceList = {
  inputs: readonly AudioDevice[];
  outputs: readonly AudioDevice[];
  canSelectOutput: boolean;
  needsPermission: boolean;
};

const PSEUDO_DEVICE_IDS = new Set(["", "default", "communications"]);

export const canSelectOutputDevice = (): boolean =>
  typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;

export const toAudioDeviceList = (
  infos: readonly MediaDeviceInfo[],
  canSelectOutput: boolean,
): AudioDeviceList => {
  const pick = (kind: MediaDeviceKind, fallback: string): AudioDevice[] =>
    infos
      .filter((d) => d.kind === kind && !PSEUDO_DEVICE_IDS.has(d.deviceId))
      .map((d, i) => ({
        id: d.deviceId,
        label: d.label || `${fallback} ${i + 1}`,
      }));
  return {
    inputs: pick("audioinput", "マイク"),
    outputs: pick("audiooutput", "スピーカー"),
    canSelectOutput,
    needsPermission: infos.some(
      (d) => d.kind === "audioinput" && (d.deviceId === "" || d.label === ""),
    ),
  };
};

export const createAudioDevices = () => {
  let state: AudioDeviceList = {
    inputs: [],
    outputs: [],
    canSelectOutput: canSelectOutputDevice(),
    needsPermission: false,
  };
  const listeners = new Set<() => void>();
  let watching = false;

  const refresh = (): void => {
    const media = globalThis.navigator?.mediaDevices;
    if (!media?.enumerateDevices) {
      return;
    }
    media.enumerateDevices().then(
      (infos) => {
        state = toAudioDeviceList(infos, canSelectOutputDevice());
        for (const l of Array.from(listeners)) {
          l();
        }
      },
      (e: unknown) => console.warn("[voice] enumerateDevices failed", e),
    );
  };

  const requestPermission = (): void => {
    const media = globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      return;
    }
    media.getUserMedia({audio: true}).then(
      (stream) => {
        stream.getTracks().forEach((t) => t.stop());
        refresh();
      },
      (e: unknown) => console.warn("[voice] mic permission denied", e),
    );
  };

  return {
    getState: (): AudioDeviceList => state,
    refresh,
    requestPermission,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!watching) {
        watching = true;
        globalThis.navigator?.mediaDevices?.addEventListener?.(
          "devicechange",
          refresh,
        );
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type AudioDevices = ReturnType<typeof createAudioDevices>;

export const audioDevices = createAudioDevices();
