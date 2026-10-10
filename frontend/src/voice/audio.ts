/**
 * VC の音の出入り口。マイクを AudioWorklet で 20ms ずつ取り出し、
 * 他の人から届いた PCM を PannerNode（距離減衰）へ流す。
 *
 * 位置はゲームの transforms（サーバーの正）を使う。ここは音響だけを持ち、ネットワークは知らない
 */

const SAMPLE_RATE = 48000;

// マイクの PCM を 20ms（960 サンプル）ずつ postMessage する worklet（esbuild では別ファイルを出せないので Blob）
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

export const createVoiceAudio = (): VoiceAudio => {
  const ctx = new AudioContext({sampleRate: SAMPLE_RATE});
  const peers = new Map<string, PeerAudio>();
  let micStream: MediaStream | undefined;
  let micNode: AudioWorkletNode | undefined;
  let workletReady: Promise<void> | undefined;

  const loadWorklet = (): Promise<void> => {
    workletReady ??= ctx.audioWorklet.addModule(workletUrl());
    return workletReady;
  };

  const ensurePeer = (peer: string): PeerAudio => {
    let p = peers.get(peer);
    if (!p) {
      const gain = ctx.createGain();
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      // 3m までは減衰させず、40m でほぼ聞こえない（区画の中の会話用）
      panner.refDistance = 3;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1.4;
      gain.connect(panner);
      panner.connect(ctx.destination);
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

    /** ユーザーの操作（クリック・キー）の中で呼ぶ。自動再生の制限を解く */
    async resume(): Promise<void> {
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
    },

    /** マイクを取得して、20ms ごとの PCM を onPcm へ渡す。既に取得済みなら何もしない */
    async startMic(onPcm: (pcm: Float32Array) => void): Promise<void> {
      if (micNode) {
        return;
      }
      await loadWorklet();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      micStream = stream;
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "iubeo-capture", {
        processorOptions: {chunk: 960},
      });
      node.port.onmessage = (e: MessageEvent) => onPcm(e.data as Float32Array);
      source.connect(node);
      micNode = node;
    },

    hasMic(): boolean {
      return micNode !== undefined;
    },

    /** 他の人の PCM を、今の位置に向けて鳴らす（chunk ごとに先読みして繋ぐ） */
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
      // 30ms 先読み。遅れが溜まった（>500ms）か、途切れたら、今の位置に置き直す
      if (p.nextAt < now + 0.02 || p.nextAt > now + 0.5) {
        p.nextAt = now + 0.03;
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
      try {
        micNode?.port.close();
      } catch {
        /* ignore */
      }
      micStream?.getTracks().forEach((t) => t.stop());
      for (const peer of peers.keys()) {
        audio.removePeer(peer);
      }
      void ctx.close().catch(() => {});
    },
  };

  return audio;
};
