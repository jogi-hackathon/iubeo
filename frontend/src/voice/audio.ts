import type {AudioSettings} from "../core/audioSettings";

const SAMPLE_RATE = 48000;
// 相手の声の再生音量。2 倍 (約 +6dB)。割れないよう最後にリミッターを通す
const PEER_GAIN = 2;
// datagram の到着の揺れを吸収するため、再生をこれだけ遅らせて並べる
const JITTER_LEAD_S = 0.06;

const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunk = (options.processorOptions && options.processorOptions.chunk) || 960;
    this.buf = new Float32Array(chunk);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let i = 0;
      while (i < ch.length) {
        const n = Math.min(ch.length - i, this.buf.length - this.len);
        this.buf.set(ch.subarray(i, i + n), this.len);
        this.len += n;
        i += n;
        if (this.len === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.len = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("iubeo-capture", Capture);
`;

const workletUrl = (): string =>
  URL.createObjectURL(
    new Blob([CAPTURE_WORKLET], {type: "application/javascript"}),
  );

export type Vec3 = {x: number; y: number; z: number};

export type AudioSettingsSource = {
  getState(): Readonly<AudioSettings>;
  subscribe(listener: () => void): () => void;
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

const openMicStream = async (deviceId: string | null): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints(deviceId));
  } catch (e) {
    if (deviceId === null) {
      throw e;
    }
    console.warn("[voice] selected mic unavailable; using default", e);
    return navigator.mediaDevices.getUserMedia(micConstraints(null));
  }
};

type PeerAudio = {
  gain: GainNode;
  panner: PannerNode;
  nextAt: number;
};

export type VoiceAudio = {
  context: AudioContext;
  readonly state: AudioContextState;
  resume(): Promise<void>;
  startMic(onPcm: (pcm: Float32Array) => void): Promise<void>;
  hasMic(): boolean;
  feed(peer: string, pcm: Float32Array): void;
  removePeer(peer: string): void;
  setPeerPosition(peer: string, pos: Vec3): void;
  setListener(pos: Vec3, forward: Vec3, up: Vec3): void;
  close(): void;
};

export const createVoiceAudio = (
  settingsSource: AudioSettingsSource,
): VoiceAudio => {
  const ctx: SinkSelectableContext = new AudioContext({
    sampleRate: SAMPLE_RATE,
  });
  const peers = new Map<string, PeerAudio>();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);
  const voiceBus = ctx.createGain();
  voiceBus.connect(limiter);
  const micGain = ctx.createGain();
  let micStream: MediaStream | undefined;
  let micSource: MediaStreamAudioSourceNode | undefined;
  let micNode: AudioWorkletNode | undefined;
  let micDeviceId: string | null = null;
  let micRequested: string | null = null;
  let micSwitch: Promise<void> = Promise.resolve();
  let workletReady: Promise<void> | undefined;
  let closed = false;

  let settings = settingsSource.getState();
  let sinkRequested: string | null = null;
  let sinkSwitch: Promise<void> = Promise.resolve();

  const applySink = (next: string | null) => {
    const setSinkId = ctx.setSinkId?.bind(ctx);
    if (next === sinkRequested || !setSinkId) {
      return;
    }
    sinkRequested = next;
    sinkSwitch = sinkSwitch.then(async () => {
      if (closed || next !== sinkRequested) {
        return;
      }
      try {
        await setSinkId(next ?? "");
      } catch (e) {
        console.warn("[voice] selected speaker unavailable; using default", e);
        await setSinkId("").catch(() => {});
      }
    });
  };

  const attachMic = async (deviceId: string | null): Promise<void> => {
    const stream = await openMicStream(deviceId);
    if (closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    micSource?.disconnect();
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = stream;
    micDeviceId = deviceId;
    micSource = ctx.createMediaStreamSource(stream);
    micSource.connect(micGain);
  };

  const applySettings = () => {
    settings = settingsSource.getState();
    voiceBus.gain.value = settings.voiceVolume;
    micGain.gain.value = settings.micVolume;
    applySink(settings.outputDeviceId);
    if (micNode && settings.inputDeviceId !== micRequested) {
      const wanted = settings.inputDeviceId;
      micRequested = wanted;
      micSwitch = micSwitch
        .then(() =>
          wanted === micRequested && wanted !== micDeviceId
            ? attachMic(wanted)
            : undefined,
        )
        .catch((e: unknown) => console.warn("[voice] mic switch failed", e));
    }
  };
  applySettings();
  const offSettings = settingsSource.subscribe(applySettings);

  const loadWorklet = (): Promise<void> => {
    workletReady ??= ctx.audioWorklet.addModule(workletUrl());
    return workletReady;
  };

  const ensurePeer = (peer: string): PeerAudio => {
    let p = peers.get(peer);
    if (!p) {
      const gain = ctx.createGain();
      gain.gain.value = PEER_GAIN;
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 5;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1;
      gain.connect(panner);
      panner.connect(voiceBus);
      p = {gain, panner, nextAt: 0};
      peers.set(peer, p);
    }
    return p;
  };

  const audio: VoiceAudio = {
    context: ctx,

    get state(): AudioContextState {
      return ctx.state;
    },

    async resume(): Promise<void> {
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
    },

    async startMic(onPcm: (pcm: Float32Array) => void): Promise<void> {
      if (micNode) {
        return;
      }
      await loadWorklet();
      micRequested = settings.inputDeviceId;
      await attachMic(micRequested);
      if (closed) {
        throw new Error("voice audio closed");
      }
      const node = new AudioWorkletNode(ctx, "iubeo-capture", {
        processorOptions: {chunk: 960},
      });
      node.port.onmessage = (e: MessageEvent) => onPcm(e.data as Float32Array);
      micGain.connect(node);
      micNode = node;
      applySettings();
    },

    hasMic(): boolean {
      return micNode !== undefined;
    },

    feed(peer: string, pcm: Float32Array): void {
      if (pcm.length === 0) {
        return;
      }
      const p = ensurePeer(peer);
      const buf = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
      buf.getChannelData(0).set(pcm);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(p.gain);
      const now = ctx.currentTime;
      if (p.nextAt < now + 0.01 || p.nextAt > now + 0.5) {
        p.nextAt = now + JITTER_LEAD_S;
      }
      source.start(p.nextAt);
      p.nextAt += pcm.length / SAMPLE_RATE;
    },

    removePeer(peer: string): void {
      const p = peers.get(peer);
      if (!p) {
        return;
      }
      try {
        p.gain.disconnect();
        p.panner.disconnect();
      } catch {
        /* already disconnected */
      }
      peers.delete(peer);
    },

    setPeerPosition(peer: string, pos: Vec3): void {
      const p = ensurePeer(peer);
      p.panner.positionX.value = pos.x;
      p.panner.positionY.value = pos.y;
      p.panner.positionZ.value = pos.z;
    },

    setListener(pos: Vec3, forward: Vec3, up: Vec3): void {
      const l = ctx.listener;
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    },

    close(): void {
      closed = true;
      offSettings();
      try {
        micNode?.port.close();
      } catch {}
      micStream?.getTracks().forEach((t) => t.stop());
      for (const peer of peers.keys()) {
        audio.removePeer(peer);
      }
      void ctx.close().catch(() => {});
    },
  };

  return audio;
};
