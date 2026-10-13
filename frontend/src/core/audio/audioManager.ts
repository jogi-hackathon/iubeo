import {type AudioSettings, audioSettingsStore} from "../audioSettings";
import {createAudioDevices} from "./devices";
import type {Vec3} from "./sfx/types";

const SAMPLE_RATE = 48000;
const LEVEL_FFT_SIZE = 1024;

export type AudioSettingsSource = {
  getState(): Readonly<AudioSettings>;
  subscribe(listener: () => void): () => void;
};

export type MicHandle = {
  node: AudioNode;
  release(): void;
};

export type AudioManagerDeps = {
  settings?: AudioSettingsSource;
  createContext?: () => AudioContext;
  mediaDevices?: () => MediaDevices | undefined;
};

type SinkSelectableContext = AudioContext & {
  setSinkId?(sinkId: string): Promise<void>;
};

const micConstraints = (deviceId: string | null): MediaStreamConstraints => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    ...(deviceId === null ? {} : {deviceId: {exact: deviceId}}),
  },
});

export const createAudioManager = ({
  settings = audioSettingsStore,
  createContext = () => new AudioContext({sampleRate: SAMPLE_RATE}),
  mediaDevices = () => globalThis.navigator?.mediaDevices,
}: AudioManagerDeps = {}) => {
  const devices = createAudioDevices({mediaDevices});

  type Graph = {
    ctx: SinkSelectableContext;
    master: GainNode;
    gameBus: GainNode;
    voiceBus: GainNode;
    micGain: GainNode;
    analyser: AnalyserNode;
    levelBuf: Float32Array<ArrayBuffer>;
  };
  let graph: Graph | undefined;
  let muted = true;

  let sinkRequested: string | null = null;
  let sinkSwitch: Promise<void> = Promise.resolve();

  let micRefs = 0;
  let micStream: MediaStream | undefined;
  let micSource: MediaStreamAudioSourceNode | undefined;
  let micAttachedFor: string | null = null;
  let micRequested: string | null = null;
  let micSwitch: Promise<void> = Promise.resolve();

  const applySink = (g: Graph, next: string | null) => {
    const setSinkId = g.ctx.setSinkId?.bind(g.ctx);
    if (next === sinkRequested || !setSinkId) {
      return;
    }
    sinkRequested = next;
    sinkSwitch = sinkSwitch.then(async () => {
      if (next !== sinkRequested) {
        return;
      }
      try {
        await setSinkId(next ?? "");
      } catch (e) {
        console.warn("[audio] selected speaker unavailable; using default", e);
        await setSinkId("").catch(() => {});
      }
    });
  };

  const openMicStream = async (
    deviceId: string | null,
  ): Promise<MediaStream> => {
    const media = mediaDevices();
    if (!media?.getUserMedia) {
      throw new Error("mediaDevices unavailable");
    }
    try {
      return await media.getUserMedia(micConstraints(deviceId));
    } catch (e) {
      if (deviceId === null) {
        throw e;
      }
      console.warn("[audio] selected mic unavailable; using default", e);
      return media.getUserMedia(micConstraints(null));
    }
  };

  const detachMic = () => {
    micSource?.disconnect();
    micStream?.getTracks().forEach((t) => t.stop());
    micSource = undefined;
    micStream = undefined;
    micRequested = null;
  };

  const reconcileMic = async (): Promise<void> => {
    if (micRefs === 0) {
      detachMic();
      return;
    }
    const wanted = settings.getState().inputDeviceId;
    if (micStream && micAttachedFor === wanted) {
      return;
    }
    micRequested = wanted;
    const stream = await openMicStream(wanted);
    if (micRefs === 0) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const g = ensure();
    micSource?.disconnect();
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = stream;
    micAttachedFor = wanted;
    micSource = g.ctx.createMediaStreamSource(stream);
    micSource.connect(g.micGain);
  };

  const syncMic = (): Promise<void> => {
    const run = micSwitch.then(reconcileMic);
    micSwitch = run.catch(() => {
      micRequested = micStream ? micAttachedFor : null;
    });
    return run;
  };

  const applySettings = () => {
    if (!graph) {
      return;
    }
    const s = settings.getState();
    graph.gameBus.gain.value = s.gameVolume;
    graph.voiceBus.gain.value = s.voiceVolume;
    graph.micGain.gain.value = s.micVolume;
    applySink(graph, s.outputDeviceId);
    if (micRefs > 0 && s.inputDeviceId !== micRequested) {
      micRequested = s.inputDeviceId;
      syncMic().catch((e: unknown) =>
        console.warn("[audio] mic switch failed", e),
      );
    }
  };

  const ensure = (): Graph => {
    if (graph) {
      return graph;
    }
    const ctx: SinkSelectableContext = createContext();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    limiter.connect(master);
    const gameBus = ctx.createGain();
    gameBus.connect(limiter);
    const voiceBus = ctx.createGain();
    voiceBus.connect(limiter);
    const micGain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = LEVEL_FFT_SIZE;
    micGain.connect(analyser);
    graph = {
      ctx,
      master,
      gameBus,
      voiceBus,
      micGain,
      analyser,
      levelBuf: new Float32Array(LEVEL_FFT_SIZE),
    };
    applySettings();
    return graph;
  };

  settings.subscribe(applySettings);

  const unlock = (): void => {
    if (graph?.ctx.state === "suspended") {
      void graph.ctx.resume().catch(() => {});
    }
  };

  const setMuted = (next: boolean): void => {
    muted = next;
    if (graph) {
      graph.master.gain.value = muted ? 0 : 1;
    }
  };

  const setListener = (pos: Vec3, forward: Vec3, up: Vec3): void => {
    if (!graph) {
      return;
    }
    const l = graph.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
      return;
    }
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  };

  const acquireMic = async (): Promise<MicHandle> => {
    const g = ensure();
    unlock();
    micRefs += 1;
    let released = false;
    const handle: MicHandle = {
      node: g.micGain,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        micRefs -= 1;
        if (micRefs === 0) {
          syncMic().catch(() => {});
        }
      },
    };
    try {
      await syncMic();
    } catch (e) {
      handle.release();
      throw e;
    }
    return handle;
  };

  const micLevel = (): number => {
    if (!graph || !micStream) {
      return 0;
    }
    graph.analyser.getFloatTimeDomainData(graph.levelBuf);
    let peak = 0;
    for (const v of graph.levelBuf) {
      peak = Math.max(peak, Math.abs(v));
    }
    return Math.min(1, Math.sqrt(peak));
  };

  const micMeter = {
    start: (): (() => void) => {
      let handle: MicHandle | undefined;
      let stopped = false;
      acquireMic().then(
        (h) => {
          if (stopped) {
            h.release();
          } else {
            handle = h;
          }
        },
        (e: unknown) => console.warn("[audio] mic meter unavailable", e),
      );
      return () => {
        stopped = true;
        handle?.release();
        handle = undefined;
      };
    },
    level: micLevel,
  };

  return {
    devices,
    context: (): AudioContext => ensure().ctx,
    gameBus: (): GainNode => ensure().gameBus,
    voiceBus: (): GainNode => ensure().voiceBus,
    unlock,
    setMuted,
    setListener,
    acquireMic,
    micLevel,
    micMeter,
  };
};

export type AudioManager = ReturnType<typeof createAudioManager>;

export const audioManager = createAudioManager();
