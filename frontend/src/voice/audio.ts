import type {AudioManager, MicHandle} from "../core/audio/audioManager";
import type {Vec3} from "../core/audio/sfx/types";

const SAMPLE_RATE = 48000;
const PEER_GAIN_2X = 2;
const PLAYBACK_JITTER_BUFFER_S = 0.06;

const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunk = (options.processorOptions && options.processorOptions.chunk) || 960;
    this.buf = new Float32Array(chunk);
    this.len = 0;
    this.stopped = false;
    this.port.onmessage = () => {
      this.stopped = true;
    };
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
    return !this.stopped;
  }
}
registerProcessor("iubeo-capture", Capture);
`;

const workletUrl = (): string =>
  URL.createObjectURL(
    new Blob([CAPTURE_WORKLET], {type: "application/javascript"}),
  );

type PeerAudio = {
  gain: GainNode;
  panner: PannerNode;
  nextAt: number;
};

export type VoiceAudio = {
  context: AudioContext;
  startMic(onPcm: (pcm: Float32Array) => void): Promise<void>;
  hasMic(): boolean;
  feed(peer: string, pcm: Float32Array): void;
  removePeer(peer: string): void;
  setPeerPosition(peer: string, pos: Vec3): void;
  close(): void;
};

const workletLoads = new WeakMap<AudioContext, Promise<void>>();

const loadWorklet = (ctx: AudioContext): Promise<void> => {
  let loaded = workletLoads.get(ctx);
  if (!loaded) {
    loaded = ctx.audioWorklet.addModule(workletUrl());
    loaded.catch(() => workletLoads.delete(ctx));
    workletLoads.set(ctx, loaded);
  }
  return loaded;
};

export type VoiceAudioHost = Pick<
  AudioManager,
  "context" | "voiceBus" | "acquireMic"
>;

export const createVoiceAudio = (host: VoiceAudioHost): VoiceAudio => {
  const ctx = host.context();
  const peers = new Map<string, PeerAudio>();
  let micHandle: MicHandle | undefined;
  let micNode: AudioWorkletNode | undefined;
  let closed = false;

  const ensurePeer = (peer: string): PeerAudio => {
    let p = peers.get(peer);
    if (!p) {
      const gain = ctx.createGain();
      gain.gain.value = PEER_GAIN_2X;
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 5;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1;
      gain.connect(panner);
      panner.connect(host.voiceBus());
      p = {gain, panner, nextAt: 0};
      peers.set(peer, p);
    }
    return p;
  };

  const audio: VoiceAudio = {
    context: ctx,

    async startMic(onPcm: (pcm: Float32Array) => void): Promise<void> {
      if (micNode) {
        return;
      }
      await loadWorklet(ctx);
      if (closed) {
        throw new Error("voice audio closed");
      }
      const handle = await host.acquireMic();
      if (closed) {
        handle.release();
        throw new Error("voice audio closed");
      }
      const node = new AudioWorkletNode(ctx, "iubeo-capture", {
        processorOptions: {chunk: 960},
      });
      node.port.onmessage = (e: MessageEvent) => onPcm(e.data as Float32Array);
      handle.node.connect(node);
      micHandle = handle;
      micNode = node;
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
        p.nextAt = now + PLAYBACK_JITTER_BUFFER_S;
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
      } catch {}
      peers.delete(peer);
    },

    setPeerPosition(peer: string, pos: Vec3): void {
      const p = ensurePeer(peer);
      p.panner.positionX.value = pos.x;
      p.panner.positionY.value = pos.y;
      p.panner.positionZ.value = pos.z;
    },

    close(): void {
      closed = true;
      if (micNode) {
        try {
          micHandle?.node.disconnect(micNode);
          micNode.port.postMessage("stop");
          micNode.port.close();
        } catch {}
      }
      micHandle?.release();
      micHandle = undefined;
      micNode = undefined;
      for (const peer of Array.from(peers.keys())) {
        audio.removePeer(peer);
      }
    },
  };

  return audio;
};
