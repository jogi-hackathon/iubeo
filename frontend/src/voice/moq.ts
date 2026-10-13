import type * as Moq from "@moq/net";

const FRAME_SAMPLES = 960;
const SAMPLE_RATE = 48000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Watch = {sub?: Moq.Track.Subscriber};

export type MoqVoiceOptions = {
  url: string;
  token: string;
  room: string;
  id: string;
  onPeerAudio: (peer: string, opus: Uint8Array) => void;
  onError?: (message: string) => void;
  bitrate?: number;
  frameDurationMs?: number;
  complexity?: number;
};

export class MoqVoice {
  private Moq!: typeof import("@moq/net");
  private conn?: Moq.Connection.Established;
  private origin?: Moq.Origin.Producer;
  private track?: Moq.Track.Producer;
  private encoder?: AudioEncoder;
  private readonly subs = new Map<string, Watch>();
  private acc = new Float32Array(0);
  private tsUs = 0;
  private frameSamples = FRAME_SAMPLES;
  private ietf = false;
  private opts!: MoqVoiceOptions;

  async start(opts: MoqVoiceOptions): Promise<void> {
    this.opts = opts;
    const Moq = await import("@moq/net");
    this.Moq = Moq;

    const origin = new Moq.Origin.Producer();
    this.origin = origin;

    const mediaUrl = new URL(opts.url);
    mediaUrl.searchParams.set("jwt", opts.token);
    this.conn = await Moq.Connection.connect({
      url: mediaUrl,
      webtransport: {},
      publish: origin.consume(),
      consume: origin,
      signal: AbortSignal.timeout(15000),
    });
    this.ietf = !String(this.conn.version).startsWith("moq-lite");

    const broadcast = origin.createBroadcast(
      Moq.Path.from("vc-bench", opts.room, opts.id),
    );
    this.track = broadcast.createTrack("audio", {
      priority: 128,
      maxAge: Moq.Time.Milli(150),
    });
    broadcast.announce();

    this.encoder = new AudioEncoder({
      output: (chunk) => this.sendOpus(chunk),
      error: (e) => opts.onError?.(`encode: ${e.message}`),
    });
    this.frameSamples = Math.round(
      (SAMPLE_RATE * (opts.frameDurationMs ?? 20)) / 1000,
    );
    const config = {
      codec: "opus",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: opts.bitrate ?? 48000,
      latencyMode: "realtime",
    } as AudioEncoderConfig;
    try {
      this.encoder.configure({
        ...config,
        opus: {
          frameDuration: (opts.frameDurationMs ?? 20) * 1000,
          complexity: opts.complexity ?? 5,
        },
      } as AudioEncoderConfig);
    } catch {
      // opus 拡張が無い実装では、素の設定で続ける
      this.encoder.configure(config);
    }
  }

  private sendOpus(chunk: EncodedAudioChunk): void {
    const payload = new Uint8Array(chunk.byteLength);
    chunk.copyTo(payload);
    try {
      if (this.ietf) {
        const group = this.track!.appendGroup();
        group.writeFrame({
          timestamp: this.Moq.Time.Timestamp.fromMillis(Date.now()),
          payload,
        });
        group.close();
      } else {
        this.track!.appendDatagram(
          this.Moq.Time.Timestamp.fromMillis(Date.now()),
          payload,
        );
      }
    } catch {}
  }

  publishPcm(pcm: Float32Array, enabled: boolean): void {
    if (!enabled || !this.encoder) {
      return;
    }
    const merged = new Float32Array(this.acc.length + pcm.length);
    merged.set(this.acc);
    merged.set(pcm, this.acc.length);
    this.acc = merged;
    while (this.acc.length >= this.frameSamples) {
      const frame = this.acc.subarray(0, this.frameSamples).slice();
      this.acc = this.acc.subarray(this.frameSamples);
      const audio = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: this.frameSamples,
        numberOfChannels: 1,
        timestamp: this.tsUs,
        data: frame.buffer as ArrayBuffer,
      });
      this.tsUs += (this.frameSamples / SAMPLE_RATE) * 1e6;
      this.encoder.encode(audio);
      audio.close();
    }
  }

  get closed(): Promise<unknown> {
    return this.conn?.closed ?? new Promise(() => {});
  }

  handlePeerJoined(peer: string): void {
    void this.watchPeer(peer);
  }

  handlePeerLeft(peer: string): void {
    const watch = this.subs.get(peer);
    this.subs.delete(peer);
    watch?.sub?.close();
  }

  private async watchPeer(peer: string): Promise<void> {
    if (this.subs.has(peer) || !this.origin) {
      return;
    }
    const watch: Watch = {};
    this.subs.set(peer, watch);
    const req = this.origin.request(
      this.Moq.Path.from("vc-bench", this.opts.room, peer),
      {announced: true},
    );
    const since = performance.now();
    let warned = false;
    try {
      while (this.subs.get(peer) === watch) {
        const broadcast = req.active.peek();
        if (!broadcast) {
          if (!warned && performance.now() - since > 10_000) {
            warned = true;
            this.opts.onError?.(`moq: no broadcast for ${peer}`);
          }
          await sleep(100);
          continue;
        }
        const sub = broadcast
          .track("audio")
          .subscribe({maxAge: this.Moq.Time.Milli(150)});
        watch.sub = sub;
        await Promise.all([
          this.pumpDatagrams(peer, sub),
          this.pumpGroups(peer, sub),
        ]);
        sub.close();
        watch.sub = undefined;
        await sleep(500);
      }
    } finally {
      req.close();
    }
  }

  private async pumpDatagrams(
    peer: string,
    sub: Moq.Track.Subscriber,
  ): Promise<void> {
    try {
      for (;;) {
        const datagram = await sub.recvDatagram();
        if (!datagram) {
          return;
        }
        this.opts.onPeerAudio(peer, datagram.payload);
      }
    } catch {}
  }

  private async pumpGroups(
    peer: string,
    sub: Moq.Track.Subscriber,
  ): Promise<void> {
    try {
      for (;;) {
        const group = await sub.recvGroup();
        if (!group) {
          return;
        }
        for (;;) {
          const frame = await group.readFrame();
          if (!frame) {
            break;
          }
          this.opts.onPeerAudio(peer, frame.payload);
        }
      }
    } catch {}
  }

  close(): void {
    try {
      this.conn?.close();
    } catch {}
    try {
      this.encoder?.close();
    } catch {}
    for (const watch of this.subs.values()) {
      watch.sub?.close();
    }
    this.subs.clear();
    this.origin = undefined;
    this.track = undefined;
    this.conn = undefined;
  }
}
